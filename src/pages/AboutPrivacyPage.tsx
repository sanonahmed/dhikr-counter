import React from 'react';
import { BookCheck, Keyboard, ShieldCheck, Smartphone } from 'lucide-react';
import type { Language } from '../types/dhikr';
import { getTranslations } from '../i18n/translations';
import { Card } from '../components/ui/Primitives';
import { PWAInstallButton } from '../components/PWAInstallBanner';

interface AboutPrivacyPageProps {
  language: Language;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstall: () => Promise<boolean>;
}

export const AboutPrivacyPage: React.FC<AboutPrivacyPageProps> = ({
  language,
  isInstallable,
  isInstalled,
  isIOS,
  onInstall,
}) => {
  const t = getTranslations(language);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.about.title}</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{t.about.subtitle}</p>
      </div>

      {/* Privacy */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5 text-[var(--accent-primary)]">
          <ShieldCheck className="w-5 h-5" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.about.privacyTitle}</h2>
        </div>
        <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--text-secondary)] leading-relaxed">
          {t.about.privacyPoints.map((pt) => (
            <li key={pt}>{pt}</li>
          ))}
        </ul>
      </Card>

      {/* Content Integrity */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5 text-[var(--accent-gold)]">
          <BookCheck className="w-5 h-5" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.about.authenticityTitle}</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {t.about.authenticityDesc}
        </p>
      </Card>

      {/* PWA Guide */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 text-[var(--accent-primary)]">
            <Smartphone className="w-5 h-5" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.about.installGuideTitle}</h2>
          </div>
          <PWAInstallButton
            isInstallable={isInstallable}
            isInstalled={isInstalled}
            isIOS={isIOS}
            onInstall={onInstall}
            label={t.settings.installPwa}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[var(--text-secondary)] leading-relaxed">
          <div className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-4 space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">Android (Chrome / Edge)</p>
            <p>Tap the Install button above or open browser menu (⋮) and choose &ldquo;Install app&rdquo;.</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-4 space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">iPhone &amp; iPad (Safari)</p>
            <p>Tap Share in Safari&apos;s bottom bar, scroll down, and tap &ldquo;Add to Home Screen&rdquo;.</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-4 space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">Windows / macOS / Linux</p>
            <p>Click the install icon in the right side of Chrome or Edge&apos;s address bar to run standalone.</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-4 space-y-1">
            <p className="font-semibold text-[var(--text-primary)]">Offline Support</p>
            <p>Service worker caches app assets and fonts; IndexedDB stores every tap locally without internet.</p>
          </div>
        </div>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2.5 text-[var(--accent-primary)]">
          <Keyboard className="w-5 h-5" />
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Counter Controls &amp; Shortcuts</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
          <p><strong className="text-[var(--text-primary)]">Space / Enter:</strong> Increment counter</p>
          <p><strong className="text-[var(--text-primary)]">Ctrl / Cmd + Z:</strong> Undo last count</p>
          <p><strong className="text-[var(--text-primary)]">Hold Reset:</strong> Long-press reset confirmation</p>
          <p><strong className="text-[var(--text-primary)]">Double-tap Guard:</strong> Prevents accidental spike taps</p>
        </div>
      </Card>
    </div>
  );
};
