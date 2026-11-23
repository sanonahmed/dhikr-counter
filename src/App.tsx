import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, X } from 'lucide-react';
import { db, ensureDatabaseSeeded } from './db/database';
import type { CountingSession, DhikrItem, PageRoute } from './types/dhikr';
import { useAppSettings } from './hooks/useAppSettings';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useReminderScheduler } from './hooks/useReminders';
import { Layout } from './components/Layout';
import { NotificationPermissionPrompt } from './components/NotificationPermissionPrompt';
import { PushMessageBanner } from './components/PushMessageBanner';
import { DashboardPage } from './pages/DashboardPage';
import { CounterPage } from './pages/CounterPage';

// Lazy-load secondary pages for optimal initial bundle and offline speed
const LibraryPage = lazy(() => import('./pages/LibraryPage').then((m) => ({ default: m.LibraryPage })));
const DhikrDetailsPage = lazy(() =>
  import('./pages/DhikrDetailsPage').then((m) => ({ default: m.DhikrDetailsPage }))
);
const CustomDhikrPage = lazy(() =>
  import('./pages/CustomDhikrPage').then((m) => ({ default: m.CustomDhikrPage }))
);
const CollectionsPage = lazy(() =>
  import('./pages/CollectionsPage').then((m) => ({ default: m.CollectionsPage }))
);
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const SalahTrackerPage = lazy(() =>
  import('./pages/SalahTrackerPage').then((m) => ({ default: m.SalahTrackerPage }))
);
const StatisticsPage = lazy(() =>
  import('./pages/StatisticsPage').then((m) => ({ default: m.StatisticsPage }))
);
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const CustomizationStudioPage = lazy(() =>
  import('./pages/CustomizationStudioPage').then((m) => ({ default: m.CustomizationStudioPage }))
);
const RemindersPage = lazy(() =>
  import('./pages/RemindersPage').then((m) => ({ default: m.RemindersPage }))
);
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BackupRestorePage = lazy(() =>
  import('./pages/BackupRestorePage').then((m) => ({ default: m.BackupRestorePage }))
);
const AboutPrivacyPage = lazy(() =>
  import('./pages/AboutPrivacyPage').then((m) => ({ default: m.AboutPrivacyPage }))
);
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

function PageLoader() {
  return (
    <div className="py-16 flex items-center justify-center text-sm text-[var(--text-muted)]">
      Loading...
    </div>
  );
}

