# 📿 Dhikr Counter (Digital Tasbih & Companion)

An offline-first, modern Progressive Web App (PWA) for Islamic Dhikr, Durood, Istighfar, and digital Tasbih counting.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## ✨ Features

- **Digital Tasbih & Counter**: Haptic feedback, customizable target limits, round tracking, and sound feedback.
- **Dhikr Library & Presets**: Pre-loaded authentic daily Adhkar, Durood, and Istighfar with Arabic script, transliteration, and translations.
- **Custom Adhkar**: Create, customize, categorize, and track personal dhikr collections.
- **Goals & Streaks**: Daily and weekly targets, streak tracking, and daily reminders.
- **Offline-First PWA**: Fully functional offline with IndexedDB storage (Dexie.js) and installable on Android, iOS, and Desktop.
- **Statistics & History**: Detailed analytics, streak history, charts, and milestones.
- **Data Backup & Restore**: Export and import your dhikr history and custom adhkars seamlessly.
- **Customization Studio**: Multiple visual themes, bead styles, dial animations, and font settings.

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm`

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/sanonahmed/dhikr-counter.git
   cd dhikr-counter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. (Optional) Set up environment variables:
   Copy `.env.example` to `.env.local` if you plan to use AI features:
   ```bash
   cp .env.example .env.local
   ```

4. Start the development servers:
   ```bash
   npm run dev
   ```
   This runs Vite on port 3000 **and** `server.js` on port 8787, so `/api/ai/*` is proxied exactly like the deployed app. To run them separately, use `npm run dev:web` (Vite) and `npm run dev:server` (proxy) in two terminals.

5. Build for production:
   ```bash
   npm run build
   ```

6. Run the production server (serves `dist` and proxies AI requests):
   ```bash
   npm start        # http://localhost:8787
   ```

   `npm run serve` builds first, then starts the server.

---

## 🤖 AI Notification Studio

Open **Settings → AI notifications** (or `/ai-notifications` on desktop) to draft reminder copy with an OpenAI-compatible provider and send it to the current device.

Requests take one of two routes:

1. **Server proxy (recommended)** — when the app is served by `server.js`, the browser posts to `POST /api/ai/chat` and the server calls the provider. No CORS restrictions apply and the key never reaches the browser.
2. **Direct from the browser** — on a static-only host, the browser calls the provider itself, so the provider must allow cross-origin (CORS) requests. Google Gemini and OpenRouter do; OpenAI does not.

Configure the proxy with environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `AI_API_KEY` | Provider key used by the server. Falls back to `OPENAI_API_KEY`, then `GEMINI_API_KEY`. |
| `AI_BASE_URL` | OpenAI-compatible base URL. Defaults to Gemini's compatible endpoint when only `GEMINI_API_KEY` is set. |
| `AI_MODEL` | Default model name. |
| `AI_ALLOWED_HOSTS` | Comma-separated extra provider hostnames the proxy may call (hostnames only; no scheme or path). Example: `api.deepinfra.com`. |

Only the provider host named in `AI_BASE_URL` (plus a built-in list of common AI hosts) can be called, and the server key is only attached to `AI_BASE_URL`'s host, so the endpoint cannot be used as a general request relay or to leak the key elsewhere. For a custom browser-configured provider, add its exact hostname to `AI_ALLOWED_HOSTS` on the **Node proxy service** and restart/redeploy it. For example, if its base URL is `https://api.deepinfra.com/v1`, set `AI_ALLOWED_HOSTS=api.deepinfra.com`. Multiple entries are comma-separated. Do not include `https://` or a URL path.

### Development

```bash
npm run dev          # Vite on :3000 + server.js on :8787 (one command)
npm run dev:web      # Vite only, /api still proxied to :8787
npm run dev:server   # server.js only (second terminal)
```

Starting only Vite leaves `/api` without a backend, so AI requests fall back to
direct browser calls and providers such as OpenAI reject them with a CORS error.
Start server.js too (`npm run dev` does both), then verify with `npm run test:proxy`.

> **"No AI proxy answered /api/ai/chat" (CORS error in the AI studio)?** The app
> was served without `server.js` (a static host), so requests fell back to direct
> browser calls. Use `npm run dev` locally or `npm start` in production; on a
> static host, paste a deployed copy of this app into **AI proxy URL** in the AI
> studio. Keys are stored per origin, so a different port or host starts with
> empty settings. Note that OpenAI never accepts browser requests, so it always
> needs a proxy — Google Gemini and OpenRouter do not.

> **"The AI proxy is not allowed to call api.example.com" (custom provider)?** The
> proxy only relays hosts it knows about, so a custom base URL must be allowlisted
> on the server. Add the exact hostname (no `https://`, no path) and restart:
> `AI_ALLOWED_HOSTS=api.example.com` in `.env.local` for `npm run dev`/`npm start`,
> or as an environment variable on the deployed Node service. Comma-separate
> several hosts. If the provider sends CORS headers, the studio also retries the
> request straight from the browser, which needs no allowlist entry.

---

## 🌐 Deploying to Render

This project includes a `render.yaml` blueprint for automatic 1-click deployment on [Render](https://render.com).

### Option 1: Blueprint Deploy
1. In your Render Dashboard, click **New +** > **Blueprint**.
2. Connect your GitHub repository (`dhikr-counter`).
3. Set `AI_API_KEY` (or `GEMINI_API_KEY`) when prompted, then click **Apply**.

The blueprint creates a **Node web service** (`npm start`), not a static site, because the AI studio needs `server.js` to relay provider requests. A static site cannot proxy them.
> If you already deployed this repo as a static site, delete that service first — Render cannot convert a static site into a web service.

### Option 2: Manual Web Service Deploy
1. In your Render Dashboard, click **New +** > **Web Service**.
2. Connect your repository.
3. Configure settings:
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
4. Add environment variables under **Environment**:
   - `AI_API_KEY` (or `GEMINI_API_KEY`) - your provider key
   - `AI_BASE_URL` - for example `https://generativelanguage.googleapis.com/v1beta/openai` or `https://api.openai.com/v1`
   - `AI_MODEL` - for example `gemini-2.5-flash` or `gpt-4o-mini`
5. Click **Create Web Service**.

### Static hosting only
If you must keep a static deployment, you have two options:

1. **Provider that allows browser requests** — Google Gemini or OpenRouter, with a key pasted in the studio. No server needed.
2. **Keep OpenAI working through a proxy** — deploy this repo as a Node web service (Option 1 or 2 above), set its `AI_PROXY_ORIGINS` environment variable to the exact origin of the static site (for example `https://dhikr-counter.onrender.com`), then paste that service's URL into **AI proxy URL** in the studio. The static site then sends AI requests to that proxy without a rebuild. The server enables CORS only for the origins listed; `"*"` allows any site to relay its own key but never grants access to the server-side key.
