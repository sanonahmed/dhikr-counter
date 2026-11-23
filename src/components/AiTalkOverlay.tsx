import React, { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, MicOff, Plus, Volume2, VolumeX, X } from 'lucide-react';
import type { Language } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { resolveAdminServerUrl } from '../utils/adminSession';
import { cn } from '../utils/cn';
import { toPlainText } from '../../shared/plainText.js';
import { AiTalkOrb } from './AiTalkOrb';
import { splitSpeechRecognitionResults, type SpeechRecognitionResultLike } from '../utils/speechTranscript';

interface AiTalkOverlayProps { open: boolean; onClose: () => void; language: Language; }
interface ChatMessage { role: 'user' | 'assistant'; content: string; id: number; }
interface SpeechRecognitionEventLike { resultIndex?: number; results: ArrayLike<SpeechRecognitionResultLike>; }
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

const INITIAL_GREETING = 'আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহি ওয়া বারাকাতুহু। কীভাবে আপনাকে সাহায্য করতে পারি?';

/** A quiet eight-point Islamic star used as the assistant's mark. */
function SacredMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" className={className}>
      <rect x="9" y="9" width="30" height="30" rx="2" />
      <rect x="9" y="9" width="30" height="30" rx="2" transform="rotate(45 24 24)" />
      <circle cx="24" cy="24" r="3.5" />
    </svg>
  );
}

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
  const greetingStartedRef = useRef(false);
  const busyRef = useRef(false);
  const speakingRef = useRef(false);
  const speechTokenRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const replyLanguageRef = useRef<Language>(replyLanguage);
  replyLanguageRef.current = replyLanguage;
  messagesRef.current = messages;
  const startRecognitionRef = useRef<() => void>(() => {});
  const startGreetingRef = useRef<() => void>(() => {});
  const askAssistantRef = useRef<(content: string) => void>(() => {});
  const submitTranscriptRef = useRef<() => void>(() => {});
  const nextMessageId = useRef(1);
  /** Wait for a full three seconds of silence before answering, so pauses between thoughts are not treated as the end. */
  const endOfSpeechDelay = 3000;

  useEffect(() => {
    if (!open) {
      greetingStartedRef.current = false;
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      micRef.current?.focus();
      startGreetingRef.current();
    }, 0);
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
    const content = pendingFinalTranscriptRef.current.trim();
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
        const transcripts = splitSpeechRecognitionResults(event.results, event.resultIndex ?? 0);
        if (transcripts.finalTranscript) pendingFinalTranscriptRef.current += `${transcripts.finalTranscript} `;
        interimTranscriptRef.current = transcripts.interimTranscript;
        setInterim(interimTranscriptRef.current);
        setPendingText(pendingFinalTranscriptRef.current.trim());

        if (transcriptTimerRef.current !== null) window.clearTimeout(transcriptTimerRef.current);
        if (pendingFinalTranscriptRef.current.trim()) {
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
        // Interim recognition can contain noise; only retain final results and send those after silence.
        interimTranscriptRef.current = '';
        setInterim('');
        if (pendingFinalTranscriptRef.current.trim() && transcriptTimerRef.current === null) {
          transcriptTimerRef.current = window.setTimeout(() => submitTranscriptRef.current(), endOfSpeechDelay);
        }
        scheduleAutoListen();
      };
      recognitionRef.current = recognition;
      interimTranscriptRef.current = '';
      setInterim('');
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

  startGreetingRef.current = () => {
    if (!open || greetingStartedRef.current) return;
    greetingStartedRef.current = true;
    const greeting: ChatMessage = { role: 'assistant', content: INITIAL_GREETING, id: nextMessageId.current++ };
    messagesRef.current = [greeting];
    setMessages(messagesRef.current);
    setVoiceError('');
    autoListenRef.current = true;
    setContinuousMode(true);

    if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
      speak(greeting);
    } else {
      setVoiceError(t.voiceUnsupported);
      startRecognitionRef.current();
    }
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
  const orbMode = busy ? 'thinking' : listening ? 'listening' : speakingId !== null ? 'speaking' : 'idle';
  const statusText = busy
    ? t.thinking
    : listening
      ? t.listening
      : continuousMode
        ? t.stopListening
        : messages.length > 0
          ? t.tapToReply
          : t.tapToSpeak;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#020806]/80 backdrop-blur-md sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-talk-title"
        className="relative flex h-[min(94dvh,860px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#08130f] text-[#f4f2e9] shadow-[0_32px_100px_-24px_rgba(0,0,0,0.85)] sm:rounded-[2rem]"
      >
        <div className="ai-talk-pattern pointer-events-none absolute inset-0 opacity-80" aria-hidden="true" />
        <header className="relative z-10 flex min-h-[76px] items-center gap-3 border-b border-white/[0.08] px-4 sm:px-7">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#d4a853]/30 bg-[#d4a853]/[0.08] text-[#e0bd70]">
            <SacredMark className="h-6 w-6" />
            {orbMode !== 'idle' && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#08130f] animate-pulse',
                  orbMode === 'thinking' ? 'bg-amber-300' : orbMode === 'speaking' ? 'bg-sky-300' : 'bg-emerald-300',
                )}
              />
            )}
          </span>
          <h2 id="ai-talk-title" className="min-w-0 flex-1 font-display text-xl font-semibold tracking-wide text-[#f5f0df]">{t.title}</h2>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs text-[#b6c1b9]">
            <span className="sr-only">{t.language}</span>
            <select
              value={replyLanguage}
              onChange={(event) => setReplyLanguage(event.target.value as Language)}
              className="min-h-8 cursor-pointer border-0 bg-transparent text-xs font-medium text-[#e8e2d2] outline-none"
              aria-label={t.language}
            >
              <option className="bg-[#08130f]" value="bn">{t.bangla}</option>
              <option className="bg-[#08130f]" value="en">{t.english}</option>
            </select>
          </label>
          {messages.length > 0 && (
            <button type="button" onClick={clearConversation} aria-label={t.clear} title={t.clear} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 text-[#a5b2aa] transition-colors hover:border-[#d4a853]/30 hover:bg-[#d4a853]/10 hover:text-[#e0bd70]">
              <Plus className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label={t.close} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#93a197] transition-colors hover:bg-white/[0.07] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div ref={listRef} className="relative z-10 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && (
            <div className="flex h-full min-h-[250px] flex-col items-center justify-center pb-4 text-center">
              <div className="relative mb-6 flex h-52 w-52 items-center justify-center sm:h-64 sm:w-64">
                <AiTalkOrb mode={orbMode} className="absolute inset-0" />
                <SacredMark className="pointer-events-none relative h-9 w-9 text-[#e7cb82]/90 drop-shadow-[0_0_14px_rgba(226,194,111,0.55)] sm:h-11 sm:w-11" />
              </div>
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d4a853]/20 bg-[#d4a853]/[0.06] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[#d4bc83]">
                <span className={cn('h-1.5 w-1.5 rounded-full', listening ? 'animate-pulse bg-emerald-400' : 'bg-[#d4a853]')} />
                {statusText}
              </span>
              {voiceError && <p role="status" className="mt-2 max-w-sm text-center text-xs leading-relaxed text-amber-200">{voiceError}</p>}
              {requestError && <p role="alert" className="mt-2 max-w-sm text-center text-xs leading-relaxed text-rose-300">{requestError}</p>}
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={cn('flex gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              {message.role === 'assistant' && (
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#d4a853]/20 bg-[#d4a853]/[0.06] text-[#d7b76d]">
                  <SacredMark className="h-4 w-4" />
                </span>
              )}
              <div className={cn('max-w-[88%] rounded-2xl px-4 py-3.5 text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] sm:max-w-[78%]', message.role === 'user' ? 'rounded-br-md border border-[#d4a853]/20 bg-[#d4a853]/[0.10] text-[#f2ead6]' : 'rounded-bl-md border border-white/[0.08] bg-white/[0.045] text-[#e8ebe5]')}>
                {message.content}
                {message.role === 'assistant' && (
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={() => speak(message)} aria-label={speakingId === message.id ? t.stopSpeaking : t.playAloud} title={speakingId === message.id ? t.stopSpeaking : t.playAloud} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#9aa89f] transition-colors hover:bg-[#d4a853]/10 hover:text-[#e0bd70]">
                      {speakingId === message.id ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-3 text-sm text-[#b5c0b8]" role="status">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#d4a853]/20 bg-[#d4a853]/[0.06] text-[#d7b76d]"><SacredMark className="h-4 w-4" /></span>
              <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin text-[#d4b866]" />{t.thinking}</span>
            </div>
          )}
          {requestError && messages.length > 0 && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs leading-relaxed text-rose-200">{requestError}</p>}
          {visibleTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-md border border-[#d4a853]/25 bg-[#d4a853]/[0.08] px-4 py-3 text-sm leading-relaxed text-[#f2ead6] [overflow-wrap:anywhere]">{visibleTranscript}</div>
            </div>
          )}
          {listening && !visibleTranscript && messages.length > 0 && <p className="text-center text-xs text-[#d4bc83]" role="status">{t.listening}</p>}
          {voiceError && messages.length > 0 && <p role="status" className="text-center text-xs leading-relaxed text-amber-200">{voiceError}</p>}
        </div>

        <footer className="relative z-10 border-t border-white/[0.08] bg-[#07100d]/75 px-4 pb-safe pt-4 sm:px-7 sm:pt-5">
          <div className="flex flex-col items-center gap-3 pb-3">
            <div className="relative flex h-[76px] w-[76px] items-center justify-center">
              <span className={cn('absolute inset-0 rounded-full border transition-all duration-500', continuousMode ? 'scale-125 border-emerald-300/30' : 'border-[#d4a853]/20')} aria-hidden="true" />
              <span className={cn('absolute inset-[6px] rounded-full border border-[#d4a853]/15', continuousMode && listening && 'ai-talk-breathe-fast')} aria-hidden="true" />
              <button
                ref={micRef}
                type="button"
                onClick={continuousMode ? stopListening : startListening}
                aria-label={continuousMode ? t.stopListening : t.startListening}
                title={continuousMode ? t.stopListening : t.startListening}
                disabled={busy}
                className={cn('ai-talk-breathe relative inline-flex h-[60px] w-[60px] items-center justify-center rounded-full border border-[#e2c779]/50 bg-[radial-gradient(circle_at_38%_28%,#34745c,#123729_54%,#081b13)] text-[#f2d995] transition-all duration-300 hover:scale-[1.04] disabled:cursor-wait disabled:opacity-75', continuousMode && 'border-emerald-200/50 text-emerald-100')}
              >{continuousMode ? <MicOff className="h-6 w-6" /> : busy ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Mic className="h-6 w-6" />}</button>
            </div>
            <p className="min-h-4 text-center text-[11px] tracking-wide text-[#c5cbbd]" role="status">{statusText}</p>
          </div>
        </footer>
      </section>
    </div>
  );
};

