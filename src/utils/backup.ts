import type { BackupPayload, CountingSession, SalahDay } from '../types/dhikr';
import { getSessionNetCount } from './analytics';

export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  payload?: BackupPayload;
  summary?: {
    dhikrs: number;
    sessions: number;
    collections: number;
    goals: number;
    reminders: number;
    presets: number;
    salahDays: number;
  };
}

export function validateBackupJson(rawText: string): BackupValidationResult {
  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Backup file is not a valid JSON object.' };
    }
    if (parsed.app !== 'dhikr-counter') {
      return { valid: false, error: 'This file is not a Dhikr Counter backup.' };
    }
    if (!Array.isArray(parsed.dhikrs) || !Array.isArray(parsed.sessions)) {
      return { valid: false, error: 'Backup file is missing required Dhikr or Sessions collections.' };
    }

    const payload: BackupPayload = {
      schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1,
      app: 'dhikr-counter',
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
      settings: parsed.settings,
      dhikrs: parsed.dhikrs.filter((d: unknown) => d && typeof d === 'object' && 'id' in d && 'name' in d),
      sessions: parsed.sessions.filter(
        (s: unknown) => s && typeof s === 'object' && 'id' in s && 'dhikrId' in s
      ),
      collections: Array.isArray(parsed.collections) ? parsed.collections : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
      presets: Array.isArray(parsed.presets) ? parsed.presets : [],
      salahDays: Array.isArray(parsed.salahDays)
        ? parsed.salahDays.filter(
            (day: unknown): day is SalahDay =>
              day !== null &&
              typeof day === 'object' &&
              'id' in day &&
              'statuses' in day &&
              typeof day.id === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(day.id)
          )
        : [],
    };

    return {
      valid: true,
      payload,
      summary: {
        dhikrs: payload.dhikrs.length,
        sessions: payload.sessions.length,
        collections: payload.collections.length,
        goals: payload.goals.length,
        reminders: payload.reminders.length,
        presets: payload.presets.length,
        salahDays: payload.salahDays.length,
      },
    };
  } catch {
    return { valid: false, error: 'Could not parse JSON file. Please verify the file format.' };
  }
}

export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

function escapeCsvCell(value: string | number | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sessionsToCsv(sessions: CountingSession[]): string {
  const headers = [
    'Session ID',
    'Date',
    'Dhikr Name',
    'Category',
    'Starting Count',
    'Final Count',
    'Net Recitations',
    'Target',
    'Rounds Completed',
    'Duration (Seconds)',
    'Status',
    'Start Time',
    'Completion Time',
  ];

  const rows = sessions.map((s) => [
    s.id,
    s.dayKey,
    s.dhikrName,
    s.category,
    s.startingCount,
    s.finalCount,
    getSessionNetCount(s),
    s.target,
    s.roundsCompleted,
    s.durationSeconds,
    s.status,
    new Date(s.startTime).toISOString(),
    s.completionTime ? new Date(s.completionTime).toISOString() : '',
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
