"use client";

import { useEffect } from "react";

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-2xl",
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className={`relative w-full ${maxWidth} overflow-hidden rounded-2xl border border-sky-500/30 bg-[#090d16] p-6 text-zinc-100 shadow-2xl shadow-sky-950/50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150`}
      >
        <div className="flex items-start justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold tracking-wide text-white flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-mono text-zinc-400">{subtitle}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 max-h-[75vh] overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}
