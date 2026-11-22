import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  Copy,
  FolderHeart,
  Heart,
  Play,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import type { DhikrCategory, DhikrItem, Language, PageRoute } from '../types/dhikr';
import { db, generateId } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { Button, Card, ConfirmDialog, EmptyState, Input } from '../components/ui/Primitives';
import { cn } from '../utils/cn';

interface LibraryPageProps {
  language: Language;
  dhikrs: DhikrItem[];
  defaultDhikrId: string;
  onStartCounting: (dhikrId: string) => void;
  onOpenDetails: (dhikrId: string) => void;
  onCreateCustom: () => void;
  onSetDefault: (dhikrId: string) => void;
  onNavigate: (page: PageRoute) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  language,
  dhikrs,
  defaultDhikrId,
  onStartCounting,
  onOpenDetails,
  onCreateCustom,
  onSetDefault,
  onNavigate,
}) => {
  const t = getTranslations(language);
  const [selectedCategory, setSelectedCategory] = useState<'all' | DhikrCategory>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<DhikrItem | null>(null);

  const sortedDhikrs = useMemo(
    () => [...dhikrs].sort((a, b) => a.sortOrder - b.sortOrder),
    [dhikrs]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedDhikrs.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (favoritesOnly && !item.isFavorite) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.nameBn || '').toLowerCase().includes(q) ||
        item.arabic.includes(q) ||
        item.bengaliPronunciation.toLowerCase().includes(q) ||
        item.englishTransliteration.toLowerCase().includes(q) ||
        item.englishTranslation.toLowerCase().includes(q)
      );
    });
  }, [sortedDhikrs, selectedCategory, favoritesOnly, query]);

  const categories: { id: 'all' | DhikrCategory; label: string }[] = [
    { id: 'all', label: t.categories.all },
    { id: 'durood', label: t.categories.durood },
    { id: 'istighfar', label: t.categories.istighfar },
    { id: 'tasbih', label: t.categories.tasbih },
    { id: 'daily_adhkar', label: t.categories.daily_adhkar },
    { id: 'custom', label: t.categories.custom },
  ];

  const handleToggleFavorite = async (item: DhikrItem) => {
    await db.dhikrs.update(item.id, { isFavorite: !item.isFavorite, updatedAt: Date.now() });
  };

  const handleDuplicate = async (item: DhikrItem) => {
    const now = Date.now();
    const maxOrder = sortedDhikrs.reduce((m, d) => Math.max(m, d.sortOrder), 0);
    await db.dhikrs.put({
      ...item,
      id: generateId('custom'),
      name: `${item.name} (Copy)`,
      nameBn: item.nameBn ? `${item.nameBn} (কপি)` : undefined,
      sourceType: 'custom',
      sourceNote: 'User-created copy',
      category: item.category === 'durood' ? 'durood' : 'custom',
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= filtered.length) return;
    const a = filtered[index];
    const b = filtered[targetIdx];
    await db.transaction('rw', db.dhikrs, async () => {
      await db.dhikrs.update(a.id, { sortOrder: b.sortOrder });
      await db.dhikrs.update(b.id, { sortOrder: a.sortOrder });
    });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    await db.dhikrs.delete(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.library.title}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t.library.subtitle}</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="outline" onClick={() => onNavigate('collections')}>
            <FolderHeart className="w-4 h-4" />
            {t.library.collections}
          </Button>
          <Button variant="primary" onClick={onCreateCustom} data-testid="create-custom-dhikr-btn">
            <Plus className="w-4 h-4" />
            {t.library.createCustom}
          </Button>
        </div>
      </div>

      {/* Search & Category Filter Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              aria-label={t.common.search}
              placeholder={t.library.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={favoritesOnly ? 'gold' : 'outline'}
            onClick={() => setFavoritesOnly((v) => !v)}
            aria-pressed={favoritesOnly}
          >
            <Heart className={cn('w-4 h-4', favoritesOnly && 'fill-current')} />
            {t.library.favoritesOnly}
          </Button>
        </div>

        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Dhikr categories"
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer',
                  active
                    ? 'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)]'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dhikr Cards Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-6 h-6" />}
          title={t.library.emptyTitle}
          description={t.library.emptyDesc}
          action={
            <Button variant="primary" onClick={onCreateCustom}>
              <Plus className="w-4 h-4" />
              {t.library.createCustom}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item, idx) => {
            const isDefault = item.id === defaultDhikrId;
            return (
              <Card key={item.id} className="flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  {/* Quiet unboxed metadata line */}
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5 truncate">
                      <span>{t.categories[item.category]}</span>
                      {item.subcategory && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{t.subcategories[item.subcategory]}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          item.sourceType === 'verified'
                            ? 'text-[var(--accent-primary)] font-medium'
                            : 'text-[var(--accent-gold)] font-medium'
                        }
                      >
                        {item.sourceType === 'verified' ? t.library.verified : t.library.customSource}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleFavorite(item)}
                        aria-label={`Favorite ${item.name}`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-[var(--accent-soft)] cursor-pointer"
                      >
                        <Heart
                          className={cn(
                            'w-4 h-4',
                            item.isFavorite
                              ? 'text-[var(--accent-gold)] fill-current'
                              : 'text-[var(--text-muted)]'
                          )}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMove(idx, -1)}
                        disabled={idx === 0}
                        aria-label={`Move ${item.name} up`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMove(idx, 1)}
                        disabled={idx === filtered.length - 1}
                        aria-label={`Move ${item.name} down`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Title & Arabic */}
                  <div>
                    <button
                      type="button"
                      onClick={() => onOpenDetails(item.id)}
                      className="text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)] text-left cursor-pointer"
                    >
                      {language === 'bn' && item.nameBn ? item.nameBn : item.name}
                    </button>
                    {item.arabic && (
                      <p className="font-arabic text-2xl text-right text-[var(--text-primary)] mt-2 line-clamp-2">
                        {item.arabic}
                      </p>
                    )}
                  </div>

                  {/* Pronunciation & Meaning */}
                  <div className="space-y-1">
                    {item.bengaliPronunciation && (
                      <p className="text-sm font-medium text-[var(--accent-primary)] line-clamp-2">
                        {item.bengaliPronunciation}
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                      {language === 'bn' ? item.bengaliTranslation : item.englishTranslation}
                    </p>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] tabular-nums">
                    <span>
                      {t.dashboard.target}: {item.recommendedTarget}
                    </span>
                    {isDefault && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[var(--accent-primary)] font-medium inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> {t.library.defaultLabel}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onSetDefault(item.id)}
                        title={t.library.setDefault}
                      >
                        {t.library.setDefault}
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(item)}
                      aria-label={`Duplicate ${item.name}`}
                      title={t.library.duplicate}
                      className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {item.sourceType === 'custom' && (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(item)}
                        aria-label={`Delete ${item.name}`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onOpenDetails(item.id)}>
                      {t.library.details}
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => onStartCounting(item.id)}>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {t.library.countNow}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
        title={`Delete "${pendingDelete?.name}"?`}
        description="This removes the custom Dhikr from your library. Past session logs in History remain intact."
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        destructive
      />
    </div>
  );
};
