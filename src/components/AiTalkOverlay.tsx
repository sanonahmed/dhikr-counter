import React, { useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, Mic, MicOff, Plus, Volume2, VolumeX, X } from 'lucide-react';
import type { Language } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { resolveAdminServerUrl } from '../utils/adminSession';
import { cn } from '../utils/cn';
import { toPlainText } from '../../shared/plainText.js';

interface AiTalkOverlayProps { open: boolean; onClose: () => void; language: Language; }
interface ChatMessage { role: 'user' | 'assistant'; content: string; id: number; }
interface SpeechRecognitionResultLike { transcript: string; isFinal?: boolean; }
interface SpeechRecognitionEventLike { resultIndex?: number; results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>; }
interface SpeechRecognitionErrorLike { error: string; }
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor; };

function chatEndpoint(): string { return `${resolveAdminServerUrl()}/api/ai/talk`; }

export const AiTalkOverlay: React.FC<AiTalkOverlayProps> = ({ open, onClose, language }) => {
  const t = getTranslations(language).aiTalk;
  const [replyLanguage, setReplyLanguage] = useState<Language>('bn');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [interim, setInterim] = useState('');
  const [pendingText, setPendingText] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const transcriptTimerRef = useRef<number | null>(null);
  const pendingFinalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const requestRef = useRef<AbortController | null>(null);
  const autoListenRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const speechTokenRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const replyLanguageRef = useRef<Language>(replyLanguage);
  replyLanguageRef.current = replyLanguage;
  messagesRef.current = messages;
  const startRecognitionRef = useRef<() => void>(() => {});
  const askAssistantRef = useRef<(content: string) => void>(() => {});
  const submitTranscriptRef = useRef<() => void>(() => {});
  const nextMessageId = useRef(1);
  /** Wait for a full three seconds of silence before answering, so pauses between thoughts are not treated as the end. */
  const endOfSpeechDelay = 3000;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => micRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      autoListenRef.current = false;
      busyRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      speakingRef.current = false;
      speechTokenRef.current += 1;
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
      if (transcriptTimerRef.current !== null) window.clearTimeout(transcriptTimerRef.current);
      transcriptTimerRef.current = null;
      pendingFinalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      window.speechSynthesis?.cancel();
      setListening(false);
      setContinuousMode(false);
      setInterim('');
      setSpeakingId(null);
    };
  }, [open]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, listening, interim, pendingText]);

  if (!open) return null;

  const scheduleAutoListen = () => {
    if (!autoListenRef.current || busyRef.current || speakingRef.current) return;
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = window.setTimeout(() => {
      restartTimerRef.current = null;
      if (autoListenRef.current && !busyRef.current && !speakingRef.current) startRecognitionRef.current();
    }, 300);
  };

  const pauseRecognition = () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    setListening(false);
  };

  const stopListening = () => {
    autoListenRef.current = false;
    setContinuousMode(false);
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    if (transcriptTimerRef.current !== null) window.clearTimeout(transcriptTimerRef.current);
    transcriptTimerRef.current = null;
    pendingFinalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setPendingText('');
    pauseRecognition();
    requestRef.current?.abort();
    speechTokenRef.current += 1;
    speakingRef.current = false;
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  };

  const submitTranscriptAfterPause = () => {
    if (transcriptTimerRef.current !== null) window.clearTimeout(transcriptTimerRef.current);
    transcriptTimerRef.current = null;
    if (!autoListenRef.current || busyRef.current) return;
    const content = [pendingFinalTranscriptRef.current, interimTranscriptRef.current].filter(Boolean).join(' ').trim();
    pendingFinalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setPendingText('');
    setInterim('');
    if (content) askAssistantRef.current(content);
  };

  submitTranscriptRef.current = submitTranscriptAfterPause;

  const startRecognition = () => {
    if (!autoListenRef.current || busyRef.current || speakingRef.current || recognitionRef.current) return;
    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      autoListenRef.current = false;
      setContinuousMode(false);
      setVoiceError(t.unavailable);
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = replyLanguage === 'bn' ? 'bn-BD' : 'en-US';
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;
      recognition.onresult = (event) => {
        let latestInterim = '';
        for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript?.trim();
          if (!transcript) continue;
          if (result[0].isFinal === false) latestInterim += `${transcript} `;
          else pendingFinalTranscriptRef.current += `${transcript} `;
        }
        interimTranscriptRef.current = latestInterim.trim();
        setInterim(interimTranscriptRef.current);
        setPendingText(pendingFinalTranscriptRef.current.trim());

        if (transcriptTimerRef.current !== null) window.clearTimeout(transcriptTimerRef.current);
        if (pendingFinalTranscriptRef.current.trim() || interimTranscriptRef.current) {
          transcriptTimerRef.current = window.setTimeout(() => submitTranscriptRef.current(), endOfSpeechDelay);
        }
      };
      recognition.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          autoListenRef.current = false;
          setContinuousMode(false);
          setVoiceError(t.micDenied);
        } else if (event.error === 'no-speech') {
          if (!autoListenRef.current) setVoiceError(t.noSpeech);
        } else if (event.error === 'aborted') {
          // We stopped the recognizer ourselves, so this is not a failure.
        } else if (event.error === 'network') setVoiceError(t.networkError);
        else setVoiceError(t.voiceError);
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recognitionRef.current = null;
        setListening(false);
        // Keep the transcript visible while the silence timer decides when the user is done.
        if ((pendingFinalTranscriptRef.current.trim() || interimTranscriptRef.current) && transcriptTimerRef.current === null) {
          transcriptTimerRef.current = window.setTimeout(() => submitTranscriptRef.current(), endOfSpeechDelay);
        }
        scheduleAutoListen();
      };
      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      if (autoListenRef.current) {
        autoListenRef.current = false;
        setContinuousMode(false);
      }
      setVoiceError(t.voiceError);
    }
  };

  startRecognitionRef.current = startRecognition;

  const startListening = () => {
    setVoiceError('');
    autoListenRef.current = true;
    setContinuousMode(true);
    window.speechSynthesis?.cancel();
    speechTokenRef.current += 1;
    speakingRef.current = false;
    setSpeakingId(null);
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
    if (transcriptTimerRef.current !== null) window.clearTimeout(transcriptTimerRef.current);
    transcriptTimerRef.current = null;
    pendingFinalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setPendingText('');
    setInterim('');
    startRecognition();
  };

  const askAssistant = async (content: string) => {
    const text = content.trim();
    if (!text || busyRef.current || text.length > 1200) return;
    pauseRecognition();
    window.speechSynthesis?.cancel();
    speechTokenRef.current += 1;
    speakingRef.current = false;
    setSpeakingId(null);
    setRequestError('');
    const userMessage: ChatMessage = { role: 'user', content: text, id: nextMessageId.current++ };
    const nextMessages = [...messagesRef.current, userMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    busyRef.current = true;
    setBusy(true);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 65_000);

    try {
      const response = await fetch(chatEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          language: replyLanguageRef.current,
          messages: nextMessages.slice(-12).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null) as { content?: unknown; error?: unknown; code?: unknown } | null;
      if (!response.ok) {
        if (data?.code === 'config_missing') throw new Error(t.configMissing);
        if (data?.code === 'rate_limited') throw new Error(t.rateLimited);
        if (typeof data?.error === 'string') throw new Error(data.error);
        throw new Error(t.requestError);
      }
      const answer = toPlainText(typeof data?.content === 'string' ? data.content : '');
      if (!answer) throw new Error(t.requestError);
      const answerId = nextMessageId.current++;
      const assistantMessage = { role: 'assistant' as const, content: answer, id: answerId };
      messagesRef.current = [...messagesRef.current, assistantMessage];
      setMessages(messagesRef.current);
      speak(assistantMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      // A tap on the microphone aborts the request; that is not a failure.
      if (error instanceof Error && error.name === 'AbortError' && !autoListenRef.current) return;
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      setRequestError(!message || message === 'Failed to fetch' || timedOut || /timed out/i.test(message) ? t.requestError : message);
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      busyRef.current = false;
      setBusy(false);
      micRef.current?.focus();
      if (autoListenRef.current && !speakingRef.current) scheduleAutoListen();
    }
  };

  askAssistantRef.current = (content) => { void askAssistant(content); };

  const speak = (message: ChatMessage) => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setVoiceError(t.voiceUnsupported);
      return;
    }
    if (speakingRef.current && speakingId === message.id) {
      speechTokenRef.current += 1;
      speakingRef.current = false;
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      if (autoListenRef.current && !busyRef.current) scheduleAutoListen();
      return;
    }
    window.speechSynthesis.cancel();
    const token = ++speechTokenRef.current;
    const utterance = new SpeechSynthesisUtterance(toPlainText(message.content));
    utterance.lang = replyLanguageRef.current === 'bn' ? 'bn-BD' : 'en-US';
    const finishSpeaking = () => {
      if (speechTokenRef.current !== token) return;
      speakingRef.current = false;
      setSpeakingId(null);
      if (autoListenRef.current && !busyRef.current) scheduleAutoListen();
    };
    speakingRef.current = true;
    utterance.onend = finishSpeaking;
    utterance.onerror = finishSpeaking;
    setSpeakingId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  const clearConversation = () => {
    stopListening();
    requestRef.current?.abort();
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    messagesRef.current = [];
    setMessages([]);
    setRequestError('');
    setVoiceError('');
    setInterim('');
    nextMessageId.current = 1;
    micRef.current?.focus();
  };

  const visibleTranscript = [pendingText, interim].filter(Boolean).join(' ');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-talk-title"
        className="flex h-[min(92dvh,780px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ai-talk-title" className="font-display text-lg font-bold text-[var(--text-primary)]">{t.title}</h2>
            <p className="text-xs text-[var(--text-secondary)]">{t.subtitle}</p>
          </div>
          <label className="hidden items-center gap-1.5 text-xs text-[var(--text-muted)] sm:flex">
            <span>{t.language}</span>
            <select
              value={replyLanguage}
              onChange={(event) => setReplyLanguage(event.target.value as Language)}
              className="min-h-9 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-2 text-[var(--text-primary)]"
              aria-label={t.language}
            >
              <option value="bn">{t.bangla}</option>
              <option value="en">{t.english}</option>
            </select>
          </label>
          <button type="button" onClick={onClose} aria-label={t.close} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2 sm:hidden">
          <span className="text-xs text-[var(--text-muted)]">{t.language}</span>
          <button type="button" onClick={() => setReplyLanguage('bn')} aria-pressed={replyLanguage === 'bn'} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', replyLanguage === 'bn' ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]' : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]')}>{t.bangla}</button>
          <button type="button" onClick={() => setReplyLanguage('en')} aria-pressed={replyLanguage === 'en'} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', replyLanguage === 'en' ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]' : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]')}>{t.english}</button>
          <button type="button" onClick={clearConversation} aria-label={t.clear} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]">
            <Plus className="h-4 w-4" />{t.clear}
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && (
            <div className="mx-auto flex max-w-md flex-col items-center py-8 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--accent-soft)] text-[var(--accent-primary)]"><Bot className="h-7 w-7" /></span>
              <p className="text-sm leading-relaxed text-[var(--text-primary)]">{t.welcome}</p>
              <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">{t.voiceOnly}</p>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={cn('flex gap-2.5', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              {message.role === 'assistant' && (
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]"><Bot className="h-4 w-4" /></span>
              )}
              <div className={cn('max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]', message.role === 'user' ? 'rounded-br-md bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]' : 'rounded-bl-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)]')}>
                {message.content}
                {message.role === 'assistant' && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => speak(message)}
                      aria-label={speakingId === message.id ? t.stopSpeaking : t.playAloud}
                      title={speakingId === message.id ? t.stopSpeaking : t.playAloud}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-primary)]"
                    >{speakingId === message.id ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]" role="status">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)]"><Bot className="h-4 w-4" /></span>
              <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />{t.thinking}</span>
            </div>
          )}
          {requestError && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs leading-relaxed text-red-700 dark:text-red-300">{requestError}</p>}
          {visibleTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-md border border-[var(--accent-primary)]/60 bg-[var(--accent-primary)]/10 px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)] [overflow-wrap:anywhere]">{visibleTranscript}</div>
            </div>
          )}
          {listening && !visibleTranscript && <p className="text-center text-xs text-[var(--accent-primary)]" role="status">{t.listening}</p>}
        </div>

        <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 pb-safe pt-3 sm:px-5">
          <div className="flex flex-col items-center gap-2 pb-3">
            <button
              ref={micRef}
              type="button"
              onClick={continuousMode ? stopListening : startListening}
              aria-label={continuousMode ? t.stopListening : t.startListening}
              title={continuousMode ? t.stopListening : t.startListening}
              className={cn('inline-flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all', continuousMode ? 'animate-pulse bg-red-600 text-white ring-4 ring-red-500/20' : 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] hover:scale-105')}
            >{continuousMode ? <MicOff className="h-7 w-7" /> : busy ? <LoaderCircle className="h-7 w-7 animate-spin" /> : <Mic className="h-7 w-7" />}</button>
            <p className="text-center text-xs text-[var(--text-secondary)]">{busy ? t.thinking : continuousMode ? (listening ? t.stopListening : replyLanguage === 'bn' ? 'প্রতিটি উত্তরের পর আবার শুনব। বন্ধ করতে মাইক্রোফোনে ট্যাপ করুন।' : 'Hands-free is on. I will listen again after each answer. Tap to stop.') : messages.length > 0 ? t.tapToReply : t.tapToSpeak}</p>
          </div>
          <div className="flex items-start justify-between gap-3 py-2">
            <p className="max-w-xl text-[10px] leading-relaxed text-[var(--text-muted)]">{t.disclaimer}</p>
            <button
              type="button"
              onClick={clearConversation}
              aria-label={t.clear}
              className="hidden shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] sm:inline-flex"
            >{t.clear}</button>
          </div>
          {voiceError && <p role="status" className="pb-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">{voiceError}</p>}
        </footer>
      </section>
    </div>
  );
};

