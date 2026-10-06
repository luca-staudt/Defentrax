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
      {/* High-blur Cyber Backdrop */}
      <div
        className="fixed inset-0 bg-[#02050e]/85 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Cyberpunk HUD Modal Container */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative my-auto w-full ${maxWidth} overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-b from-[#0c1424] via-[#070b14] to-[#04070d] p-0 text-zinc-100 shadow-[0_0_50px_rgba(0,163,255,0.18)] backdrop-blur-2xl animate-in zoom-in-95 fade-in duration-150`}
      >
        {/* Glowing Top Scanline Accent */}
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-sky-400 to-transparent opacity-80" />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-zinc-800/80 px-6 py-4.5 bg-zinc-950/40">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_8px_#00a3ff]" />
              </span>
              <h3 className="font-display text-base sm:text-lg font-bold tracking-wide text-white">
                {title}
              </h3>
            </div>
            {subtitle && (
              <p className="font-mono text-[11px] text-zinc-400 tracking-tight flex items-center gap-1.5 pl-4">
                <span className="text-zinc-600">›</span>
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              ESC
            </span>
            <button
              onClick={onClose}
              type="button"
              className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-1.5 text-zinc-400 transition-all hover:border-sky-500/40 hover:bg-sky-950/40 hover:text-sky-300"
              aria-label="Close dialog"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="max-h-[75vh] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {children}
        </div>

        {/* Optional Action Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-zinc-800/80 bg-zinc-950/60 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
