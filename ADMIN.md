# 🔐 Admin panel

The AI notification studio is **not a public feature**. It lives behind a hidden,
owner-only admin panel that the server unlocks with a passcode. Nothing in the
public UI links to it, and every AI request is refused unless the caller holds a
valid admin session.

---

## Setup

Add the passcode to the environment of the **Node service** (`server.js`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_PASSCODE` | yes | The passcode that unlocks the panel. Unset ⇒ the panel is disabled. |
| `ADMIN_SESSION_HOURS` | no | How long a login lasts. Default `12`, maximum `168` (one week). |
| `DATABASE_URL` | yes for push | PostgreSQL connection string (Neon recommended); the service runs `migrations/001_push_subscriptions.sql` automatically when it connects. |
| `AI_API_KEY` / `GEMINI_API_KEY` | no for admin; required for AI Talk | Provider key used by server-side AI features. |
| `AI_BASE_URL` | no | Optional OpenAI-compatible provider base URL; defaults to Gemini. The server adds `/chat/completions`. |
| `AI_MODEL` | no | Optional model id; defaults to `gemini-2.5-flash`. |
| `VITE_AI_PROXY_URL` | static hosting | Build-time URL of the Node service, so the panel knows where to sign in. |

The server-side AI settings above also power the public **AI Talk** companion in
the app header. AI Talk is voice-only: people speak through the microphone, see
the conversation transcript, and hear each reply read aloud. It never accepts a
provider URL or key from the browser. It uses the same configured provider/model
with a Bangla-first system prompt, a 12-message history limit, and a per-IP limit
of 8 requests per 10 minutes. `AI_API_KEY` (or `GEMINI_API_KEY`) is required for
AI Talk; `AI_BASE_URL` and `AI_MODEL` are optional overrides. If the server has no
key configured, the overlay shows a setup message instead of calling the provider.

Locally: put them in `.env.local` and run `npm run dev`. On Render: add them to
the web service (the blueprint already lists `ADMIN_PASSCODE`), then redeploy.

Pick a long random passcode — it is the only thing between the public and your
provider key:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Unset `ADMIN_PASSCODE` to switch the panel off entirely: `POST /api/admin/login`
answers `503`, and `POST /api/ai/chat` refuses every request, so a configured
server-side key can never be spent.

---

## Opening the panel

The panel is deliberately unlinked. Any of these opens it:

- the `#admin` hash — `https://your-app/#admin`
- `Ctrl+Alt+A` (`Cmd+Alt+A` on macOS)
- press and hold the app emblem for ~1.4 seconds (the sidebar header on desktop,
  the logo in the mobile header). A normal tap still goes Home.

The panel shows a lock screen. Enter the passcode; the server replies with an
opaque bearer token that the browser stores in `sessionStorage`. Closing the tab
ends the session, and the **Lock** button in the panel ends it immediately.

---

## Draft generation

"Generate with AI" asks the provider for `{"title":"...","body":"..."}`. Replies
are recovered even when a model ignores that contract: a fenced object, leading
prose, typographic quotes, and an object cut off by the token limit all still
yield a draft, and a plain-text answer becomes the message body instead of a
`JSON.parse` error. The panel states which form was used, so a provider that did
not return JSON is obvious before you send anything.

---

## How the security works

- **Server-authoritative.** `src/pages/AdminPage.tsx` only renders the studio
  after `GET /api/admin/session` confirms the token. Hiding the UI is cosmetic;
  the server is what actually enforces access.
- **No token, no AI.** `POST /api/ai/chat` sits behind `requireAdmin`, so a
  public visitor cannot reach the relay or the server-side provider key even by
  calling the endpoint directly.
- **Opaque sessions.** Tokens are 32 random bytes, kept in memory only. Restarting
  `server.js` signs everyone out and nothing sensitive touches disk.
- **No timing leak.** The passcode is compared with a constant-time comparison
  over SHA-256 digests, so a wrong passcode reveals nothing about the length.
- **Brute-force limiter.** Five failed sign-ins from one IP lock that IP out for
  15 minutes (`429` + `Retry-After`). `trust proxy` is set to `1` so the limiter
  sees the real client behind Render/Cloud Run.
- **Origin-scoped token.** The frontend only attaches the token to the origin that
  issued it, so a custom "AI proxy URL" cannot harvest the credential.

---

## Sending to every device

The studio's **Broadcast to all devices** button sends one Web Push message to
every device that has registered with the Node service. Delivery works while the
app is closed because the service worker shows the notification.

On the first visit, the app shows an in-app notification explainer. Its
**Allow notifications** button opens the browser's native permission prompt (a
user tap is required by browsers), then registers the device. A device also
registers automatically whenever it opens the app **and** notification permission
is already granted. Users who decline can still enable notifications from the
Reminders page.