export default function App() {
  const {
    settings,
    updateSettings,
    updateCustomization,
    updateCustomTheme,
    replaceSettings,
  } = useAppSettings();

  const pwa = usePWAInstall();

  const [dbReady, setDbReady] = useState(false);
  const [currentPage, setCurrentPage] = useState<PageRoute>('home');
  const [activeDhikrId, setActiveDhikrId] = useState<string>(settings.defaultDhikrId);
  const [detailDhikrId, setDetailDhikrId] = useState<string | null>(null);
  const [editingDhikr, setEditingDhikr] = useState<DhikrItem | null>(null);
  const [resumedSession, setResumedSession] = useState<CountingSession | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    ensureDatabaseSeeded().then(() => setDbReady(true));
  }, []);

  const dhikrs = useLiveQuery(() => db.dhikrs.orderBy('sortOrder').toArray(), [], []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], []);
  const collections = useLiveQuery(() => db.collections.orderBy('createdAt').toArray(), [], []);
  const goals = useLiveQuery(() => db.goals.orderBy('createdAt').toArray(), [], []);
  const reminders = useLiveQuery(() => db.reminders.orderBy('time').toArray(), [], []);
  const presets = useLiveQuery(() => db.presets.orderBy('createdAt').reverse().toArray(), [], []);
  const salahDays = useLiveQuery(() => db.salahDays.orderBy('id').reverse().toArray(), [], []);

  const { activeAlert, dismissAlert } = useReminderScheduler(reminders);

  const activeDhikr =
    dhikrs.find((d) => d.id === activeDhikrId) ||
    dhikrs.find((d) => d.id === settings.defaultDhikrId) ||
    dhikrs[0];

  const detailDhikr = detailDhikrId ? dhikrs.find((d) => d.id === detailDhikrId) : undefined;

  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : sessions
        .filter((s) => s.dhikrId === activeDhikr?.id && s.status === 'in_progress')
        .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)[0];

  const handleNavigate = (page: PageRoute) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'auto' });
    // Drop the hidden `#admin` deep link once the owner leaves the panel.
    if (page !== 'admin' && window.location.hash.replace('#', '').toLowerCase() === 'admin') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };

  // Private owner entry point. No public UI element links to the admin panel:
  // it opens only from `#admin`, Ctrl+Alt+A (Cmd+Alt+A), or a long-press on the
  // app emblem in Layout, and then asks the server for the admin passcode.
  useEffect(() => {
    const hasAdminHash = () => window.location.hash.replace('#', '').toLowerCase() === 'admin';
    const openFromHash = () => {
      if (!hasAdminHash()) return;
      setCurrentPage('admin');
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    const openFromShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setCurrentPage('admin');
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    };

    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    window.addEventListener('keydown', openFromShortcut);
    return () => {
      window.removeEventListener('hashchange', openFromHash);
      window.removeEventListener('keydown', openFromShortcut);
    };
  }, []);

  const handleStartCounting = (dhikrId?: string) => {
    if (dhikrId) {
      setActiveDhikrId(dhikrId);
    }
    setResumedSession(null);
    handleNavigate('counter');
  };

  const handleResumeSession = (session: CountingSession) => {
    setActiveDhikrId(session.dhikrId);
    setResumedSession(session);
    handleNavigate('counter');
  };

  const handleOpenDetails = (dhikrId: string) => {
    setDetailDhikrId(dhikrId);
    handleNavigate('dhikr-detail');
  };

  const handleOpenCustomCreator = (dhikrToEdit?: DhikrItem | null) => {
    setEditingDhikr(dhikrToEdit || null);
    handleNavigate('custom-dhikr');
  };

  if (!dbReady && dhikrs.length === 0) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg-canvas)] flex flex-col items-center justify-center gap-3 text-[var(--text-primary)]">
        <img src="/icon.svg" alt="Dhikr Counter" className="w-12 h-12 rounded-2xl" />
        <p className="font-display text-xl font-semibold">Dhikr Counter</p>
      </div>
    );
  }

  return (
    <>
      <Layout
        currentPage={currentPage}
        onNavigate={handleNavigate}
        language={settings.language}
        isOnline={pwa.isOnline}
        isInstallable={pwa.isInstallable}
        isInstalled={pwa.isInstalled}
        isIOS={pwa.isIOS}
        onInstall={pwa.install}
      >
        {currentPage === 'home' && (
          <DashboardPage
            language={settings.language}
            dhikrs={dhikrs}
            sessions={sessions}
            onStartCounting={handleStartCounting}
            onResumeSession={handleResumeSession}
          />
        )}

        {currentPage === 'counter' && activeDhikr && (
          <CounterPage
            dhikr={activeDhikr}
            allDhikrs={dhikrs}
            resumedSession={resumedSession}
            settings={settings}
            onUpdateCustomization={updateCustomization}
            onSwitchDhikr={(id) => {
              setActiveDhikrId(id);
              setResumedSession(null);
            }}
            onNavigate={handleNavigate}
            onActiveSessionChange={setActiveSessionId}
          />
        )}

        <Suspense fallback={<PageLoader />}>
          {currentPage === 'library' && (
            <LibraryPage
              language={settings.language}
              dhikrs={dhikrs}
              defaultDhikrId={settings.defaultDhikrId}
              onStartCounting={handleStartCounting}
              onOpenDetails={handleOpenDetails}
              onCreateCustom={() => handleOpenCustomCreator(null)}
              onSetDefault={(id) => {
                updateSettings({ defaultDhikrId: id });
                setActiveDhikrId(id);
              }}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'dhikr-detail' && detailDhikr && (
            <DhikrDetailsPage
              language={settings.language}
              dhikr={detailDhikr}
              isDefault={detailDhikr.id === settings.defaultDhikrId}
              onBack={() => handleNavigate('library')}
              onStartCounting={handleStartCounting}
              onEditCustom={(item) => handleOpenCustomCreator(item)}
              onSetDefault={(id) => {
                updateSettings({ defaultDhikrId: id });
                setActiveDhikrId(id);
              }}
              onDeleted={() => handleNavigate('library')}
            />
          )}

          {currentPage === 'custom-dhikr' && (
            <CustomDhikrPage
              language={settings.language}
              editingDhikr={editingDhikr}
              existingCount={dhikrs.length}
              onSaved={(savedId) => {
                setDetailDhikrId(savedId);
                setEditingDhikr(null);
                handleNavigate('library');
              }}
              onCancel={() => {
                setEditingDhikr(null);
                handleNavigate('library');
              }}
            />
          )}

          {currentPage === 'collections' && (
            <CollectionsPage
              language={settings.language}
              collections={collections}
              dhikrs={dhikrs}
              onStartCounting={handleStartCounting}
            />
          )}

          {currentPage === 'goals' && (
            <GoalsPage
              language={settings.language}
              goals={goals}
              sessions={sessions}
              dhikrs={dhikrs}
            />
          )}

          {currentPage === 'salah' && (
            <SalahTrackerPage language={settings.language} salahDays={salahDays} />
          )}

          {currentPage === 'statistics' && (
            <StatisticsPage
              language={settings.language}
              sessions={sessions}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === 'history' && (
            <HistoryPage
              language={settings.language}
              sessions={sessions}
              onResumeSession={handleResumeSession}
              onStartCounting={() => handleStartCounting()}
            />
          )}

          {currentPage === 'customization' && (
            <CustomizationStudioPage
              settings={settings}
              presets={presets}
              onUpdateSettings={updateSettings}
              onUpdateCustomization={updateCustomization}
              onUpdateCustomTheme={updateCustomTheme}
            />
          )}

          {currentPage === 'reminders' && (
            <RemindersPage language={settings.language} reminders={reminders} />
          )}

          {currentPage === 'settings' && (
            <SettingsPage
              settings={settings}
              dhikrs={dhikrs}
              onUpdateSettings={updateSettings}
              onUpdateCustomization={updateCustomization}
              onNavigate={handleNavigate}
              isInstallable={pwa.isInstallable}
              isInstalled={pwa.isInstalled}
              isIOS={pwa.isIOS}
              onInstall={pwa.install}
            />
          )}

          {currentPage === 'admin' && <AdminPage onExit={() => handleNavigate('home')} />}

          {currentPage === 'backup' && (
            <BackupRestorePage settings={settings} onReplaceSettings={replaceSettings} />
          )}

          {currentPage === 'about' && (
            <AboutPrivacyPage
              language={settings.language}
              isInstallable={pwa.isInstallable}
              isInstalled={pwa.isInstalled}
              isIOS={pwa.isIOS}
              onInstall={pwa.install}
            />
          )}
        </Suspense>
      </Layout>

      {/* Active In-App Reminder Banner */}
      {activeAlert && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-2xl bg-[var(--bg-surface)] border border-[var(--accent-gold)] p-4 shadow-xl flex items-start gap-3"
        >
          <Bell className="w-5 h-5 text-[var(--accent-gold)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{activeAlert.title}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{activeAlert.message}</p>
          </div>
          <button
            type="button"
            onClick={dismissAlert}
            aria-label="Dismiss reminder"
            className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <PushMessageBanner language={settings.language} />
      <NotificationPermissionPrompt language={settings.language} />
    </>
  );
}
