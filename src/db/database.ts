import Dexie, { type Table } from 'dexie';
import type {
  CountingSession,
  CounterPreset,
  DhikrCollection,
  DhikrItem,
  GoalItem,
  ReminderItem,
  SalahDay,
} from '../types/dhikr';
import { PREBUILT_DHIKR } from '../data/prebuiltDhikr';

export class DhikrCounterDB extends Dexie {
  dhikrs!: Table<DhikrItem, string>;
  sessions!: Table<CountingSession, string>;
  collections!: Table<DhikrCollection, string>;
  goals!: Table<GoalItem, string>;
  reminders!: Table<ReminderItem, string>;
  presets!: Table<CounterPreset, string>;
  salahDays!: Table<SalahDay, string>;

  constructor() {
    super('DhikrCounterDB');
    this.version(1).stores({
      dhikrs: 'id, category, isFavorite, sortOrder, sourceType, updatedAt',
      sessions: 'id, dhikrId, category, dayKey, status, startTime, lastUpdatedAt',
      collections: 'id, name, createdAt',
      goals: 'id, period, scope, isActive, createdAt',
      reminders: 'id, enabled, presetType, time',
      presets: 'id, name, createdAt',
    });
    this.version(2).stores({
      dhikrs: 'id, category, isFavorite, sortOrder, sourceType, updatedAt',
      sessions: 'id, dhikrId, category, dayKey, status, startTime, lastUpdatedAt',
      collections: 'id, name, createdAt',
      goals: 'id, period, scope, isActive, createdAt',
      reminders: 'id, enabled, presetType, time',
      presets: 'id, name, createdAt',
      salahDays: 'id, updatedAt',
    });
  }
}

export const db = new DhikrCounterDB();

let seedPromise: Promise<void> | null = null;

export function ensureDatabaseSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const existingCount = await db.dhikrs.count();
      if (existingCount === 0) {
        await db.dhikrs.bulkPut(PREBUILT_DHIKR);
      } else {
        // Ensure any missing verified prebuilt entries exist without overwriting user edits/favorites
        const existingIds = new Set(await db.dhikrs.toCollection().primaryKeys());
        const missing = PREBUILT_DHIKR.filter((item) => !existingIds.has(item.id));
        if (missing.length > 0) {
          await db.dhikrs.bulkPut(missing);
        }
      }

      const collectionCount = await db.collections.count();
      if (collectionCount === 0) {
        const now = Date.now();
        await db.collections.bulkPut([
          {
            id: 'col-after-salah',
            name: 'After Salah Tasbih',
            description: 'SubhanAllah, Alhamdulillah, Allahu Akbar, and Tahlil',
            dhikrIds: ['subhanallah', 'alhamdulillah', 'allahu-akbar', 'after-salah-tahlil'],
            color: '#0B4F3A',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'col-morning-evening',
            name: 'Morning & Evening Essentials',
            description: 'Durood Sharif, Sayyidul Istighfar, and daily protection',
            dhikrIds: [
              'durood-sharif',
              'sayyidul-istighfar',
              'morning-subhanallahi-wa-bihamdihi',
              'evening-hasbiyallah',
            ],
            color: '#B88A3E',
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }

      const goalCount = await db.goals.count();
      if (goalCount === 0) {
        const now = Date.now();
        await db.goals.bulkPut([
          {
            id: 'goal-daily-istighfar',
            title: 'Daily Istighfar',
            period: 'daily',
            scope: 'istighfar',
            targetCount: 100,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'goal-daily-durood',
            title: 'Daily Durood Sharif',
            period: 'daily',
            scope: 'durood',
            targetCount: 100,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'goal-daily-tasbih',
            title: 'Daily Tasbih',
            period: 'daily',
            scope: 'tasbih',
            targetCount: 100,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }
    })();
  }
  return seedPromise;
}

export function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
