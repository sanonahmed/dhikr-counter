import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}) => {
  const variants = {
    primary:
      'bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] hover:bg-[var(--accent-primary-hover)] shadow-sm',
    gold: 'bg-[var(--accent-gold)] text-white hover:opacity-95 shadow-sm',
    secondary:
      'bg-[var(--bg-surface-muted)] text-[var(--text-primary)] hover:opacity-90',
    outline:
      'bg-transparent border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--accent-soft)]',
    ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)]',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  };

  const sizes = {
    sm: 'h-9 px-3.5 text-xs gap-1.5',
    md: 'min-h-[44px] px-4 py-2 text-sm gap-2',
    lg: 'min-h-[48px] px-6 py-3 text-base gap-2',
    icon: 'h-11 w-11 p-0 justify-center',
  };

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap shrink-0 cursor-pointer',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
};

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      'rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 transition-colors',
      className
    )}
    style={{ boxShadow: 'var(--shadow-card)' }}
    {...props}
  />
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => (
  <input
    className={cn(
      'w-full min-h-[44px] rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors',
      className
    )}
    {...props}
  />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...props
}) => (
  <textarea
    className={cn(
      'w-full rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors resize-y',
      className
    )}
    {...props}
  />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...props
}) => (
  <select
    className={cn(
      'w-full min-h-[44px] rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-strong)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors cursor-pointer',
      className
    )}
    {...props}
  />
);

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, description, id }) => {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text-primary)] cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors cursor-pointer',
          checked ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-surface-muted)] border border-[var(--border-strong)]'
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full rounded-t-3xl sm:rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 shadow-2xl max-h-[88vh] overflow-y-auto',
          maxWidthClass
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
}) => (
  <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{description}</p>
    <div className="flex items-center justify-end gap-3 mt-6">
      <Button variant="outline" onClick={onClose}>
        {cancelLabel}
      </Button>
      <Button
        variant={destructive ? 'danger' : 'primary'}
        onClick={() => {
          onConfirm();
          onClose();
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)]">
    <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
    <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm leading-relaxed">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
