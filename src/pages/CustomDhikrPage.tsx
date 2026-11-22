import React, { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import type { DhikrCategory, DhikrItem, Language } from '../types/dhikr';
import { db, generateId } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { Button, Card, Input, Select, Textarea } from '../components/ui/Primitives';

interface CustomDhikrPageProps {
  language: Language;
  editingDhikr?: DhikrItem | null;
  existingCount: number;
  onSaved: (savedId: string) => void;
  onCancel: () => void;
}

const COLOR_OPTIONS = ['#0B4F3A', '#B88A3E', '#115E78', '#8C3B4E', '#3F594A', '#15996F'];

export const CustomDhikrPage: React.FC<CustomDhikrPageProps> = ({
  language,
  editingDhikr,
  existingCount,
  onSaved,
  onCancel,
}) => {
  const t = getTranslations(language);

  const [name, setName] = useState(editingDhikr?.name || '');
  const [arabic, setArabic] = useState(editingDhikr?.arabic || '');
  const [bengaliPronunciation, setBengaliPronunciation] = useState(editingDhikr?.bengaliPronunciation || '');
  const [englishTransliteration, setEnglishTransliteration] = useState(editingDhikr?.englishTransliteration || '');
  const [bengaliTranslation, setBengaliTranslation] = useState(editingDhikr?.bengaliTranslation || '');
  const [englishTranslation, setEnglishTranslation] = useState(editingDhikr?.englishTranslation || '');
  const [recommendedTarget, setRecommendedTarget] = useState(String(editingDhikr?.recommendedTarget || 33));
  const [category, setCategory] = useState<DhikrCategory>(editingDhikr?.category || 'custom');
  const [color, setColor] = useState(editingDhikr?.color || '#0B4F3A');
  const [notes, setNotes] = useState(editingDhikr?.notes || editingDhikr?.description || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t.customForm.validationName);
      return;
    }

    const parsedTarget = parseInt(recommendedTarget, 10);
    if (!Number.isFinite(parsedTarget) || parsedTarget < 1) {
      setError(t.customForm.validationTarget);
      return;
    }

    const now = Date.now();
    const id = editingDhikr?.id || generateId('custom');
    const record: DhikrItem = {
      id,
      name: trimmedName,
      arabic: arabic.trim(),
      bengaliPronunciation: bengaliPronunciation.trim(),
      englishTransliteration: englishTransliteration.trim(),
      bengaliTranslation: bengaliTranslation.trim(),
      englishTranslation: englishTranslation.trim(),
      description: notes.trim(),
      notes: notes.trim(),
      recommendedTarget: parsedTarget,
      category,
      sourceType: 'custom',
      sourceNote: 'User-created remembrance',
      isFavorite: editingDhikr?.isFavorite ?? false,
      sortOrder: editingDhikr?.sortOrder ?? existingCount + 1,
      color,
      createdAt: editingDhikr?.createdAt ?? now,
      updatedAt: now,
    };

    await db.dhikrs.put(record);
    onSaved(id);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4" />
          {t.common.back}
        </Button>
      </div>

      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
          {editingDhikr ? t.customForm.editTitle : t.customForm.createTitle}
        </h1>
      </div>

      <Card>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" noValidate>
          {error && (
            <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="custom-name" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.customForm.nameLabel}
              </label>
              <Input
                id="custom-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.customForm.namePlaceholder}
                required
              />
            </div>

            <div>
              <label htmlFor="custom-category" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.customForm.categoryLabel}
              </label>
              <Select
                id="custom-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as DhikrCategory)}
              >
                <option value="custom">{t.categories.custom}</option>
                <option value="durood">{t.categories.durood}</option>
                <option value="istighfar">{t.categories.istighfar}</option>
                <option value="tasbih">{t.categories.tasbih}</option>
                <option value="daily_adhkar">{t.categories.daily_adhkar}</option>
              </Select>
            </div>

            <div>
              <label htmlFor="custom-target" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.customForm.targetLabel}
              </label>
              <Input
                id="custom-target"
                type="number"
                min={1}
                max={100000}
                value={recommendedTarget}
                onChange={(e) => setRecommendedTarget(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="custom-arabic" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.customForm.arabicLabel}
            </label>
            <Textarea
              id="custom-arabic"
              rows={2}
              dir="rtl"
              className="font-arabic text-xl"
              value={arabic}
              onChange={(e) => setArabic(e.target.value)}
              placeholder={t.customForm.arabicPlaceholder}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="custom-bn-pron" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.customForm.bnPronLabel}
              </label>
              <Input
                id="custom-bn-pron"
                value={bengaliPronunciation}
                onChange={(e) => setBengaliPronunciation(e.target.value)}
                placeholder={t.customForm.bnPronPlaceholder}
              />
            </div>
            <div>
              <label htmlFor="custom-en-trans" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.customForm.enTransLabel}
              </label>
              <Input
                id="custom-en-trans"
                value={englishTransliteration}
                onChange={(e) => setEnglishTransliteration(e.target.value)}
                placeholder={t.customForm.enTransPlaceholder}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="custom-bn-meaning" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.customForm.bnMeanLabel}
              </label>
              <Textarea
                id="custom-bn-meaning"
                rows={2}
                value={bengaliTranslation}
                onChange={(e) => setBengaliTranslation(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="custom-en-meaning" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t.customForm.enMeanLabel}
              </label>
              <Textarea
                id="custom-en-meaning"
                rows={2}
                value={englishTranslation}
                onChange={(e) => setEnglishTranslation(e.target.value)}
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
              {t.customForm.colorLabel}
            </span>
            <div className="flex items-center gap-2.5 flex-wrap">
              {COLOR_OPTIONS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Select color ${hex}`}
                  className="w-9 h-9 rounded-full border-2 transition-transform cursor-pointer"
                  style={{
                    backgroundColor: hex,
                    borderColor: color === hex ? 'var(--text-primary)' : 'transparent',
                    transform: color === hex ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="custom-notes" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.customForm.notesLabel}
            </label>
            <Textarea
              id="custom-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-[var(--border-subtle)]">
            <Button variant="outline" onClick={onCancel}>
              {t.customForm.cancel}
            </Button>
            <Button type="submit" variant="primary">
              <Save className="w-4 h-4" />
              {editingDhikr ? t.customForm.update : t.customForm.save}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
