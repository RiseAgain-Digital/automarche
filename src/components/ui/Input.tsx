"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftElement,
      rightElement,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftElement && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {leftElement}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full rounded-lg border bg-white text-slate-900 text-sm
              placeholder:text-slate-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
              disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
              transition-colors duration-150
              ${error ? "border-red-400 focus:ring-red-400" : "border-slate-300 hover:border-slate-400"}
              ${leftElement ? "pl-9" : "pl-3"}
              ${rightElement ? "pr-9" : "pr-3"}
              py-2
              ${className}
            `}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {rightElement}
            </div>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        {hint && !error && (
          <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
