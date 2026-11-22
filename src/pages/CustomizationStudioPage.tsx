import React, { useState } from 'react';
import { Check, Image as ImageIcon, Save, Trash2 } from 'lucide-react';
import type {
  AppSettings,
  BackgroundStyle,
  CounterAnimation,
  CounterCustomization,
  CounterNumberFont,
  CounterNumberSize,
  CounterPreset,
  CounterShape,
  CounterSize,
  ProgressRingStyle,
  SoundProfile,
  ThemeId,
  VibrationPattern,
} from '../types/dhikr';
import { db, generateId } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { playTapSound, triggerHaptic } from '../utils/feedback';
import { Button, Card, Input, Switch } from '../components/ui/Primitives';
import { GeometricPattern } from '../components/GeometricPattern';
import { TasbihDial } from '../components/TasbihDial';
import { cn } from '../utils/cn';

interface CustomizationStudioPageProps {
  settings: AppSettings;
  presets: CounterPreset[];
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onUpdateCustomization: (patch: Partial<CounterCustomization>) => void;
  onUpdateCustomTheme: (patch: Partial<AppSettings['customTheme']>) => void;
}

const THEME_CARDS: { id: ThemeId; name: string; swatchBg: string; swatchAccent: string; swatchGold: string }[] = [
  { id: 'emerald-gold', name: 'Emerald Gold', swatchBg: '#F7F5F0', swatchAccent: '#0B4F3A', swatchGold: '#B88A3E' },
  { id: 'midnight', name: 'Midnight', swatchBg: '#09131B', swatchAccent: '#15996F', swatchGold: '#D4A853' },
  { id: 'minimal', name: 'Minimal', swatchBg: '#FAFAFA', swatchAccent: '#1B6B50', swatchGold: '#8A7A58' },
  { id: 'gold', name: 'Gold', swatchBg: '#FAF6ED', swatchAccent: '#9C7228', swatchGold: '#C29136' },
  { id: 'ivory', name: 'Ivory', swatchBg: '#F5F2EA', swatchAccent: '#3F594A', swatchGold: '#A7854B' },
  { id: 'rose', name: 'Rose', swatchBg: '#FBF6F6', swatchAccent: '#8C3B4E', swatchGold: '#B68A4C' },
  { id: 'ocean', name: 'Ocean', swatchBg: '#F2F7F9', swatchAccent: '#115E78', swatchGold: '#B98E44' },
];

const ACCENT_COLORS = [
  { id: 'theme', label: 'Theme' },
  { id: '#0B4F3A', label: 'Emerald' },
  { id: '#B88A3E', label: 'Gold' },
  { id: '#115E78', label: 'Ocean' },
  { id: '#8C3B4E', label: 'Rose' },
  { id: '#15996F', label: 'Jade' },
];

