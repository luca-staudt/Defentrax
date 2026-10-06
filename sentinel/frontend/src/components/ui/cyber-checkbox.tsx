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
        className={`group relative flex cursor-pointer select-none items-start gap-3 rounded-lg border p-3 transition ${
          checked
            ? "border-sky-500/60 bg-sky-950/20"
            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70"
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
            className={`flex h-4 w-4 items-center justify-center rounded border transition ${
              checked
                ? "border-sky-500 bg-sky-500 text-white"
                : "border-zinc-700 bg-zinc-900 group-hover:border-zinc-600"
            }`}
          >
            {checked && (
              <svg className="h-3 w-3 stroke-white" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6L4.8 8.3L9.5 3.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${checked ? "text-white" : "text-zinc-300"}`}>
              {label}
            </span>
            {badge && (
              <span className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.2 font-mono text-[10px] text-zinc-300">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="mt-0.5 text-xs text-zinc-400">{description}</p>}
        </div>
      </label>
    );
  }

  if (variant === "pill") {
    return (
      <label
        className={`group inline-flex cursor-pointer select-none items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition ${
          checked
            ? "border-sky-500/50 bg-sky-950/30 text-sky-200"
            : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
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
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition ${
            checked
              ? "border-sky-500 bg-sky-500 text-white"
              : "border-zinc-700 bg-zinc-900 group-hover:border-zinc-500"
          }`}
        >
          {checked && (
            <svg className="h-2.5 w-2.5 stroke-white" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L4.8 8.3L9.5 3.5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="font-mono text-[11px]">{label}</span>
      </label>
    );
  }

  return (
    <label
      className={`group flex cursor-pointer select-none items-center gap-2 text-xs text-zinc-300 hover:text-white ${
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
          className={`flex h-4 w-4 items-center justify-center rounded border transition ${
            checked
              ? "border-sky-500 bg-sky-500 text-white"
              : "border-zinc-700 bg-zinc-900 group-hover:border-zinc-500"
          }`}
        >
          {checked && (
            <svg className="h-3 w-3 stroke-white" viewBox="0 0 12 12" fill="none">
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
    <label className={`group flex cursor-pointer items-start gap-2.5 select-none ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-zinc-700 bg-zinc-900 p-0.5 transition-colors">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`h-3.5 w-3.5 rounded-full transition-transform ${
            checked ? "translate-x-4 bg-sky-500" : "translate-x-0 bg-zinc-500"
          }`}
        />
      </div>
      {label && (
        <div className="flex-1">
          <span className="text-xs font-medium text-zinc-200">{label}</span>
          {description && <p className="text-[11px] text-zinc-400">{description}</p>}
        </div>
      )}
    </label>
  );
}
