import React from 'react';
import {
  Bell,
  ChevronRight,
  Clock,
  FolderHeart,
  Globe,
  HardDriveDownload,
  Info,
  Palette,
  Target,
} from 'lucide-react';
import type {
  AppSettings,
  DhikrItem,
  Language,
  PageRoute,
  SoundProfile,
  ThemeId,
  VibrationPattern,
} from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { playTapSound, triggerHaptic } from '../utils/feedback';
import { Card, Input, Select } from '../components/ui/Primitives';
import { PWAInstallButton } from '../components/PWAInstallBanner';
import { cn } from '../utils/cn';

interface SettingsPageProps {
  settings: AppSettings;
  dhikrs: DhikrItem[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateCustomization: (patch: Partial<AppSettings['customization']>) => void;
  onNavigate: (page: PageRoute) => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstall: () => Promise<boolean>;
}

const CORE_THEMES: { id: ThemeId; label: string; bg: string; accent: string }[] = [
  { id: 'emerald-gold', label: 'Emerald Gold', bg: '#F7F5F0', accent: '#0B4F3A' },
  { id: 'midnight', label: 'Midnight', bg: '#09131B', accent: '#15996F' },
  { id: 'minimal', label: 'Minimal', bg: '#FAFAFA', accent: '#1B6B50' },
];

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  dhikrs,
  onUpdateSettings,
  onUpdateCustomization,
  onNavigate,
  isInstallable,
  isInstalled,
  isIOS,
  onInstall,
}) => {
  const t = getTranslations(settings.language);

  const navCards: { page: PageRoute; title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { page: 'customization', title: t.nav.customization, subtitle: 'Counter shape, colors, patterns, themes & presets', icon: Palette },
    { page: 'goals', title: t.nav.goals, subtitle: 'Daily, weekly, and monthly remembrance targets', icon: Target },
    { page: 'collections', title: t.nav.collections, subtitle: 'Morning, post-Salah, and custom playlists', icon: FolderHeart },
    { page: 'reminders', title: t.nav.reminders, subtitle: 'Local notification schedules', icon: Bell },
    { page: 'history', title: t.nav.history, subtitle: 'Inspect, resume, and export sessions', icon: Clock },
    { page: 'backup', title: t.nav.backup, subtitle: 'JSON backup, restore, and CSV exports', icon: HardDriveDownload },
    { page: 'about', title: t.nav.about, subtitle: 'Privacy, authenticity, and PWA guide', icon: Info },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.settings.title}</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{t.settings.subtitle}</p>
      </div>

      {/* Language & Flagship Themes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <Globe className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{t.settings.language}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                ['en', 'English'],
                ['bn', 'বাংলা'],
              ] as [Language, string][]
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => onUpdateSettings({ language: code })}
                data-testid={`lang-${code}`}
                className={cn(
                  'min-h-[44px] rounded-xl border text-sm font-medium transition-colors cursor-pointer',
                  settings.language === code
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] border-transparent'
                    : 'bg-[var(--bg-canvas)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{t.settings.theme}</span>
            <button
              type="button"
              onClick={() => onNavigate('customization')}
              className="text-xs font-medium text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              More themes →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {CORE_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => onUpdateSettings({ theme: theme.id })}
                data-testid={`theme-${theme.id}`}
                className={cn(
                  'rounded-xl border p-2.5 text-left transition-all cursor-pointer space-y-2',
                  settings.theme === theme.id
                    ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)]'
                )}
              >
                <div className="flex gap-1">
                  <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: theme.bg }} />
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.accent }} />
                </div>
                <span className="block text-[11px] font-semibold text-[var(--text-primary)] truncate">
                  {theme.label}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Sound, Vibration & Defaults */}
      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="set-sound" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            {t.settings.sound}
          </label>
          <Select
            id="set-sound"
            value={settings.customization.sound}
            onChange={(e) => {
              const sound = e.target.value as SoundProfile;
              onUpdateCustomization({ sound });
              playTapSound(sound);
            }}
          >
            <option value="off">Off</option>
            <option value="soft-click">Soft Click</option>
            <option value="wood-bead">Wood Bead</option>
            <option value="gentle-chime">Gentle Chime</option>
          </Select>
        </div>

        <div>
          <label htmlFor="set-vibration" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            {t.settings.vibration}
          </label>
          <Select
            id="set-vibration"
            value={settings.customization.vibration}
            onChange={(e) => {
              const vibration = e.target.value as VibrationPattern;
              onUpdateCustomization({ vibration });
              triggerHaptic(vibration);
            }}
          >
            <option value="off">Off</option>
            <option value="subtle">Subtle (12ms)</option>
            <option value="bead">Bead Tactile (24ms)</option>
            <option value="double">Double Pulse</option>
          </Select>
        </div>

        <div>
          <label htmlFor="set-default-dhikr" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            {t.settings.defaultDhikr}
          </label>
          <Select
            id="set-default-dhikr"
            value={settings.defaultDhikrId}
            onChange={(e) => onUpdateSettings({ defaultDhikrId: e.target.value })}
          >
            {dhikrs.map((d) => (
              <option key={d.id} value={d.id}>
                {settings.language === 'bn' && d.nameBn ? d.nameBn : d.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="set-default-target" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            {t.settings.defaultTarget}
          </label>
          <Input
            id="set-default-target"
            type="number"
            min={1}
            max={100000}
            value={settings.defaultTarget}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (Number.isFinite(val) && val >= 1) {
                onUpdateSettings({ defaultTarget: val });
              }
            }}
          />
        </div>
      </Card>

      {/* PWA Installation Card */}
      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t.settings.installPwa}</h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {isInstalled
              ? 'Dhikr Counter is running in standalone app mode.'
              : 'Install to your home screen or desktop for offline access and instant launch.'}
          </p>
        </div>
        <PWAInstallButton
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          isIOS={isIOS}
          onInstall={onInstall}
          label={t.settings.installPwa}
        />
      </Card>

      {/* Sub-pages directory */}
      <div className="space-y-2.5">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)]">{t.settings.quickLinks}</h2>
        <Card className="p-0 overflow-hidden divide-y divide-[var(--border-subtle)]">
          {navCards.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => onNavigate(item.page)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-[var(--accent-soft)] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[var(--bg-surface-muted)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{item.subtitle}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              </button>
            );
          })}
        </Card>
      </div>
    </div>
  );
};
