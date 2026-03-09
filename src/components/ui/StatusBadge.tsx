"use client";

import type { FaturaStatusKey, TaskStatusKey } from "@/types";

const faturaStatusConfig: Record<
  FaturaStatusKey,
  { label: string; className: string }
> = {
  PENDENTE: {
    label: "Pendente",
    className: "bg-slate-100 text-slate-700 border border-slate-200",
  },
  PROCESSANDO: {
    label: "Processando",
    className: "bg-blue-100 text-blue-700 border border-blue-200",
  },
  EM_REVISAO: {
    label: "Em Revisão",
    className: "bg-amber-100 text-amber-700 border border-amber-200",
  },
  APROVADO: {
    label: "Aprovado",
    className: "bg-green-100 text-green-700 border border-green-200",
  },
  REJEITADO: {
    label: "Rejeitado",
    className: "bg-red-100 text-red-700 border border-red-200",
  },
};

const taskStatusConfig: Record<
  TaskStatusKey,
  { label: string; className: string }
> = {
  TODO: {
    label: "A Fazer",
    className: "bg-slate-100 text-slate-700 border border-slate-200",
  },
  IN_PROGRESS: {
    label: "Em Progresso",
    className: "bg-blue-100 text-blue-700 border border-blue-200",
  },
  DONE: {
    label: "Concluído",
    className: "bg-green-100 text-green-700 border border-green-200",
  },
  BLOCKED: {
    label: "Bloqueado",
    className: "bg-red-100 text-red-700 border border-red-200",
  },
};

interface StatusBadgeProps {
  status: string;
  type?: "fatura" | "task";
  size?: "sm" | "md";
}

export function StatusBadge({
  status,
  type = "fatura",
  size = "md",
}: StatusBadgeProps) {
  const config =
    type === "fatura"
      ? faturaStatusConfig[status as FaturaStatusKey]
      : taskStatusConfig[status as TaskStatusKey];

  if (!config) {
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium ${
          size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
        } bg-gray-100 text-gray-600 border border-gray-200`}
      >
        {status}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      } ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export { faturaStatusConfig, taskStatusConfig };
