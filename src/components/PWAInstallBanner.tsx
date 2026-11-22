import React, { useState } from 'react';
import { Download, RefreshCw, Share, Smartphone, WifiOff } from 'lucide-react';
import { Button, Modal } from './ui/Primitives';

interface PWAInstallControlsProps {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isOnline: boolean;
  needRefresh: boolean;
  onInstall: () => Promise<boolean>;
  onApplyUpdate: () => Promise<void>;
  onDismissUpdate: () => void;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<{
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstall: () => Promise<boolean>;
  label?: string;
}> = ({ isInstallable, isInstalled, isIOS, onInstall, label = 'Install App' }) => {
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button variant="gold" size="sm" onClick={() => void onInstall()}>
        <Download className="w-4 h-4" />
        {label}
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowGuide(true)}>
        <Smartphone className="w-4 h-4" />
        {isIOS ? 'Install on iOS' : label}
      </Button>
      <Modal open={showGuide} onClose={() => setShowGuide(false)} title="Install Dhikr Counter" maxWidthClass="max-w-md">
        <div className="space-y-4 text-sm text-[var(--text-secondary)]">
          {isIOS ? (
            <>
              <p className="leading-relaxed">
                Install Dhikr Counter directly onto your iPhone or iPad home screen for a full-screen offline experience:
              </p>
              <ol className="list-decimal pl-5 space-y-2 text-[var(--text-primary)]">
                <li>
                  Tap the <strong className="inline-flex items-center gap-1"><Share className="w-3.5 h-3.5" /> Share</strong> button in Safari&apos;s toolbar.
                </li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> in the top-right corner.</li>
              </ol>
            </>
          ) : (
            <>
              <p className="leading-relaxed">
                Dhikr Counter works offline as a native-style Progressive Web App across Android, iOS, Windows, macOS, and Linux:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-[var(--text-primary)]">
                <li><strong>Chrome / Edge (Desktop):</strong> Click the install icon in the browser address bar or menu → <em>Install Dhikr Counter</em>.</li>
                <li><strong>Android Chrome:</strong> Tap the browser menu (⋮) → <em>Add to Home screen / Install app</em>.</li>
                <li><strong>iPhone / iPad Safari:</strong> Tap <em>Share</em> → <em>Add to Home Screen</em>.</li>
              </ul>
            </>
          )}
          <div className="pt-2">
            <Button variant="primary" className="w-full" onClick={() => setShowGuide(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export const PWAStatusOverlays: React.FC<PWAInstallControlsProps> = ({
  isOnline,
  needRefresh,
  onApplyUpdate,
  onDismissUpdate,
}) => {
  return (
    <>
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-amber-700 text-white px-4 py-2 text-xs font-medium shadow-lg"
        >
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Offline Mode · All counts save locally on device</span>
        </div>
      )}

      {needRefresh && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 right-4 z-50 flex items-center gap-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] px-4 py-3 shadow-xl max-w-sm"
        >
          <RefreshCw className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
          <div className="text-xs text-[var(--text-primary)]">
            <p className="font-semibold">Update available</p>
            <p className="text-[var(--text-muted)]">Refresh to load the latest version.</p>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button size="sm" variant="primary" onClick={() => void onApplyUpdate()}>
              Update
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismissUpdate}>
              Later
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
