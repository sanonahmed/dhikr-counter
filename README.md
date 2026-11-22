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

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

---

## 🌐 Deploying to Render

This project includes a `render.yaml` blueprint for automatic 1-click deployment on [Render](https://render.com).

### Option 1: Blueprint Deploy
1. In your Render Dashboard, click **New +** > **Blueprint**.
2. Connect your GitHub repository (`dhikr-counter`).
3. Click **Apply**. Render will automatically detect `render.yaml` and configure the static site.

### Option 2: Manual Static Site Deploy
1. In your Render Dashboard, click **New +** > **Static Site**.
2. Connect your repository.
3. Configure settings:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Under **Redirects/Rewrites**, add:
   - **Type**: `Rewrite`
   - **Source**: `/*`
   - **Destination**: `/index.html`
5. Click **Create Static Site**.
