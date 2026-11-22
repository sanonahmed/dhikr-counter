export type DhikrCategory = 'durood' | 'istighfar' | 'tasbih' | 'daily_adhkar' | 'custom';

export type DailySubcategory = 'morning' | 'evening' | 'before_sleep' | 'after_salah' | 'general';

export type Language = 'en' | 'bn';

export type ThemeId =
  | 'emerald-gold'
  | 'midnight'
  | 'minimal'
  | 'gold'
  | 'ivory'
  | 'rose'
  | 'ocean'
  | 'custom';

export type CounterShape = 'circle' | 'squircle' | 'arch' | 'minimal-ring';
export type CounterSize = 'compact' | 'standard' | 'large';
export type CounterNumberFont = 'sans' | 'display' | 'mono';
export type CounterNumberSize = 'md' | 'lg' | 'xl';
export type ProgressRingStyle = 'solid' | 'segmented' | 'dotted' | 'gold-glow';
export type BackgroundStyle = 'solid' | 'gradient' | 'geometric' | 'minimal' | 'custom-image';
export type CounterAnimation = 'ripple' | 'scale' | 'bead-pulse' | 'none';
export type VibrationPattern = 'off' | 'subtle' | 'bead' | 'double';
export type SoundProfile = 'off' | 'soft-click' | 'wood-bead' | 'gentle-chime';

export type PageRoute =
  | 'home'
  | 'counter'
  | 'library'
  | 'dhikr-detail'
  | 'custom-dhikr'
  | 'collections'
  | 'goals'
  | 'statistics'
  | 'history'
  | 'customization'
  | 'reminders'
  | 'settings'
  | 'admin-notifications'
  | 'backup'
  | 'about';

export interface DhikrItem {
  id: string;
  name: string;
  nameBn?: string;
  arabic: string;
  bengaliPronunciation: string;
  englishTransliteration: string;
  bengaliTranslation: string;
  englishTranslation: string;
  description: string;
  descriptionBn?: string;
  recommendedTarget: number;
  category: DhikrCategory;
  subcategory?: DailySubcategory;
  sourceType: 'verified' | 'custom';
  sourceNote?: string;
  isFavorite: boolean;
  sortOrder: number;
  icon?: string;
  color?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CountingSession {
  id: string;
  dhikrId: string;
  dhikrName: string;
  category: DhikrCategory;
  startingCount: number;
  finalCount: number;
  target: number;
  roundsCompleted: number;
  startTime: number;
  lastUpdatedAt: number;
  completionTime?: number;
  durationSeconds: number;
  status: 'in_progress' | 'completed';
  dayKey: string; // YYYY-MM-DD local date
}

export interface DhikrCollection {
  id: string;
  name: string;
  description: string;
  dhikrIds: string[];
  color: string;
  createdAt: number;
  updatedAt: number;
}

export type GoalPeriod = 'daily' | 'weekly' | 'monthly';
export type GoalScope = 'all' | 'durood' | 'istighfar' | 'tasbih' | 'daily_adhkar' | 'dhikr';

export interface GoalItem {
  id: string;
  title: string;
  period: GoalPeriod;
  scope: GoalScope;
  dhikrId?: string;
  targetCount: number;
  isActive: boolean;
  reminderTime?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReminderItem {
  id: string;
  title: string;
  message: string;
  time: string; // HH:mm
  daysOfWeek: number[]; // 0=Sun..6=Sat
  presetType: 'morning' | 'evening' | 'durood' | 'istighfar' | 'custom';
  enabled: boolean;
  lastTriggeredDate?: string; // YYYY-MM-DD
  createdAt: number;
}

export interface CustomThemeColors {
  canvas: string;
  surface: string;
  primary: string;
  gold: string;
  text: string;
  isDark: boolean;
}

export interface CounterCustomization {
  buttonSize: CounterSize;
  shape: CounterShape;
  counterColor: string; // hex or 'theme'
  numberFont: CounterNumberFont;
  numberSize: CounterNumberSize;
  ringStyle: ProgressRingStyle;
  backgroundStyle: BackgroundStyle;
  customBackgroundImage?: string; // compressed dataURL
  animation: CounterAnimation;
  vibration: VibrationPattern;
  sound: SoundProfile;
  showArabic: boolean;
  showBengaliPronunciation: boolean;
  showTranslations: boolean;
  showTarget: boolean;
  showPercentage: boolean;
  showTimer: boolean;
}

export interface CounterPreset {
  id: string;
  name: string;
  theme: ThemeId;
  customization: CounterCustomization;
  createdAt: number;
}

export interface AppSettings {
  language: Language;
  theme: ThemeId;
  customTheme: CustomThemeColors;
  defaultDhikrId: string;
  defaultTarget: number;
  tapDebounceMs: number;
  customization: CounterCustomization;
}

export interface BackupPayload {
  schemaVersion: number;
  app: 'dhikr-counter';
  exportedAt: string;
  settings: AppSettings;
  dhikrs: DhikrItem[];
  sessions: CountingSession[];
  collections: DhikrCollection[];
  goals: GoalItem[];
  reminders: ReminderItem[];
  presets: CounterPreset[];
}