Turning off notifications in the app stores an opt-out on that device, so the
next launch asks again instead of silently re-registering it. If the browser or
device itself has blocked notifications, the browser will not show its native
prompt again; the app shows instructions for restoring the permission in
browser/device settings and offers **check again**. iOS also requires the PWA to
be installed on the home screen (iOS 16.4+) before it can receive push.

### Notification banners (pop-up on screen)

Broadcasts are sent with high push urgency, and the service worker asks for a
persistent, vibrating notification. These are requests: whether a notification
appears as a banner on screen or only in the notification shade/center is
controlled by the operating system and the browser, not by the web page. If
messages only appear in the notification bar, enable banners for this app:

- **Android:** press and hold one of its notifications → **Settings**, or open
  **Settings → Apps → Dhikr Counter → Notifications** (for a browser tab:
  **Chrome → Settings → Notifications → this site**) and set the channel to
  **Urgent** / **Pop on screen**, with sound and vibration allowed.
- **Windows:** **Settings → System → Notifications → Chrome** (or **Dhikr
  Counter**) → enable **Show notification banners**, and turn off Focus assist /
  Do Not Disturb.
- **macOS:** **System Settings → Notifications → Chrome** (or **Dhikr
  Counter**) → choose **Banners** or **Alerts** instead of None, and turn off
  Focus.
- **iOS:** **Settings → Notifications → Dhikr Counter** → allow notifications
  and choose **Banners** or **Alerts**, and turn off Focus.

When an app window is visible, it also shows its own in-app banner, so the
message is visible even if the operating system suppresses the native pop-up.

Required on the Node service:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Required for push; the idempotent migration in `migrations/001_push_subscriptions.sql` is applied automatically on connection. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Authenticate push delivery. Generate once with `npx web-push generate-vapid-keys` and keep the pair stable across deploys. |
| `VAPID_SUBJECT` | `mailto:` or `https:` contact URL, e.g. `mailto:admin@example.com`. |

The studio shows the registered device count and reports whether the stable VAPID
configuration and PostgreSQL connection are available. Broadcasts need a valid
admin session, just like the AI relay, and expired subscriptions are removed
automatically.

---

## Verifying it locally

```bash
npm run dev               # Vite :3000 + server.js :8787
npm test                  # unit tests, including the AI draft parser
npm run test:proxy        # end-to-end proxy, auth, and rate-limit checks
```

`npm run test:proxy` starts its own server with a throwaway passcode and asserts,
among other things, that `/api/ai/chat` answers `401` without a session, that a
wrong passcode is rejected, and that repeated failures are rate-limited.

Quick manual checks:

```bash
curl http://localhost:8787/api/health
# {"ok":true,"admin":{"enabled":true},"ai":{...}}

curl -i -X POST http://localhost:8787/api/ai/chat \
  -H 'Content-Type: application/json' -d '{"prompt":"hi"}'
# HTTP/1.1 401 ... {"code":"admin_required"}
```

---

## Troubleshooting

| What you see | Why |
| --- | --- |
| "Admin access is disabled on the server" | `ADMIN_PASSCODE` is not set on the Node service (or it was not restarted after setting it). |
| "Could not reach the admin server" | The page is served by a static host with no `server.js`. Set `VITE_AI_PROXY_URL` at build time, or serve the app with `npm start`. |
| "Too many failed attempts" | Five wrong passcodes from this IP. Wait 15 minutes. |
| Panel opens, then locks itself | The session expired (`ADMIN_SESSION_HOURS`) or the server restarted. Unlock again. |
