"use client";

import React from "react";

interface CyberCheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  description?: string;
  badge?: string;
  variant?: "default" | "card" | "pill";
}

export function CyberCheckbox({
  label,
  description,
  badge,
  variant = "default",
  checked,
  disabled,
  className = "",
  onChange,
  ...props
}: CyberCheckboxProps) {
  if (variant === "card") {
    return (
      <label
        className={`group relative flex cursor-pointer select-none items-start gap-3 rounded-xl border p-3.5 transition-all ${
          checked
            ? "border-sky-500/60 bg-sky-950/25 shadow-[0_0_15px_rgba(0,163,255,0.12)]"
            : "border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/50"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
      >
        <div className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            className="peer sr-only"
            {...props}
          />
          <div
            className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${
              checked
                ? "border-sky-400 bg-sky-500 shadow-[0_0_8px_rgba(0,163,255,0.6)]"
                : "border-zinc-700 bg-zinc-900 group-hover:border-zinc-600"
            }`}
          >
            {checked && (
              <svg className="h-3 w-3 text-black" viewBox="0 0 12 12" fill="none" stroke="currentColor">
                <path d="M2.5 6L4.8 8.3L9.5 3.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium transition-colors ${checked ? "text-white" : "text-zinc-300"}`}>
              {label}
            </span>
            {badge && (
              <span className="rounded border border-sky-500/30 bg-sky-950/50 px-1.5 py-0.2 font-mono text-[10px] text-sky-400">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="mt-0.5 text-[11px] text-zinc-500 leading-snug">{description}</p>}
        </div>
      </label>
    );
  }

  if (variant === "pill") {
    return (
      <label
        className={`group inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-mono transition-all ${
          checked
            ? "border-sky-500/50 bg-sky-950/40 text-sky-200 shadow-[0_0_10px_rgba(0,163,255,0.15)]"
            : "border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="sr-only"
          {...props}
        />
        <span
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-all ${
            checked
              ? "border-sky-400 bg-sky-500 text-black shadow-[0_0_6px_rgba(0,163,255,0.5)]"
              : "border-zinc-700 bg-zinc-900 group-hover:border-zinc-500"
          }`}
        >
          {checked && (
            <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor">
              <path d="M2.5 6L4.8 8.3L9.5 3.5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span>{label}</span>
      </label>
    );
  }

  // Default Cyber Checkbox
  return (
    <label
      className={`group flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-300 transition-colors hover:text-white ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      } ${className}`}
    >
      <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="peer sr-only"
          {...props}
        />
        <div
          className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${
            checked
              ? "border-sky-400 bg-sky-500 shadow-[0_0_8px_rgba(0,163,255,0.5)]"
              : "border-zinc-700 bg-zinc-900/90 group-hover:border-sky-500/50"
          }`}
        >
          {checked && (
            <svg className="h-3 w-3 text-black" viewBox="0 0 12 12" fill="none" stroke="currentColor">
              <path d="M2.5 6L4.8 8.3L9.5 3.5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      {label && <span>{label}</span>}
    </label>
  );
}

export function CyberSwitch({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: string;
}) {
  return (
    <label className={`group flex cursor-pointer items-start gap-3 select-none ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-zinc-700 bg-zinc-900 p-0.5 transition-colors focus-within:ring-2 focus-within:ring-sky-500/50">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-4 bg-sky-400 shadow-[0_0_8px_rgba(0,163,255,0.7)]"
              : "translate-x-0 bg-zinc-500"
          }`}
        />
      </div>
      {label && (
        <div className="flex-1">
          <span className="text-xs font-medium text-zinc-200">{label}</span>
          {description && <p className="text-[11px] text-zinc-500">{description}</p>}
        </div>
      )}
    </label>
  );
}
