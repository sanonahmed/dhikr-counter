import React, { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import type { AppSettings, BackupPayload } from '../types/dhikr';
import { db } from '../db/database';
import { getTranslations } from '../i18n/translations';
import {
  BACKUP_SCHEMA_VERSION,
  downloadTextFile,
  mergeById,
  sessionsToCsv,
  validateBackupJson,
  type BackupValidationResult,
} from '../utils/backup';
import { toLocalDayKey } from '../utils/dateUtils';
import { Button, Card, ConfirmDialog } from '../components/ui/Primitives';

interface BackupRestorePageProps {
  settings: AppSettings;
  onReplaceSettings: (next: AppSettings) => void;
}

export const BackupRestorePage: React.FC<BackupRestorePageProps> = ({
  settings,
  onReplaceSettings,
}) => {
  const t = getTranslations(settings.language);
  const [validation, setValidation] = useState<BackupValidationResult | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleExportFullJson = async () => {
    const [dhikrs, sessions, collections, goals, reminders, presets] = await Promise.all([
      db.dhikrs.toArray(),
      db.sessions.toArray(),
      db.collections.toArray(),
      db.goals.toArray(),
      db.reminders.toArray(),
      db.presets.toArray(),
    ]);

    const payload: BackupPayload = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      app: 'dhikr-counter',
      exportedAt: new Date().toISOString(),
      settings,
      dhikrs,
      sessions,
      collections,
      goals,
      reminders,
      presets,
    };

    downloadTextFile(
      `dhikr-counter-backup-${toLocalDayKey()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    );
    setStatusMessage('Full JSON backup downloaded.');
  };

  const handleExportCsv = async () => {
    const sessions = await db.sessions.toArray();
    const csv = sessionsToCsv(sessions);
    downloadTextFile(`dhikr-statistics-${toLocalDayKey()}.csv`, csv, 'text/csv;charset=utf-8');
    setStatusMessage('Statistics CSV exported.');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const result = validateBackupJson(reader.result);
        setValidation(result);
        setStatusMessage(null);
      }
    };
    reader.readAsText(file);
  };

  const executeRestore = async (mode: 'merge' | 'replace') => {
    if (!validation?.valid || !validation.payload) return;
    const data = validation.payload;

    if (mode === 'replace') {
      await db.transaction(
        'rw',
        [db.dhikrs, db.sessions, db.collections, db.goals, db.reminders, db.presets],
        async () => {
          await Promise.all([
            db.dhikrs.clear(),
            db.sessions.clear(),
            db.collections.clear(),
            db.goals.clear(),
            db.reminders.clear(),
            db.presets.clear(),
          ]);
          if (data.dhikrs.length) await db.dhikrs.bulkPut(data.dhikrs);
          if (data.sessions.length) await db.sessions.bulkPut(data.sessions);
          if (data.collections.length) await db.collections.bulkPut(data.collections);
          if (data.goals.length) await db.goals.bulkPut(data.goals);
          if (data.reminders.length) await db.reminders.bulkPut(data.reminders);
          if (data.presets.length) await db.presets.bulkPut(data.presets);
        }
      );
      if (data.settings) onReplaceSettings(data.settings);
      setStatusMessage('Backup restored (existing data replaced).');
    } else {
      const [curD, curS, curC, curG, curR, curP] = await Promise.all([
        db.dhikrs.toArray(),
        db.sessions.toArray(),
        db.collections.toArray(),
        db.goals.toArray(),
        db.reminders.toArray(),
        db.presets.toArray(),
      ]);
      await db.transaction(
        'rw',
        [db.dhikrs, db.sessions, db.collections, db.goals, db.reminders, db.presets],
        async () => {
          await db.dhikrs.bulkPut(mergeById(curD, data.dhikrs));
          await db.sessions.bulkPut(mergeById(curS, data.sessions));
          await db.collections.bulkPut(mergeById(curC, data.collections));
          await db.goals.bulkPut(mergeById(curG, data.goals));
          await db.reminders.bulkPut(mergeById(curR, data.reminders));
          await db.presets.bulkPut(mergeById(curP, data.presets));
        }
      );
      setStatusMessage('Backup merged cleanly without duplicate records.');
    }

    setValidation(null);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.backup.title}</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{t.backup.subtitle}</p>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-primary)]/30 px-4 py-3 text-sm text-[var(--accent-primary)] flex items-center gap-2 font-medium"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Export Section */}
      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Export Local Data</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Your JSON backup includes all custom Dhikr, counting sessions, goals, collections, reminders, counter presets, and settings.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void handleExportFullJson()}>
            <Download className="w-4 h-4" />
            {t.backup.exportAllJson}
          </Button>
          <Button variant="outline" onClick={() => void handleExportCsv()}>
            <FileSpreadsheet className="w-4 h-4" />
            {t.backup.exportCsv}
          </Button>
        </div>
      </Card>

      {/* Import Section */}
      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{t.backup.importTitle}</h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{t.backup.importDesc}</p>

        <label className="min-h-[44px] px-4 py-2.5 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-canvas)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--accent-soft)] inline-flex items-center gap-2 cursor-pointer">
          <Upload className="w-4 h-4 text-[var(--accent-primary)]" />
          <span>Select JSON Backup File</span>
          <input type="file" accept="application/json,.json" onChange={handleFileChange} className="sr-only" />
        </label>

        {validation && !validation.valid && (
          <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-600">
            {validation.error}
          </div>
        )}

        {validation?.valid && validation.summary && (
          <div className="rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Backup Validated</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                {validation.summary.dhikrs} Dhikr · {validation.summary.sessions} Sessions ·{' '}
                {validation.summary.goals} Goals · {validation.summary.collections} Collections ·{' '}
                {validation.summary.reminders} Reminders · {validation.summary.presets} Presets
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium border cursor-pointer ${
                  importMode === 'merge'
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] border-transparent'
                    : 'border-[var(--border-strong)] text-[var(--text-primary)]'
                }`}
              >
                {t.backup.mergeMode}
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium border cursor-pointer ${
                  importMode === 'replace'
                    ? 'bg-red-600 text-white border-transparent'
                    : 'border-[var(--border-strong)] text-[var(--text-primary)]'
                }`}
              >
                {t.backup.replaceMode}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={importMode === 'replace' ? 'danger' : 'primary'}
                onClick={() => {
                  if (importMode === 'replace') {
                    setConfirmReplace(true);
                  } else {
                    void executeRestore('merge');
                  }
                }}
              >
                Restore Now
              </Button>
              <Button variant="ghost" onClick={() => setValidation(null)}>
                {t.common.cancel}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={() => void executeRestore('replace')}
        title={t.backup.confirmReplaceTitle}
        description={t.backup.confirmReplaceDesc}
        confirmLabel="Replace All Data"
        cancelLabel={t.common.cancel}
        destructive
      />
    </div>
  );
};
