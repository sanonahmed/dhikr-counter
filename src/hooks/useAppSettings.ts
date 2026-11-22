import { useCallback, useEffect, useState } from 'react';
import type { AppSettings, CounterCustomization, CustomThemeColors, ThemeId } from '../types/dhikr';

const STORAGE_KEY = 'dhikr-counter-settings-v1';

export const DEFAULT_CUSTOM_THEME: CustomThemeColors = {
  canvas: '#F6F4EF',
  surface: '#FFFFFF',
  primary: '#0B4F3A',
  gold: '#B88A3E',
  text: '#142820',
  isDark: false,
};

export const DEFAULT_CUSTOMIZATION: CounterCustomization = {
  buttonSize: 'standard',
  shape: 'circle',
  counterColor: 'theme',
  numberFont: 'display',
  numberSize: 'lg',
  ringStyle: 'solid',
  backgroundStyle: 'geometric',
  animation: 'ripple',
  vibration: 'bead',
  sound: 'wood-bead',
  showArabic: true,
  showBengaliPronunciation: true,
  showTranslations: true,
  showTarget: true,
  showPercentage: true,
  showTimer: true,
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'en',
  theme: 'emerald-gold',
  customTheme: DEFAULT_CUSTOM_THEME,
  defaultDhikrId: 'astaghfirullah',
  defaultTarget: 100,
  tapDebounceMs: 95,
  customization: DEFAULT_CUSTOMIZATION,
};

function loadInitialSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      customTheme: {
        ...DEFAULT_CUSTOM_THEME,
        ...(parsed.customTheme || {}),
      },
      customization: {
        ...DEFAULT_CUSTOMIZATION,
        ...(parsed.customization || {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function applyThemeToDocument(theme: ThemeId, custom: CustomThemeColors): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);

  const isDark = theme === 'midnight' || (theme === 'custom' && custom.isDark);
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const customVars = [
    '--bg-canvas',
    '--bg-surface',
    '--bg-surface-muted',
    '--bg-elevated',
    '--text-primary',
    '--text-secondary',
    '--text-muted',
    '--accent-primary',
    '--accent-primary-hover',
    '--accent-gold',
    '--border-subtle',
    '--border-strong',
    '--accent-soft',
    '--ring-track',
  ];

  if (theme === 'custom') {
    root.style.setProperty('--bg-canvas', custom.canvas);
    root.style.setProperty('--bg-surface', custom.surface);
    root.style.setProperty('--bg-surface-muted', isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
    root.style.setProperty('--bg-elevated', custom.surface);
    root.style.setProperty('--text-primary', custom.text);
    root.style.setProperty('--text-secondary', isDark ? 'rgba(241,246,244,0.78)' : 'rgba(20,40,32,0.72)');
    root.style.setProperty('--text-muted', isDark ? 'rgba(241,246,244,0.56)' : 'rgba(20,40,32,0.52)');
    root.style.setProperty('--accent-primary', custom.primary);
    root.style.setProperty('--accent-primary-hover', custom.primary);
    root.style.setProperty('--accent-gold', custom.gold);
    root.style.setProperty('--border-subtle', isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)');
    root.style.setProperty('--border-strong', isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.18)');
    root.style.setProperty('--accent-soft', isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)');
    root.style.setProperty('--ring-track', isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)');
  } else {
    for (const v of customVars) {
      root.style.removeProperty(v);
    }
  }

  // Update mobile browser theme-color meta tag
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const colorMap: Record<ThemeId, string> = {
      'emerald-gold': '#0B4F3A',
      midnight: '#09131B',
      minimal: '#FAFAFA',
      gold: '#9C7228',
      ivory: '#F5F2EA',
      rose: '#8C3B4E',
      ocean: '#115E78',
      custom: custom.primary,
    };
    metaTheme.setAttribute('content', colorMap[theme] || '#0B4F3A');
  }
}

export function useAppSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(loadInitialSettings);

  useEffect(() => {
    applyThemeToDocument(settings.theme, settings.customTheme);
    document.documentElement.lang = settings.language;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage quota exceeded or unavailable
    }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateCustomization = useCallback((patch: Partial<CounterCustomization>) => {
    setSettingsState((prev) => ({
      ...prev,
      customization: { ...prev.customization, ...patch },
    }));
  }, []);

  const updateCustomTheme = useCallback((patch: Partial<CustomThemeColors>) => {
    setSettingsState((prev) => ({
      ...prev,
      theme: 'custom',
      customTheme: { ...prev.customTheme, ...patch },
    }));
  }, []);

  const replaceSettings = useCallback((next: AppSettings) => {
    setSettingsState({
      ...DEFAULT_SETTINGS,
      ...next,
      customTheme: { ...DEFAULT_CUSTOM_THEME, ...(next.customTheme || {}) },
      customization: { ...DEFAULT_CUSTOMIZATION, ...(next.customization || {}) },
    });
  }, []);

  return {
    settings,
    updateSettings,
    updateCustomization,
    updateCustomTheme,
    replaceSettings,
  };
}
