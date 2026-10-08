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
  title,
  ...props
}: CyberCheckboxProps) {
  const id = props.id || props.name;
  return (
    <div className={`form-check ${variant === "pill" ? "form-check-inline" : ""} ${className}`} title={title}>
      <input
        type="checkbox"
        className="form-check-input"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        id={id}
        {...props}
      />
      {label ? (
        <label className="form-check-label" htmlFor={id}>
          {label}
          {badge ? <span className="badge bg-primary-subtle text-primary ms-1">{badge}</span> : null}
          {description ? <span className="d-block text-muted fs-12">{description}</span> : null}
        </label>
      ) : null}
    </div>
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
    <div className="form-check form-switch">
      <input
        className="form-check-input"
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label ? (
        <label className="form-check-label">
          {label}
          {description ? <span className="d-block text-muted fs-12">{description}</span> : null}
        </label>
      ) : null}
    </div>
  );
}