export const CustomizationStudioPage: React.FC<CustomizationStudioPageProps> = ({
  settings,
  presets,
  onUpdateSettings,
  onUpdateCustomization,
  onUpdateCustomTheme,
}) => {
  const t = getTranslations(settings.language);
  const cust = settings.customization;

  const [activeTab, setActiveTab] = useState<'counter' | 'background' | 'display' | 'themes' | 'presets'>('counter');
  const [previewCount, setPreviewCount] = useState(33);
  const [presetName, setPresetName] = useState('');
  const [presetMsg, setPresetMsg] = useState<string | null>(null);

  const handlePreviewTap = () => {
    setPreviewCount((c) => (c >= 100 ? 1 : c + 1));
    playTapSound(cust.sound);
    triggerHaptic(cust.vibration);
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      setPresetMsg('Please choose an image smaller than 2.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateCustomization({
          backgroundStyle: 'custom-image',
          customBackgroundImage: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) return;
    await db.presets.put({
      id: generateId('preset'),
      name: trimmed,
      theme: settings.theme,
      customization: { ...cust },
      createdAt: Date.now(),
    });
    setPresetName('');
    setPresetMsg(`Saved preset "${trimmed}".`);
    setTimeout(() => setPresetMsg(null), 3000);
  };

  const handleApplyPreset = (preset: CounterPreset) => {
    onUpdateSettings({
      theme: preset.theme,
      customization: { ...preset.customization },
    });
  };

  const handleDeletePreset = async (id: string) => {
    await db.presets.delete(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.studio.title}</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{t.studio.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sticky Live Preview */}
        <Card className="lg:col-span-5 lg:sticky lg:top-6 relative overflow-hidden min-h-[420px] flex flex-col items-center justify-between text-center p-6">
          <GeometricPattern styleType={cust.backgroundStyle} customImage={cust.customBackgroundImage} />

          <div className="relative z-10 w-full space-y-2">
            <p className="text-xs font-medium text-[var(--text-muted)]">{t.studio.livePreview}</p>
            {cust.showArabic && (
              <p className="font-arabic text-2xl text-[var(--text-primary)]">أَسْتَغْفِرُ اللّٰهَ</p>
            )}
            {cust.showBengaliPronunciation && (
              <p className="text-sm font-medium text-[var(--accent-primary)]">আস্তাগফিরুল্লাহ</p>
            )}
            {cust.showTranslations && (
              <p className="text-xs text-[var(--text-muted)]">I seek forgiveness from Allah.</p>
            )}
          </div>

          <div className="relative z-10 py-4">
            <TasbihDial
              count={previewCount}
              target={100}
              percentage={previewCount}
              round={1}
              customization={cust}
              onTap={handlePreviewTap}
              tapLabel={t.counter.tapToCount}
              previewMode
            />
          </div>

          <div className="relative z-10 flex items-center justify-center gap-4 text-xs text-[var(--text-muted)] tabular-nums">
            {cust.showPercentage && <span>{previewCount}%</span>}
            {cust.showTimer && <span>01:24</span>}
            <span>{t.counter.remaining}: {100 - previewCount}</span>
          </div>
        </Card>

        {/* Controls Panel */}
        <div className="lg:col-span-7 space-y-5">
          {/* Studio Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist">
            {(
              [
                ['counter', t.studio.tabs.counter],
                ['background', t.studio.tabs.background],
                ['display', t.studio.tabs.display],
                ['themes', t.studio.tabs.themes],
                ['presets', t.studio.tabs.presets],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'min-h-[40px] px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors',
                  activeTab === id
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <Card className="space-y-6">
            {activeTab === 'counter' && (
              <>
                <OptionGroup<CounterSize>
                  label={t.studio.buttonSize}
                  value={cust.buttonSize}
                  onChange={(v) => onUpdateCustomization({ buttonSize: v })}
                  options={[
                    { value: 'compact', label: 'Compact' },
                    { value: 'standard', label: 'Standard' },
                    { value: 'large', label: 'Large' },
                  ]}
                />

                <OptionGroup<CounterShape>
                  label={t.studio.shape}
                  value={cust.shape}
                  onChange={(v) => onUpdateCustomization({ shape: v })}
                  options={[
                    { value: 'circle', label: 'Circle' },
                    { value: 'squircle', label: 'Squircle' },
                    { value: 'arch', label: 'Arch' },
                    { value: 'minimal-ring', label: 'Minimal Ring' },
                  ]}
                />

                <div>
                  <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2.5">
                    {t.studio.counterColor}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ACCENT_COLORS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onUpdateCustomization({ counterColor: item.id })}
                        className={cn(
                          'min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-2 cursor-pointer',
                          cust.counterColor === item.id
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                        )}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full"
                          style={{
                            backgroundColor:
                              item.id === 'theme' ? 'var(--accent-primary)' : item.id,
                          }}
                        />
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <OptionGroup<CounterNumberFont>
                  label={t.studio.numberFont}
                  value={cust.numberFont}
                  onChange={(v) => onUpdateCustomization({ numberFont: v })}
                  options={[
                    { value: 'display', label: 'Editorial Serif' },
                    { value: 'sans', label: 'Modern Sans' },
                    { value: 'mono', label: 'Monospace' },
                  ]}
                />

                <OptionGroup<CounterNumberSize>
                  label={t.studio.numberSize}
                  value={cust.numberSize}
                  onChange={(v) => onUpdateCustomization({ numberSize: v })}
                  options={[
                    { value: 'md', label: 'Medium' },
                    { value: 'lg', label: 'Large' },
                    { value: 'xl', label: 'Extra Large' },
                  ]}
                />

                <OptionGroup<ProgressRingStyle>
                  label={t.studio.ringStyle}
                  value={cust.ringStyle}
                  onChange={(v) => onUpdateCustomization({ ringStyle: v })}
                  options={[
                    { value: 'solid', label: 'Solid' },
                    { value: 'segmented', label: 'Segmented' },
                    { value: 'dotted', label: 'Tasbih Beads' },
                    { value: 'gold-glow', label: 'Gold Glow' },
                  ]}
                />

                <OptionGroup<CounterAnimation>
                  label={t.studio.animation}
                  value={cust.animation}
                  onChange={(v) => onUpdateCustomization({ animation: v })}
                  options={[
                    { value: 'ripple', label: 'Ripple' },
                    { value: 'scale', label: 'Gentle Scale' },
                    { value: 'bead-pulse', label: 'Bead Pulse' },
                    { value: 'none', label: 'None' },
                  ]}
                />

                <OptionGroup<SoundProfile>
                  label={t.studio.sound}
                  value={cust.sound}
                  onChange={(v) => {
                    onUpdateCustomization({ sound: v });
                    playTapSound(v);
                  }}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'soft-click', label: 'Soft Click' },
                    { value: 'wood-bead', label: 'Wood Bead' },
                    { value: 'gentle-chime', label: 'Gentle Chime' },
                  ]}
                />

                <OptionGroup<VibrationPattern>
                  label={t.studio.vibration}
                  value={cust.vibration}
                  onChange={(v) => {
                    onUpdateCustomization({ vibration: v });
                    triggerHaptic(v);
                  }}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'subtle', label: 'Subtle' },
                    { value: 'bead', label: 'Bead Tactile' },
                    { value: 'double', label: 'Double Pulse' },
                  ]}
                />
              </>
            )}

            {activeTab === 'background' && (
              <div className="space-y-5">
                <OptionGroup<BackgroundStyle>
                  label={t.studio.bgStyle}
                  value={cust.backgroundStyle}
                  onChange={(v) => onUpdateCustomization({ backgroundStyle: v })}
                  options={[
                    { value: 'geometric', label: 'Islamic Geometric' },
                    { value: 'gradient', label: 'Soft Gradient' },
                    { value: 'solid', label: 'Solid Surface' },
                    { value: 'minimal', label: 'Minimal' },
                    { value: 'custom-image', label: 'Custom Image' },
                  ]}
                />

                <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3">
                  <span className="block text-xs font-medium text-[var(--text-secondary)]">
                    {t.studio.uploadBg}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-strong)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--accent-soft)] inline-flex items-center gap-2 cursor-pointer">
                      <ImageIcon className="w-4 h-4" />
                      <span>{t.studio.uploadBg}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBgImageUpload}
                        className="sr-only"
                      />
                    </label>
                    {cust.customBackgroundImage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onUpdateCustomization({
                            backgroundStyle: 'geometric',
                            customBackgroundImage: undefined,
                          })
                        }
                      >
                        {t.studio.clearBg}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'display' && (
              <div className="divide-y divide-[var(--border-subtle)]">
                <Switch
                  id="toggle-arabic"
                  label="Show Arabic Text"
                  checked={cust.showArabic}
                  onChange={(v) => onUpdateCustomization({ showArabic: v })}
                />
                <Switch
                  id="toggle-bn-pron"
                  label="Show Bengali Pronunciation"
                  checked={cust.showBengaliPronunciation}
                  onChange={(v) => onUpdateCustomization({ showBengaliPronunciation: v })}
                />
                <Switch
                  id="toggle-translations"
                  label="Show Bengali & English Translations"
                  checked={cust.showTranslations}
                  onChange={(v) => onUpdateCustomization({ showTranslations: v })}
                />
                <Switch
                  id="toggle-target"
                  label="Show Target Count"
                  checked={cust.showTarget}
                  onChange={(v) => onUpdateCustomization({ showTarget: v })}
                />
                <Switch
                  id="toggle-pct"
                  label="Show Progress Percentage"
                  checked={cust.showPercentage}
                  onChange={(v) => onUpdateCustomization({ showPercentage: v })}
                />
                <Switch
                  id="toggle-timer"
                  label="Show Session Timer"
                  checked={cust.showTimer}
                  onChange={(v) => onUpdateCustomization({ showTimer: v })}
                />
              </div>
            )}

            {activeTab === 'themes' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {THEME_CARDS.map((theme) => {
                    const active = settings.theme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => onUpdateSettings({ theme: theme.id })}
                        className={cn(
                          'rounded-2xl border p-3.5 text-left transition-all cursor-pointer space-y-2.5',
                          active
                            ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-soft)]'
                            : 'border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full border border-black/10" style={{ backgroundColor: theme.swatchBg }} />
                          <span className="w-6 h-6 rounded-full" style={{ backgroundColor: theme.swatchAccent }} />
                          <span className="w-6 h-6 rounded-full" style={{ backgroundColor: theme.swatchGold }} />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{theme.name}</span>
                          {active && <Check className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Theme Builder */}
                <div className="pt-5 border-t border-[var(--border-subtle)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {t.studio.customThemeBuilder}
                    </h3>
                    <Button
                      size="sm"
                      variant={settings.theme === 'custom' ? 'primary' : 'outline'}
                      onClick={() => onUpdateSettings({ theme: 'custom' })}
                    >
                      {settings.theme === 'custom' ? 'Active' : 'Use Custom'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(
                      [
                        ['canvas', 'Canvas'],
                        ['surface', 'Surface'],
                        ['primary', 'Primary'],
                        ['gold', 'Gold Accent'],
                        ['text', 'Text'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] p-2.5 cursor-pointer">
                        <input
                          type="color"
                          value={settings.customTheme[key]}
                          onChange={(e) => onUpdateCustomTheme({ [key]: e.target.value })}
                          className="w-8 h-8 rounded-lg border-0 bg-transparent cursor-pointer"
                        />
                        <span className="text-xs font-medium text-[var(--text-primary)]">{label}</span>
                      </label>
                    ))}
                  </div>

                  <Switch
                    id="custom-theme-dark"
                    label="Dark Surface Mode"
                    checked={settings.customTheme.isDark}
                    onChange={(v) => onUpdateCustomTheme({ isDark: v })}
                  />
                </div>
              </div>
            )}

            {activeTab === 'presets' && (
              <div className="space-y-5">
                <form onSubmit={(e) => void handleSavePreset(e)} className="flex flex-col sm:flex-row gap-2.5">
                  <Input
                    aria-label="Preset name"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder={t.studio.presetNamePlaceholder}
                    className="flex-1"
                  />
                  <Button type="submit" variant="primary" disabled={!presetName.trim()}>
                    <Save className="w-4 h-4" />
                    {t.studio.savePreset}
                  </Button>
                </form>

                {presetMsg && (
                  <p role="status" className="text-xs font-medium text-[var(--accent-primary)]">
                    {presetMsg}
                  </p>
                )}

                {presets.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] py-6 text-center">
                    No saved presets yet. Customize your counter and save a preset for instant switching.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {presets.map((p) => (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {p.theme} · {p.customization.shape} · {p.customization.ringStyle}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => handleApplyPreset(p)}>
                            {t.studio.apply}
                          </Button>
                          <button
                            type="button"
                            onClick={() => void handleDeletePreset(p.id)}
                            aria-label={`Delete preset ${p.name}`}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

function OptionGroup<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (val: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
              value === opt.value
                ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                : 'bg-[var(--bg-canvas)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
