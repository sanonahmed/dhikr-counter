import React, { useEffect, useState } from 'react';
import { Bell, Bot, CheckCircle2, LoaderCircle, PlugZap, Send, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, Input, Textarea } from '../components/ui/Primitives';
import { getNotificationPermission, requestNotificationPermission, showLocalNotification } from '../utils/notifications';
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_STORAGE_KEY,
  clearAiProvider,
  DEFAULT_AI_PROVIDER,
  getAiProxyStatus,
  loadAiProvider,
  requestAiCompletionDetailed,
  saveAiProvider,
  usesServerKey,
  type AiProviderConfig,
  type AiProxyStatus,
} from '../utils/aiNotifications';


function parseDraft(raw: string): { title: string; body: string } {
  const cleaned = raw.trim().replaceAll('```json', '').replaceAll('```', '').trim();
  const parsed = JSON.parse(cleaned) as { title?: unknown; body?: unknown };
  if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') throw new Error('AI response needs a title and body. Try again or edit the draft.');
  return { title: parsed.title.slice(0, 60), body: parsed.body.slice(0, 180) };
}

export const AdminNotificationsPage: React.FC = () => {
  const [config, setConfig] = useState<AiProviderConfig>(() => loadAiProvider());
  const [showKey, setShowKey] = useState(false);
  const [prompt, setPrompt] = useState('Write a warm, respectful reminder to take a mindful moment for dhikr today.');
  const [title, setTitle] = useState('A moment for dhikr');
  const [body, setBody] = useState('Take a mindful pause and remember Allah.');
  const [busy, setBusy] = useState<'test' | 'generate' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [proxy, setProxy] = useState<AiProxyStatus | null>(null);
  const update = (patch: Partial<AiProviderConfig>) => setConfig((current) => ({ ...current, ...patch }));

  useEffect(() => {
    let active = true;
    void getAiProxyStatus().then((status) => {
      if (active) {
        setProxy(status);
        if (status.serverKeyConfigured && status.defaultBaseUrl && status.defaultModel) {
          try {
            const hasSavedConfig = Boolean(localStorage.getItem(AI_PROVIDER_STORAGE_KEY));
            if (!hasSavedConfig) {
              setConfig({ ...DEFAULT_AI_PROVIDER, baseUrl: status.defaultBaseUrl, model: status.defaultModel });
            }
          } catch {
            // The provider config remains editable if browser storage is disabled.
          }
        }
      }
    });
    return () => { active = false; };
  }, []);

  const canRequest = Boolean(config.baseUrl.trim() && config.model.trim() && (config.apiKey.trim() || usesServerKey(config, proxy)));
  const serverKeyReady = usesServerKey(config, proxy);
  const activePreset = AI_PROVIDER_PRESETS.find((preset) => preset.baseUrl && preset.baseUrl === config.baseUrl.trim());

  const applyPreset = (id: string) => {
    const preset = AI_PROVIDER_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    update(preset.baseUrl ? { baseUrl: preset.baseUrl, model: preset.model } : { baseUrl: '', model: '' });
  };

  const providerAction = async (mode: 'test' | 'generate') => {
    setBusy(mode); setNotice(null);
    try {
      const result = await requestAiCompletionDetailed(config, mode === 'test'
        ? 'Reply with exactly: Connection successful.'
        : `Write one concise, respectful Muslim dhikr notification based on: ${prompt.trim() || 'A gentle daily dhikr reminder'}\nReturn only valid JSON with exactly two string fields: {"title":"...","body":"..."}. Title under 50 characters, body under 140. Do not invent Quran or hadith quotations or claim a religious source.`, mode === 'test' ? 30 : 180);
      const via = result.route === 'proxy' ? ' through the app server' : ' directly from this browser';
      if (mode === 'test') setNotice({ error: false, text: `Connected${via}. Provider responded: ${result.content.slice(0, 120)}` });
      else { const draft = parseDraft(result.content); setTitle(draft.title); setBody(draft.body); setNotice({ error: false, text: `Draft ready${via}. Review and edit before sending.` }); }
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'AI provider request failed.' }); }
    finally { setBusy(null); }
  };


  const send = async () => {
    setBusy('send'); setNotice(null);
    try {
      const permission = getNotificationPermission() === 'default' ? await requestNotificationPermission() : getNotificationPermission();
      if (permission !== 'granted') throw new Error(permission === 'unsupported' ? 'Notifications need a supported browser and secure HTTPS connection.' : 'Notification permission was not granted.');
      await showLocalNotification(title.trim(), { body: body.trim(), tag: `admin-ai-${Date.now()}` });
      setNotice({ error: false, text: 'Sent to this device only. This does not broadcast to other users.' });
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not show notification.' }); }
    finally { setBusy(null); }
  };

  const save = () => {
    try { saveAiProvider(config); setNotice({ error: false, text: 'Provider settings saved on this device.' }); }
    catch { setNotice({ error: true, text: 'Could not save settings in this browser.' }); }
  };
  const clear = () => { clearAiProvider(); setConfig(DEFAULT_AI_PROVIDER); setNotice({ error: false, text: 'Provider settings and key removed from this device.' }); };

  return <div className="max-w-3xl space-y-6">
    <header className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]"><Bot className="h-5 w-5" /></span><div><h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">AI notification studio</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Connect an AI provider, draft a message, and send it to this device.</p></div></header>
    <Card className="space-y-5">
      <div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 font-semibold"><PlugZap className="h-4 w-4 text-[var(--accent-primary)]" />AI provider</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">OpenAI-compatible chat completions API</p></div><span className="rounded-full bg-[var(--bg-surface-muted)] px-3 py-1 text-xs">{proxy?.available ? (serverKeyReady ? 'Server key ready' : config.apiKey ? 'Key configured' : 'Server proxy ready') : config.apiKey ? 'Key configured' : 'Not connected'}</span></div>
      <label className="block space-y-1.5 text-xs font-medium">Provider
        <select className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 text-sm text-[var(--text-primary)]" value={activePreset?.id ?? 'custom'} onChange={(e) => applyPreset(e.target.value)}>
          {AI_PROVIDER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
        <span className="block text-[11px] font-normal leading-relaxed text-[var(--text-muted)]">{activePreset?.note || 'Enter the base URL and model for your provider.'}</span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">

        <label className="space-y-1.5 text-xs font-medium sm:col-span-2">API base URL<Input type="url" autoComplete="url" placeholder="https://api.openai.com/v1" value={config.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} /></label>
        <label className="space-y-1.5 text-xs font-medium">Model<Input autoComplete="off" placeholder="gpt-4o-mini" value={config.model} onChange={(e) => update({ model: e.target.value })} /></label>
        <label className="space-y-1.5 text-xs font-medium">API key (sent directly to provider)<span className="flex gap-2"><Input className="min-w-0" type={showKey ? 'text' : 'password'} autoComplete="off" placeholder="Paste API key" value={config.apiKey} onChange={(e) => update({ apiKey: e.target.value })} /><Button variant="outline" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</Button></span></label>
      </div>
      <div className="flex flex-wrap gap-2"><Button onClick={save}><CheckCircle2 className="h-4 w-4" />Save on device</Button><Button variant="outline" disabled={busy !== null || !canRequest} onClick={() => void providerAction('test')}>{busy === 'test' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}Test provider</Button><Button variant="ghost" onClick={clear}><Trash2 className="h-4 w-4" />Clear key</Button></div>
      <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-[var(--text-secondary)]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>This is not a secured admin login. Your key is stored in this browser and may be accessible to other users of this device. For shared administration, use a secured backend; never expose a private key in a public app.</p></div>
    </Card>


    <Card className="space-y-5">
      <div><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />Create notification</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Generate a draft, then review and edit before sending.</p></div>
      <label className="block space-y-1.5 text-xs font-medium">What should it say?<Textarea rows={2} maxLength={500} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      <Button variant="secondary" disabled={busy !== null || !canRequest} onClick={() => void providerAction('generate')}>{busy === 'generate' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate with AI</Button>
      <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] p-4">
        <label className="block space-y-1.5 text-xs font-medium">Notification title<Input maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block space-y-1.5 text-xs font-medium">Message<Textarea rows={3} maxLength={180} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <Button disabled={busy !== null || !title.trim() || !body.trim()} onClick={() => void send()}>{busy === 'send' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <><Bell className="h-4 w-4" /><Send className="h-4 w-4" /></>}Send to this device</Button>
      </div>
    </Card>
    {notice && <p role="status" className={`rounded-xl border p-3 text-sm ${notice.error ? 'border-red-500/30 text-red-700 dark:text-red-300' : 'border-[var(--accent-primary)]/25 text-[var(--accent-primary)]'}`}>{notice.text}</p>}
    <p className="text-xs leading-relaxed text-[var(--text-muted)]">{proxy?.available
      ? `Requests go through this app's server (proxy ready${proxy.serverKeyConfigured ? ', server key configured' : ''}), so the provider's browser (CORS) policy does not matter.`
      : 'This deployment is static, so requests go directly from your browser and the provider must allow browser (CORS) requests. Google Gemini and OpenRouter do; OpenAI needs the bundled server (npm start) to proxy requests.'} Enter the base URL only (for example, https://api.openai.com/v1); /chat/completions is added automatically. Device notifications need permission and typically HTTPS; this tool cannot notify other users or deliver while the app is closed.</p>
  </div>;
};
