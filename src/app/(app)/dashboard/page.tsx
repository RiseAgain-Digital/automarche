"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  Clock,
  AlertTriangle,
  Ban,
  Euro,
  Timer,
  Search,
  Printer,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DashboardMetrics, FaturaWithRelations, FaturaStatusKey } from "@/types";

const STATUS_RECOMMENDATION: Record<FaturaStatusKey, string> = {
  RECEBIDO: "Aguardar picagem",
  EM_PICAGEM: "Confirmar picagem",
  BLOQUEADO: "Criar referência do produto",
  EM_VALORIZACAO: "Validar preços",
  DIVERGENCIA: "Criar nota de débito",
  VALIDADO: "Nenhuma ação necessária",
};

async function fetchMetrics(): Promise<DashboardMetrics> {
  const res = await fetch("/api/metrics");
  if (!res.ok) throw new Error("Erro ao buscar métricas");
  const json = await res.json();
  return json.data;
}

async function fetchRecentFaturas(): Promise<FaturaWithRelations[]> {
  const res = await fetch("/api/faturas?pageSize=10");
  if (!res.ok) throw new Error("Erro ao buscar faturas");
  const json = await res.json();
  return json.data;
}

export default function DashboardPage() {
  const [search, setSearch] = useState("");

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["metrics"],
    queryFn: fetchMetrics,
    refetchInterval: 30000,
  });

  const { data: recentFaturas, isLoading: faturasLoading } = useQuery({
    queryKey: ["faturas", "recent"],
    queryFn: fetchRecentFaturas,
    refetchInterval: 30000,
  });

  const filteredFaturas = recentFaturas?.filter(
    (f) =>
      f.number.toLowerCase().includes(search.toLowerCase()) ||
      (f.supplier?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  const metricCards = [
    {
      label: "Faturas recebidas hoje",
      value: metrics?.totalFaturas ?? 0,
      icon: FileText,
      iconColor: "text-blue-500",
    },
    {
      label: "Faturas com divergências",
      value: metrics?.faturasByStatus?.DIVERGENCIA ?? 0,
      icon: AlertTriangle,
      iconColor: "text-red-400",
    },
    {
      label: "Faturas bloqueadas",
      value: metrics?.faturasByStatus?.BLOQUEADO ?? 0,
      icon: Ban,
      iconColor: "text-orange-400",
    },
    {
      label: "Valor com divergência",
      value: "—",
      icon: Euro,
      iconColor: "text-red-400",
    },
    {
      label: "Tempo médio validação",
      value: "—",
      icon: Timer,
      iconColor: "text-amber-400",
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Visão geral do estado das faturas
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar faturas..."
              className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-52"
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors bg-white">
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-slate-400 leading-snug">{card.label}</p>
                <Icon className={`h-4 w-4 flex-shrink-0 ${card.iconColor}`} />
              </div>
              {metricsLoading ? (
                <div className="h-8 bg-slate-100 rounded w-12 animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent faturas table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Faturas recentes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {["Fornecedor", "Nº Fatura", "Valor", "Estado", "Recomendação"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs text-slate-400 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {faturasLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredFaturas?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm">
                    Nenhuma fatura encontrada
                  </td>
                </tr>
              ) : (
                filteredFaturas?.map((fatura) => {
                  const amount = fatura.totalInvoice
                    ? `${parseFloat(String(fatura.totalInvoice)).toFixed(0)}€`
                    : "—";
                  const recommendation =
                    STATUS_RECOMMENDATION[fatura.status as FaturaStatusKey] ?? "—";
                  return (
                    <tr key={fatura.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {fatura.supplier ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-400">{fatura.number}</td>
                      <td className="px-6 py-4 font-medium text-slate-900">{amount}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={fatura.status} type="fatura" size="sm" />
                      </td>
                      <td className="px-6 py-4 text-slate-400">{recommendation}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
