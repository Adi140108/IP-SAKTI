'use client';

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './Icons';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Rendered in the header, right of the title. Hidden on print. */
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  bodyClassName?: string;
  footerClassName?: string;
  /** Dossier mode: chrome collapses to a clean, full-width printed document. */
  printable?: boolean;
}

const SIZES: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-3xl',
  lg: 'sm:max-w-5xl',
};

const emptySubscribe = () => () => {};

export default function Dialog({
  isOpen,
  onClose,
  title,
  description,
  icon,
  headerActions,
  footer,
  children,
  size = 'md',
  bodyClassName,
  footerClassName,
  printable = false,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Minimal focus trap.
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        ?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`animate-fadeIn fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-4 ${
        printable ? 'print:p-0 print:bg-white' : 'bg-ink/40'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex w-full flex-col overflow-hidden rounded-t-lg border border-line bg-surface shadow-lift sm:rounded-lg ${
          SIZES[size]
        } ${
          printable
            ? 'max-h-[92dvh] print:max-h-none print:rounded-none print:border-0 print:shadow-none'
            : 'max-h-[92dvh]'
        } ${printable ? '' : 'animate-scaleIn'}`}
      >
        {/* Header */}
        <div
          className={`flex items-start justify-between gap-3 border-b border-line px-4 py-4 sm:gap-4 sm:px-5 ${
            printable ? 'print:hidden' : 'bg-sunken'
          }`}
        >
          <div className="flex items-start gap-3">
            {icon && (
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-accent">
                {icon}
              </span>
            )}
            <div>
              <h2 className="font-display text-[17px] leading-snug text-ink">{title}</h2>
              {description && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{description}</p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted transition-colors hover:bg-subtle hover:text-ink cursor-pointer"
            >
              <XIcon size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={bodyClassName ?? 'min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7'}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className={
              footerClassName ??
              `flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-6 ${
                printable ? 'print:hidden' : 'bg-sunken'
              }`
            }
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
