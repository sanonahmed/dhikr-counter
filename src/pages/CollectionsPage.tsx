import React, { useState } from 'react';
import { Check, Edit3, FolderHeart, Play, Plus, Trash2 } from 'lucide-react';
import type { DhikrCollection, DhikrItem, Language } from '../types/dhikr';
import { db, generateId } from '../db/database';
import { getTranslations } from '../i18n/translations';
import { Button, Card, ConfirmDialog, EmptyState, Input, Modal, Textarea } from '../components/ui/Primitives';

interface CollectionsPageProps {
  language: Language;
  collections: DhikrCollection[];
  dhikrs: DhikrItem[];
  onStartCounting: (dhikrId: string) => void;
}

const COLORS = ['#0B4F3A', '#B88A3E', '#115E78', '#8C3B4E', '#3F594A'];

export const CollectionsPage: React.FC<CollectionsPageProps> = ({
  language,
  collections,
  dhikrs,
  onStartCounting,
}) => {
  const t = getTranslations(language);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DhikrCollection | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [color, setColor] = useState('#0B4F3A');
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DhikrCollection | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setSelectedIds([]);
    setColor('#0B4F3A');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (col: DhikrCollection) => {
    setEditing(col);
    setName(col.name);
    setDescription(col.description);
    setSelectedIds(col.dhikrIds);
    setColor(col.color);
    setError(null);
    setModalOpen(true);
  };

  const toggleDhikrSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a collection name.');
      return;
    }
    const now = Date.now();
    const record: DhikrCollection = {
      id: editing?.id || generateId('col'),
      name: name.trim(),
      description: description.trim(),
      dhikrIds: selectedIds,
      color,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.collections.put(record);
    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await db.collections.delete(deleteTarget.id);
    setDeleteTarget(null);
  };

  const dhikrMap = new Map(dhikrs.map((d) => [d.id, d]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">{t.collections.title}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{t.collections.subtitle}</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {t.collections.newCollection}
        </Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState
          icon={<FolderHeart className="w-6 h-6" />}
          title={t.collections.emptyTitle}
          description={t.collections.emptyDesc}
          action={
            <Button variant="primary" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              {t.collections.newCollection}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {collections.map((col) => {
            const items = col.dhikrIds
              .map((id) => dhikrMap.get(id))
              .filter((x): x is DhikrItem => Boolean(x));

            return (
              <Card key={col.id} className="flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-muted)] tabular-nums">
                        {items.length} {t.collections.itemsCount}
                      </p>
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] mt-0.5">
                        {col.name}
                      </h2>
                      {col.description && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1">{col.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(col)}
                        aria-label={`Edit ${col.name}`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(col)}
                        aria-label={`Delete ${col.name}`}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                      {items.map((item) => (
                        <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {language === 'bn' && item.nameBn ? item.nameBn : item.name}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] tabular-nums">
                              {t.dashboard.target}: {item.recommendedTarget}
                            </p>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => onStartCounting(item.id)}>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            {t.library.countNow}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Collection' : t.collections.newCollection}
      >
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 text-xs text-red-600">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="col-name" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.collections.nameLabel}
            </label>
            <Input
              id="col-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., After Fajr Routine"
            />
          </div>

          <div>
            <label htmlFor="col-desc" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t.collections.descLabel}
            </label>
            <Textarea
              id="col-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2">Color</span>
            <div className="flex gap-2">
              {COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  aria-label={`Collection color ${hex}`}
                  className="w-8 h-8 rounded-full border-2 cursor-pointer"
                  style={{
                    backgroundColor: hex,
                    borderColor: color === hex ? 'var(--text-primary)' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
              {t.collections.selectDhikr} ({selectedIds.length})
            </span>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
              {dhikrs.map((item) => {
                const checked = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleDhikrSelection(item.id)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--accent-soft)] cursor-pointer"
                  >
                    <span className="text-sm text-[var(--text-primary)] truncate">
                      {language === 'bn' && item.nameBn ? item.nameBn : item.name}
                    </span>
                    <span
                      className="w-5 h-5 rounded-md border flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: checked ? 'var(--accent-primary)' : 'transparent',
                        borderColor: checked ? 'var(--accent-primary)' : 'var(--border-strong)',
                        color: '#fff',
                      }}
                    >
                      {checked && <Check className="w-3.5 h-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {t.collections.save}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Deleting a collection does not delete any Dhikr entries inside it."
        confirmLabel={t.common.delete}
        cancelLabel={t.common.cancel}
        destructive
      />
    </div>
  );
};
