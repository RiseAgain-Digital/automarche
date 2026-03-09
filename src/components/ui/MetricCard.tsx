"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: number;
    label: string;
    direction: "up" | "down" | "neutral";
  };
  subtitle?: string;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  iconColor = "text-blue-600",
  iconBg = "bg-blue-50",
  trend,
  subtitle,
}: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-lg ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-medium ${
              trend.direction === "up"
                ? "text-green-600"
                : trend.direction === "down"
                  ? "text-red-600"
                  : "text-slate-500"
            }`}
          >
            {trend.direction === "up" ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : trend.direction === "down" ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : null}
            {trend.value > 0 ? "+" : ""}
            {trend.value}%
          </div>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">
          {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
        </p>
        <p className="text-sm text-slate-500 mt-1">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        {trend && (
          <p className="text-xs text-slate-400 mt-1">{trend.label}</p>
        )}
      </div>
    </div>
  );
}
