import React, { useState } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { Button, Modal } from './ui/Primitives';

interface PWAInstallControlsProps {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  onInstall: () => Promise<boolean>;
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
