"use client";

import { useEffect } from "react";

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-2xl",
  footer,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Clean Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative my-auto w-full ${maxWidth} overflow-hidden rounded-xl border border-zinc-800 bg-[#0c1017] p-0 text-zinc-100 shadow-2xl shadow-black/80 animate-in zoom-in-95 fade-in duration-150`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4 bg-[#090d14]">
          <div>
            <h3 className="font-sans text-sm sm:text-base font-semibold text-white">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-zinc-400">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <kbd className="hidden sm:inline-flex items-center rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              ESC
            </kbd>
            <button
              onClick={onClose}
              type="button"
              className="rounded-lg border border-transparent p-1.5 text-zinc-400 transition hover:border-zinc-800 hover:bg-zinc-800/60 hover:text-white"
              aria-label="Close"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[75vh] overflow-y-auto p-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-zinc-800/80 bg-[#090d14] px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
