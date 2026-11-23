import React from 'react';
import {
  BarChart3,
  Bell,
  Bot,
  BookOpen,
  Clock,
  FolderHeart,
  HardDriveDownload,
  Home,
  Info,
  Palette,
  Settings,
  Sparkles,
  Target,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Language, PageRoute } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { cn } from '../utils/cn';
import { PWAInstallButton } from './PWAInstallBanner';
import { AiTalkOverlay } from './AiTalkOverlay';

interface LayoutProps {
  currentPage: PageRoute;
  onNavigate: (page: PageRoute) => void;
  language: Language;
  isOnline: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstall: () => Promise<boolean>;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  currentPage,
  onNavigate,
  language,
  isOnline,
  isInstallable,
  isInstalled,
  isIOS,
  onInstall,
  children,
}) => {
  const t = getTranslations(language);
  const [aiTalkOpen, setAiTalkOpen] = React.useState(false);

  // Hidden owner entry point. The emblem behaves normally on a tap; holding it
  // for a moment opens the admin panel. Nothing in the UI advertises this.
  const ADMIN_LONG_PRESS_MS = 1400;
  const adminPressTimer = React.useRef<number | null>(null);
  const adminPressOpened = React.useRef(false);
  const adminPressOrigin = React.useRef<{ x: number; y: number } | null>(null);

  const cancelAdminPress = React.useCallback(() => {
    adminPressOrigin.current = null;
    if (adminPressTimer.current !== null) {
      window.clearTimeout(adminPressTimer.current);
      adminPressTimer.current = null;
    }
  }, []);

  const startAdminPress = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    adminPressOpened.current = false;
    cancelAdminPress();
    adminPressOrigin.current = { x: event.clientX, y: event.clientY };
    adminPressTimer.current = window.setTimeout(() => {
      adminPressTimer.current = null;
      onNavigate('admin');
      adminPressOpened.current = true;
    }, ADMIN_LONG_PRESS_MS);
  }, [cancelAdminPress, onNavigate]);

  // Scrolling or dragging across the emblem must not count as a long press.
  const trackAdminPress = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const origin = adminPressOrigin.current;
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) {
      cancelAdminPress();
    }
  }, [cancelAdminPress]);

  const goHome = React.useCallback(() => {
    // A completed long-press already opened the admin panel; swallow the click.
    if (adminPressOpened.current) {
      adminPressOpened.current = false;
      return;
    }
    onNavigate('home');
  }, [onNavigate]);

  const emblemPressProps = {
    onPointerDown: startAdminPress,
    onPointerMove: trackAdminPress,
    onPointerUp: cancelAdminPress,
    onPointerLeave: cancelAdminPress,
    onPointerCancel: cancelAdminPress,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };

  // Full-screen distraction-free counter view hides standard shell chrome
  if (currentPage === 'counter') {
    return <main className="min-h-screen w-full bg-[var(--bg-canvas)] text-[var(--text-primary)]">{children}</main>;
  }

  const primaryTabs: { id: PageRoute; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: t.nav.home, icon: Home },
    { id: 'counter', label: t.nav.counter, icon: Sparkles },
    { id: 'library', label: t.nav.library, icon: BookOpen },
    { id: 'statistics', label: t.nav.statistics, icon: BarChart3 },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const secondarySidebarItems: { id: PageRoute; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'goals', label: t.nav.goals, icon: Target },
    { id: 'collections', label: t.nav.collections, icon: FolderHeart },
    { id: 'history', label: t.nav.history, icon: Clock },
    { id: 'customization', label: t.nav.customization, icon: Palette },
    { id: 'reminders', label: t.nav.reminders, icon: Bell },
    { id: 'backup', label: t.nav.backup, icon: HardDriveDownload },
    { id: 'about', label: t.nav.about, icon: Info },
  ];

  const isTabActive = (tabId: PageRoute) => {
    if (tabId === currentPage) return true;
    if (tabId === 'library' && (currentPage === 'dhikr-detail' || currentPage === 'custom-dhikr' || currentPage === 'collections')) {
      return true;
    }
    if (tabId === 'statistics' && (currentPage === 'history' || currentPage === 'goals')) {
      return true;
    }
    if (tabId === 'settings' && (currentPage === 'customization' || currentPage === 'reminders' || currentPage === 'backup' || currentPage === 'about')) {
      return true;
    }
    return false;
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col lg:flex-row">
      {/* Desktop Sidebar Navigation (260px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] z-30">
        <div className="px-6 pt-6 pb-5 border-b border-[var(--border-subtle)] flex items-center gap-3" {...emblemPressProps}>
          <img
            src="/icon.svg"
            alt="Dhikr Counter emblem"
            draggable={false}
            className="w-9 h-9 rounded-xl shrink-0 select-none"
          />
          <button
            type="button"
            onClick={goHome}
            className="text-left cursor-pointer"
          >
            <span className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)] block leading-none">
              {t.appName}
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Main navigation">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setAiTalkOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={aiTalkOpen}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors cursor-pointer',
                aiTalkOpen
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                  : 'bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:opacity-80'
              )}
            >
              <Bot className="w-4 h-4 shrink-0" />
              <span>{t.nav.aiTalk}</span>
            </button>
            {primaryTabs.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                    active
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-1">
            {secondarySidebarItems.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-[var(--border-subtle)] space-y-3">
          <PWAInstallButton
            isInstallable={isInstallable}
            isInstalled={isInstalled}
            isIOS={isIOS}
            onInstall={onInstall}
            label={t.settings.installPwa}
          />
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] px-1">
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> : <WifiOff className="w-3.5 h-3.5 text-amber-600" />}
            <span>{isOnline ? t.settings.online : t.settings.offline}</span>
            <span aria-hidden="true">·</span>
            <span>{t.settings.offlineStatus}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen w-full">
        {/* Compact Mobile Top Bar (<= 52px so top + bottom stays <= 15% of 844px mobile height) */}
        <header className="lg:hidden sticky top-0 z-30 h-13 px-4 bg-[var(--bg-surface)]/92 backdrop-blur-md border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goHome}
            {...emblemPressProps}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer"
          >
            <img src="/icon.svg" alt="Dhikr Counter" draggable={false} className="w-7 h-7 rounded-lg shrink-0 select-none" />
            <span className="font-display text-lg font-bold text-[var(--text-primary)] truncate">
              {t.appName}
            </span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-[var(--accent-primary)]" aria-label="Online" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-600" aria-label="Offline" />
              )}
            </span>
            <button
              type="button"
              onClick={() => setAiTalkOpen(true)}
              aria-label={t.nav.aiTalk}
              aria-haspopup="dialog"
              aria-expanded={aiTalkOpen}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-primary)] text-xs font-semibold cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              <span>{t.nav.aiTalk}</span>
            </button>
            <PWAInstallButton
              isInstallable={isInstallable}
              isInstalled={isInstalled}
              isIOS={isIOS}
              onInstall={onInstall}
              label="Install"
            />
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (5 items: Home, Counter, Library, Statistics, Settings) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-surface)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] pb-safe"
      >
        <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
          {primaryTabs.map((item) => {
            const Icon = item.icon;
            const active = isTabActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors cursor-pointer',
                  active ? 'text-[var(--accent-primary)] font-semibold' : 'text-[var(--text-muted)]'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] leading-none truncate max-w-[64px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <AiTalkOverlay
        open={aiTalkOpen}
        onClose={() => setAiTalkOpen(false)}
        language={language}
      />
    </div>
  );
};
