import React, { useEffect, useState } from 'react';
import { Bell, Bot, CheckCircle2, LoaderCircle, PlugZap, Send, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, Input, Textarea } from '../components/ui/Primitives';
import {
  buildNotificationPrompt,
  DRAFT_BODY_LIMIT,
  DRAFT_MAX_TOKENS,
  DRAFT_TITLE_LIMIT,
  parseAiDraft,
  type AiDraft,
} from '../utils/aiDraft';
import { getPushStatus, sendPushToAllDevices, type PushStatus } from '../utils/pushNotifications';
import {
  AI_PROVIDER_PRESETS,
  AI_PROVIDER_STORAGE_KEY,
  BUILD_TIME_PROXY_URL,
  clearAiProvider,
  DEFAULT_AI_PROVIDER,
  getAiProxyStatus,
  hostOf,
  loadAiProvider,
  needsProxyInBrowser,
  pageOrigin,
  requestAiCompletionDetailed,
  saveAiProvider,
  usesServerKey,
  type AiProviderConfig,
  type AiProxyStatus,
  type AiRequestRoute,
} from '../utils/aiNotifications';


function draftNotice(draft: AiDraft, route: AiRequestRoute): { error: boolean; text: string } {
  const via = route === 'proxy' ? ' through the app server' : ' directly from this browser';
  switch (draft.source) {
    case 'json':
      return { error: false, text: `Draft ready${via}. Review and edit before sending.` };
    case 'labeled':
      // A labelled reply ("Title: ... / Body: ...") is recovered but may be
      // looser than JSON, so the admin is told where the text came from.
      return { error: false, text: `The provider answered with labelled text instead of JSON${via}, so the draft was read from it. Review and edit before sending.` };
    default:
      return { error: false, text: `The provider answered in plain text${via}, so its whole reply was used as the message. Review and edit before sending.` };
  }
}

