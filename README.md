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
- **AI Talk**: A Bangla-first voice companion for discussing prayer and dhikr — speak with the microphone, hear each reply read aloud, and keep the transcript on screen.

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
   Copy `.env.example` to `.env.local` if you plan to use the private admin panel:
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

## 🔐 Private admin panel

Owner-only tools are not part of the public UI. The AI notification studio lives
inside a hidden admin panel that `server.js` unlocks with `ADMIN_PASSCODE`.
Setup, access gestures, and security notes are in [ADMIN.md](ADMIN.md).

---

## 🌐 Deploying to Render

This project includes a `render.yaml` blueprint for automatic 1-click deployment on [Render](https://render.com).

### Option 1: Blueprint Deploy
1. In your Render Dashboard, click **New +** > **Blueprint**.
2. Connect your GitHub repository (`dhikr-counter`).
3. Set `ADMIN_PASSCODE` (and, if you want server-side AI keys, `AI_API_KEY` or `GEMINI_API_KEY`) when prompted, then click **Apply**.

The blueprint creates a **Node web service** (`npm start`), not a static site, because the hidden admin panel needs `server.js` to verify the passcode and relay provider requests. A static site cannot do either.
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
   - `ADMIN_PASSCODE` — the passcode that unlocks the hidden admin panel
   - `AI_API_KEY` (or `GEMINI_API_KEY`) — **required for AI Talk**; the provider key the server uses
   - `AI_BASE_URL` — optional; defaults to the Gemini OpenAI-compatible endpoint. Set it (for example `https://api.openai.com/v1`) to use another OpenAI-compatible provider
   - `AI_MODEL` — optional; defaults to `gemini-2.5-flash`. Set the exact model id your provider expects
5. Click **Create Web Service**.
6. Open `/api/health` once the deploy finishes: `ai.serverKeyConfigured` must be `true` for AI Talk to answer.

### Static hosting only
A static site can host the public app, but the admin panel and its AI relay need
the Node service. Deploy this repo as a web service (Option 1 or 2) and set
`VITE_AI_PROXY_URL=https://your-node-service.onrender.com` in the static site's
build environment so the admin panel knows where to sign in. See
[ADMIN.md](ADMIN.md) for the full setup.

To check which kind of service a URL is, open `/api/health`: a Node deployment answers `{"ok":true,"admin":{"enabled":true},"ai":{...}}`, while a static site returns `index.html` for that path. Render cannot convert a static site into a web service.

---

## 📄 License

MIT

