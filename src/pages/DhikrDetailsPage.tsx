import React, { useState } from 'react';
import { ArrowLeft, Check, Edit3, Heart, Play, Trash2 } from 'lucide-react';
import type { DhikrItem, Language } from '../types/dhikr';
import { db } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { Button, Card, ConfirmDialog } from '../components/ui/Primitives';
import { cn } from '../utils/cn';

interface DhikrDetailsPageProps {
  language: Language;
  dhikr: DhikrItem;
  isDefault: boolean;
  onBack: () => void;
  onStartCounting: (dhikrId: string) => void;
  onEditCustom: (dhikr: DhikrItem) => void;
  onSetDefault: (dhikrId: string) => void;
  onDeleted: () => void;
}

export const DhikrDetailsPage: React.FC<DhikrDetailsPageProps> = ({
  language,
  dhikr,
  isDefault,
  onBack,
  onStartCounting,
  onEditCustom,
  onSetDefault,
  onDeleted,
}) => {
  const t = getTranslations(language);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleFavorite = async () => {
    await db.dhikrs.update(dhikr.id, { isFavorite: !dhikr.isFavorite, updatedAt: Date.now() });
  };

  const handleDelete = async () => {
    await db.dhikrs.delete(dhikr.id);
    onDeleted();
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          {t.details.backToLibrary}
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void toggleFavorite()}>
            <Heart className={cn('w-4 h-4', dhikr.isFavorite && 'fill-current text-[var(--accent-gold)]')} />
            {t.library.favoritesOnly}
          </Button>
          {dhikr.sourceType === 'custom' && (
            <>
              <Button variant="outline" size="sm" onClick={() => onEditCustom(dhikr)}>
                <Edit3 className="w-4 h-4" />
                {t.details.editCustom}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4" />
                {t.common.delete}
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            {t.categories[dhikr.category]}
            {dhikr.subcategory ? ` · ${t.subcategories[dhikr.subcategory]}` : ''}
            {' · '}
            <span className={dhikr.sourceType === 'verified' ? 'text-[var(--accent-primary)] font-medium' : 'text-[var(--accent-gold)] font-medium'}>
              {dhikr.sourceType === 'verified' ? t.library.verified : t.library.customSource}
            </span>
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
            {language === 'bn' && dhikr.nameBn ? dhikr.nameBn : dhikr.name}
          </h1>
          {dhikr.nameBn && language === 'en' && (
            <p className="text-sm text-[var(--text-muted)]">{dhikr.nameBn}</p>
          )}
        </div>

        {dhikr.arabic && (
          <div className="rounded-2xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] p-6">
            <p className="text-xs text-[var(--text-muted)] mb-3">{t.details.arabicText}</p>
            <p className="font-arabic text-3xl sm:text-4xl text-right text-[var(--text-primary)] leading-[2.2]">
              {dhikr.arabic}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {dhikr.bengaliPronunciation && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-medium text-[var(--text-muted)]">{t.details.bengaliPronunciation}</h2>
              <p className="text-base font-medium text-[var(--accent-primary)] leading-relaxed">
                {dhikr.bengaliPronunciation}
              </p>
            </div>
          )}

          {dhikr.englishTransliteration && (
            <div className="space-y-1.5">
              <h2 className="text-xs font-medium text-[var(--text-muted)]">{t.details.transliteration}</h2>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed italic">
                {dhikr.englishTransliteration}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
          {dhikr.bengaliTranslation && (
            <div className="space-y-1">
              <h2 className="text-xs font-medium text-[var(--text-muted)]">{t.details.bengaliMeaning}</h2>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">{dhikr.bengaliTranslation}</p>
            </div>
          )}

          {dhikr.englishTranslation && (
            <div className="space-y-1">
              <h2 className="text-xs font-medium text-[var(--text-muted)]">{t.details.englishMeaning}</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{dhikr.englishTranslation}</p>
            </div>
          )}

          {(dhikr.description || dhikr.notes) && (
            <div className="space-y-1">
              <h2 className="text-xs font-medium text-[var(--text-muted)]">{t.details.description}</h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {language === 'bn' && dhikr.descriptionBn ? dhikr.descriptionBn : dhikr.description || dhikr.notes}
              </p>
            </div>
          )}
        </div>

        <div className="pt-5 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-[var(--text-muted)] space-y-0.5">
            <p className="tabular-nums">
              {t.details.recommendedTarget}: <strong className="text-[var(--text-primary)]">{dhikr.recommendedTarget}</strong>
            </p>
            {dhikr.sourceNote && <p>{t.details.source}: {dhikr.sourceNote}</p>}
          </div>

          <div className="flex items-center gap-2.5">
            {!isDefault ? (
              <Button variant="outline" onClick={() => onSetDefault(dhikr.id)}>
                {t.library.setDefault}
              </Button>
            ) : (
              <span className="text-xs font-medium text-[var(--accent-primary)] inline-flex items-center gap-1 px-2">
                <Check className="w-4 h-4" /> {t.library.defaultLabel}
              </span>
            )}
            <Button variant="primary" size="lg" onClick={() => onStartCounting(dhikr.id)}>
              <Play className="w-4 h-4 fill-current" />
              {t.dashboard.startCounting}
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        title={`Delete "${dhikr.name}"?`}
        description="This permanently removes your custom Dhikr entry."
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        destructive
      />
    </div>
  );
};