export const AdminNotificationsPage: React.FC = () => {
  const [config, setConfig] = useState<AiProviderConfig>(() => loadAiProvider());
  const [showKey, setShowKey] = useState(false);
  const [prompt, setPrompt] = useState('A warm reminder to take a mindful moment for dhikr today');
  const [title, setTitle] = useState('A moment for dhikr');
  const [body, setBody] = useState('Take a mindful pause and remember Allah.');
  const [busy, setBusy] = useState<'test' | 'generate' | 'send' | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [proxy, setProxy] = useState<AiProxyStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushChecking, setPushChecking] = useState(false);
  const update = (patch: Partial<AiProviderConfig>) => setConfig((current) => ({ ...current, ...patch }));
  const providerHost = hostOf(config.baseUrl);
  const siteOrigin = pageOrigin();
  // Variables a deployed Node copy of this app needs before this page can use it.
  const proxyEnvVars = `AI_ALLOWED_HOSTS=${providerHost || 'api.example.com'}\nAI_PROXY_ORIGINS=${siteOrigin || 'https://your-static-site.example.com'}`;

  const recheckProxy = async () => {
    setChecking(true);
    try {
      saveAiProvider(config);
      const status = await getAiProxyStatus(config.proxyUrl);
      setProxy(status);
      setNotice(status.available
        ? { error: false, text: 'AI proxy reachable. Requests from this page now go through it.' }
        : {
            error: true,
            text: `Still no AI proxy at ${config.proxyUrl.trim() || siteOrigin || 'this site'}: /api/health did not answer like server.js. ` +
              (providerHost ? `${providerHost} cannot be called directly from a browser, so a reachable proxy is required.` : ''),
          });
    } finally {
      setChecking(false);
    }
  };

  const copyProxyEnv = async () => {
    try {
      await navigator.clipboard.writeText(proxyEnvVars);
      setNotice({ error: false, text: 'Copied both variables. Paste them into the Node service environment, then redeploy it.' });
    } catch {
      setNotice({ error: true, text: 'This browser blocked clipboard access. Select the two lines in the box and copy them manually.' });
    }
  };

  useEffect(() => {
    let active = true;
    // Debounced so typing a proxy URL does not probe on every keystroke.
    const timer = setTimeout(() => {
      void getAiProxyStatus(config.proxyUrl).then((status) => {
        if (!active) return;
        setProxy(status);
        if (status.serverKeyConfigured && status.defaultBaseUrl && status.defaultModel) {
          try {
            const hasSavedConfig = Boolean(localStorage.getItem(AI_PROVIDER_STORAGE_KEY));
            if (!hasSavedConfig) {
              setConfig((current) => ({
                ...DEFAULT_AI_PROVIDER,
                baseUrl: status.defaultBaseUrl!,
                model: status.defaultModel!,
                proxyUrl: current.proxyUrl,
              }));
            }
          } catch {
            // The provider config remains editable if browser storage is disabled.
          }
        }
      });
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [config.proxyUrl]);

  const refreshPushStatus = async () => {
    setPushChecking(true);
    try {
      setPushStatus(await getPushStatus());
    } finally {
      setPushChecking(false);
    }
  };

  useEffect(() => {
    void refreshPushStatus();
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
        : buildNotificationPrompt(prompt), mode === 'test' ? 30 : DRAFT_MAX_TOKENS);
      const via = result.route === 'proxy' ? ' through the app server' : ' directly from this browser';
      if (mode === 'test') setNotice({ error: false, text: `Connected${via}. Provider responded: ${result.content.slice(0, 120)}` });
      else {
        const draft = parseAiDraft(result.content);
        setTitle(draft.title);
        setBody(draft.body);
        setNotice(draftNotice(draft, result.route));
      }
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'AI provider request failed.' }); }
    finally { setBusy(null); }
  };


  const send = async () => {
    setBusy('send'); setNotice(null);
    try {
      const result = await sendPushToAllDevices(title.trim(), body.trim());
      setNotice({
        error: result.failed > 0 || result.total === 0,
        text: result.total === 0
          ? 'No devices are registered yet. Each user must open the app, allow notifications, and register their device first.'
          : `Broadcast sent: ${result.sent} of ${result.total} registered device(s) accepted it${result.failed ? `; ${result.failed} failed` : ''}${result.removed ? `; removed ${result.removed} expired subscription(s)` : ''}.`,
      });
      await refreshPushStatus();
    } catch (error) { setNotice({ error: true, text: error instanceof Error ? error.message : 'Could not send the broadcast.' }); }
    finally { setBusy(null); }
  };

  const save = () => {
    try { saveAiProvider(config); setNotice({ error: false, text: 'Provider settings saved on this device.' }); }
    catch { setNotice({ error: true, text: 'Could not save settings in this browser.' }); }
  };
  const clear = () => { clearAiProvider(); setConfig(DEFAULT_AI_PROVIDER); setNotice({ error: false, text: 'Provider settings and key removed from this device.' }); };

  return <div className="max-w-3xl space-y-6">
    <header className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)]"><Bot className="h-5 w-5" /></span><div><h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">AI notification studio</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">Connect an AI provider, draft a message, and broadcast it to registered devices.</p></div></header>
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
      <label className="block space-y-1.5 text-xs font-medium">AI proxy URL (optional)<Input type="url" autoComplete="url" placeholder="Leave blank when this app serves its own /api" value={config.proxyUrl} onChange={(e) => update({ proxyUrl: e.target.value })} />
        <span className="block text-[11px] font-normal leading-relaxed text-[var(--text-muted)]">Only needed on a static host with no /api server. Paste a deployed copy of this app (for example https://your-app.onrender.com); it must list this page's origin in AI_PROXY_ORIGINS. A static build can set VITE_AI_PROXY_URL instead, which applies the proxy for every visitor.</span>
      </label>
      {!proxy?.available && <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
        <p className="flex gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>
            <strong className="text-[var(--text-primary)]">No AI proxy is reachable from this page.</strong>{' '}
            {needsProxyInBrowser(config.baseUrl)
              ? `${providerHost} rejects browser requests, so the test can only pass through a server.`
              : 'Most AI providers reject browser requests (CORS), so a server is usually required.'}{' '}
            Deploy this repo as a Node web service (build <code className="rounded bg-[var(--bg-surface-muted)] px-1">npm install &amp;&amp; npm run build</code>, start{' '}
            <code className="rounded bg-[var(--bg-surface-muted)] px-1">npm start</code>) and open that URL — <code className="rounded bg-[var(--bg-surface-muted)] px-1">/api</code> is then same-origin.
            To keep this static site, paste that service URL in the field above and give the service:
          </span>
        </p>
        <pre className="overflow-x-auto rounded-lg bg-[var(--bg-surface-muted)] p-2 font-mono text-[11px] leading-relaxed">{proxyEnvVars}</pre>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void copyProxyEnv()}><CheckCircle2 className="h-4 w-4" />Copy variables</Button>
          <Button variant="ghost" disabled={checking} onClick={() => void recheckProxy()}>{checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}Re-check proxy</Button>
        </div>
        {BUILD_TIME_PROXY_URL && <p>This build already defaults to <code className="rounded bg-[var(--bg-surface-muted)] px-1">{BUILD_TIME_PROXY_URL}</code>; open that URL once if the free service is asleep.</p>}
      </div>}
      <div className="flex flex-wrap gap-2"><Button onClick={save}><CheckCircle2 className="h-4 w-4" />Save on device</Button><Button variant="outline" disabled={busy !== null || !canRequest} onClick={() => void providerAction('test')}>{busy === 'test' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}Test provider</Button><Button variant="ghost" onClick={clear}><Trash2 className="h-4 w-4" />Clear key</Button></div>
      <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-[var(--text-secondary)]"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>Restricted area: the app server verifies your admin passcode before it relays any request, so the server key stays private. The provider key you enter here is still stored in this browser only — use a private device and press <strong className="text-[var(--text-primary)]">Clear key</strong> before leaving a shared one.</p></div>
    </Card>


    <Card className="space-y-5">
      <div><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-[var(--accent-gold)]" />Create notification</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">Generate a draft, then review and edit before sending.</p></div>
      <label className="block space-y-1.5 text-xs font-medium">What should it say?<Textarea rows={2} maxLength={500} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
      <Button variant="secondary" disabled={busy !== null || !canRequest} onClick={() => void providerAction('generate')}>{busy === 'generate' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate with AI</Button>
      <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--text-secondary)]">
            {pushChecking ? 'Checking registered devices…' : pushStatus && typeof pushStatus.subscribers === 'number'
              ? `${pushStatus.subscribers} device(s) registered for broadcasts.`
              : 'Could not read the registered device count.'}
          </p>
          <Button type="button" variant="ghost" size="sm" disabled={pushChecking} onClick={() => void refreshPushStatus()}>
            {pushChecking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
        {pushStatus && (!pushStatus.vapidConfigured || !pushStatus.persistentStore) && (
          <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            {!pushStatus.vapidConfigured && (pushStatus.vapidReason || 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in the server environment.')}{' '}
            {!pushStatus.persistentStore && (pushStatus.storeReason || 'Configure DATABASE_URL with the Neon PostgreSQL connection string; device subscriptions are not being stored durably.')}
          </p>
        )}
        {pushStatus && pushStatus.vapidConfigured && pushStatus.persistentStore && (
          <p role="status" className="text-xs text-[var(--text-secondary)]">
            Stable VAPID configuration and PostgreSQL persistence are active. Registered device subscriptions survive service restarts.
          </p>
        )}
        <label className="block space-y-1.5 text-xs font-medium">Notification title<Input maxLength={DRAFT_TITLE_LIMIT} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block space-y-1.5 text-xs font-medium">Message<Textarea rows={3} maxLength={DRAFT_BODY_LIMIT} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <Button disabled={busy !== null || !pushStatus?.enabled || !title.trim() || !body.trim()} onClick={() => void send()}>{busy === 'send' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <><Bell className="h-4 w-4" /><Send className="h-4 w-4" /></>}Broadcast to all devices</Button>
      </div>
    </Card>
    {notice && <p role="status" className={`rounded-xl border p-3 text-sm ${notice.error ? 'border-red-500/30 text-red-700 dark:text-red-300' : 'border-[var(--accent-primary)]/25 text-[var(--accent-primary)]'}`}>{notice.text}</p>}
    <p className="text-xs leading-relaxed text-[var(--text-muted)]">{proxy?.available
      ? `Requests go through the AI proxy (${config.proxyUrl.trim() || BUILD_TIME_PROXY_URL || 'this app'})${proxy.serverKeyConfigured ? ' with a server key configured' : ''}, so the provider's browser (CORS) policy does not matter.`
      : 'The AI proxy is not reachable, so requests go directly from your browser and the provider must allow browser (CORS) requests. Google Gemini and OpenRouter do; OpenAI and most self-hosted OpenAI-compatible APIs do not, so they need the bundled server or a proxy URL above (or VITE_AI_PROXY_URL at build time).'} Enter the base URL only (for example, https://api.openai.com/v1); /chat/completions is added automatically. Device notifications need permission and typically HTTPS; scheduled reminders run in-app, while Web Push broadcasts can reach registered devices when the app is closed.</p>
  </div>;
};
