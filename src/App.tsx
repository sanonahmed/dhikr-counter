import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
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

const PAGE_ROUTES: PageRoute[] = [
  'home',
  'counter',
  'library',
  'dhikr-detail',
  'custom-dhikr',
  'collections',
  'goals',
  'salah',
  'statistics',
  'history',
  'customization',
  'reminders',
  'settings',
  'admin',
  'backup',
  'about',
];

interface AppHistoryState {
  page: PageRoute;
  aiTalk: boolean;
  index: number;
}

const isPageRoute = (value: unknown): value is PageRoute =>
  typeof value === 'string' && PAGE_ROUTES.includes(value as PageRoute);

const readHistoryState = (value: unknown): AppHistoryState | null => {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (!isPageRoute(state.page)) return null;
  return {
    page: state.page,
    aiTalk: state.aiTalk === true,
    index:
      typeof state.index === 'number' && Number.isFinite(state.index)
        ? Math.max(0, Math.floor(state.index))
        : 0,
  };
};

const hasAdminHash = () => window.location.hash.replace('#', '').toLowerCase() === 'admin';

const initialPageFromUrl = (): PageRoute => (hasAdminHash() ? 'admin' : 'home');

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
  const [currentPage, setCurrentPage] = useState<PageRoute>(initialPageFromUrl);
  const [aiTalkOpen, setAiTalkOpen] = useState(false);
  const historyIndexRef = useRef(0);
  const currentPageRef = useRef(currentPage);
  const aiTalkOpenRef = useRef(aiTalkOpen);
  currentPageRef.current = currentPage;
  aiTalkOpenRef.current = aiTalkOpen;
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

  // Each page transition is a real browser/PWA history entry. This is what
  // keeps the system Back button inside the app instead of closing it while a
  // section (Settings, Counter, AI Talk, ...) is open.
  const navigateTo = useCallback((page: PageRoute, options?: { replace?: boolean }) => {
    const overlayWasOpen = aiTalkOpenRef.current;
    const replace = options?.replace === true || overlayWasOpen;

    setAiTalkOpen(false);
    aiTalkOpenRef.current = false;

    if (!replace && page === currentPageRef.current) return;

    const currentState = readHistoryState(window.history.state);
    const baseIndex = currentState?.index ?? historyIndexRef.current;
    const index = replace ? baseIndex : baseIndex + 1;
    const nextState: AppHistoryState = { page, aiTalk: false, index };
    // Drop the hidden `#admin` deep link once the owner leaves the panel.
    const url =
      page !== 'admin' && hasAdminHash()
        ? `${window.location.pathname}${window.location.search}`
        : undefined;

    if (replace) {
      window.history.replaceState(nextState, '', url);
    } else {
      window.history.pushState(nextState, '', url);
    }

    historyIndexRef.current = index;
    currentPageRef.current = page;
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const openAiTalk = useCallback(() => {
    if (aiTalkOpenRef.current) return;
    const currentState = readHistoryState(window.history.state);
    const index = (currentState?.index ?? historyIndexRef.current) + 1;
    window.history.pushState(
      { page: currentPageRef.current, aiTalk: true, index } satisfies AppHistoryState,
      ''
    );
    historyIndexRef.current = index;
    aiTalkOpenRef.current = true;
    setAiTalkOpen(true);
  }, []);

  const closeAiTalk = useCallback(() => {
    if (!aiTalkOpenRef.current) return;
    aiTalkOpenRef.current = false;
    setAiTalkOpen(false);

    const currentState = readHistoryState(window.history.state);
    if (currentState?.aiTalk) {
      window.history.back();
      return;
    }

    window.history.replaceState(
      {
        page: currentPageRef.current,
        aiTalk: false,
        index: currentState?.index ?? historyIndexRef.current,
      } satisfies AppHistoryState,
      ''
    );
  }, []);

  const goBack = useCallback(
    (fallbackPage: PageRoute) => {
      if (aiTalkOpenRef.current) {
        closeAiTalk();
        return;
      }
      const currentState = readHistoryState(window.history.state);
      const index = currentState?.index ?? historyIndexRef.current;
      if (index > 0) {
        window.history.back();
        return;
      }
      navigateTo(fallbackPage, { replace: true });
    },
    [closeAiTalk, navigateTo]
  );

  const handleNavigate = (page: PageRoute) => {
    navigateTo(page);
  };

  const toggleAiTalk = () => {
    if (aiTalkOpenRef.current) closeAiTalk();
    else openAiTalk();
  };

  useEffect(() => {
    const initialState: AppHistoryState = {
      page: currentPageRef.current,
      aiTalk: false,
      index: 0,
    };
    window.history.replaceState(initialState, '', window.location.href);
    historyIndexRef.current = 0;

    const onPopState = (event: PopStateEvent) => {
      const nextState = readHistoryState(event.state);
      if (!nextState) {
        // A foreign or malformed history entry: keep the app on a valid screen.
        currentPageRef.current = 'home';
        aiTalkOpenRef.current = false;
        setCurrentPage('home');
        setAiTalkOpen(false);
        return;
      }
      historyIndexRef.current = nextState.index;
      currentPageRef.current = nextState.page;
      aiTalkOpenRef.current = nextState.aiTalk;
      setCurrentPage(nextState.page);
      setAiTalkOpen(nextState.aiTalk);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Private owner entry point. No public UI element links to the admin panel:
  // it opens only from `#admin`, Ctrl+Alt+A (Cmd+Alt+A), or a long-press on the
  // app emblem in Layout, and then asks the server for the admin passcode.
  useEffect(() => {
    const openFromHash = () => {
      if (!hasAdminHash() || currentPageRef.current === 'admin') return;
      navigateTo('admin');
    };
    const openFromShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        navigateTo('admin');
      }
    };

    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    window.addEventListener('keydown', openFromShortcut);
    return () => {
      window.removeEventListener('hashchange', openFromHash);
      window.removeEventListener('keydown', openFromShortcut);
    };
  }, [navigateTo]);

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
        aiTalkOpen={aiTalkOpen}
        onCloseAiTalk={closeAiTalk}
        onToggleAiTalk={toggleAiTalk}
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
            onBack={() => goBack('home')}
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
              onBack={() => goBack('library')}
              onStartCounting={handleStartCounting}
              onEditCustom={(item) => handleOpenCustomCreator(item)}
              onSetDefault={(id) => {
                updateSettings({ defaultDhikrId: id });
                setActiveDhikrId(id);
              }}
              onDeleted={() => goBack('library')}
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
                goBack('library');
              }}
              onCancel={() => {
                setEditingDhikr(null);
                goBack('library');
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

          {currentPage === 'admin' && <AdminPage onExit={() => goBack('home')} />}

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
