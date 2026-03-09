"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  Clock,
  CheckCircle,
  Package,
  Search,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DashboardMetrics, FaturaWithRelations, FaturaStatusKey } from "@/types";

async function fetchMetrics(): Promise<DashboardMetrics> {
  const res = await fetch("/api/metrics");
  if (!res.ok) throw new Error("Erro ao buscar métricas");
  const json = await res.json();
  return json.data;
}

async function fetchRecentFaturas(): Promise<FaturaWithRelations[]> {
  const res = await fetch("/api/faturas?pageSize=5");
  if (!res.ok) throw new Error("Erro ao buscar faturas");
  const json = await res.json();
  return json.data;
}

const statusColors: Record<FaturaStatusKey, string> = {
  PENDENTE: "bg-slate-400",
  PROCESSANDO: "bg-blue-500",
  EM_REVISAO: "bg-amber-500",
  APROVADO: "bg-green-500",
  REJEITADO: "bg-red-500",
};

const statusLabels: Record<FaturaStatusKey, string> = {
  PENDENTE: "Pendente",
  PROCESSANDO: "Processando",
  EM_REVISAO: "Em Revisão",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
};

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

  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", {
    locale: ptBR,
  });

  const filteredFaturas = recentFaturas?.filter(
    (f) =>
      f.number.toLowerCase().includes(search.toLowerCase()) ||
      (f.supplier?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1 capitalize">{today}</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metricsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl p-5 border border-slate-100 animate-pulse"
            >
              <div className="flex justify-between mb-4">
                <div className="w-10 h-10 bg-slate-100 rounded-lg" />
              </div>
              <div className="h-8 bg-slate-100 rounded w-16 mb-2" />
              <div className="h-4 bg-slate-50 rounded w-24" />
            </div>
          ))
        ) : (
          <>
            <MetricCard
              title="Total de Faturas"
              value={metrics?.totalFaturas ?? 0}
              icon={FileText}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
              trend={{ value: 12, label: "vs. mês anterior", direction: "up" }}
            />
            <MetricCard
              title="Aguardando Revisão"
              value={metrics?.aguardandoRevisao ?? 0}
              icon={Clock}
              iconColor="text-amber-600"
              iconBg="bg-amber-50"
              subtitle="Faturas com discrepâncias"
            />
            <MetricCard
              title="Aprovadas Hoje"
              value={metrics?.aprovadasHoje ?? 0}
              icon={CheckCircle}
              iconColor="text-green-600"
              iconBg="bg-green-50"
              trend={{ value: 8, label: "vs. ontem", direction: "up" }}
            />
            <MetricCard
              title="Produtos Cadastrados"
              value={metrics?.totalProdutos ?? 0}
              icon={Package}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
              trend={{ value: 3, label: "novos esta semana", direction: "up" }}
            />
          </>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar faturas por número ou fornecedor..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Faturas */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Faturas Recentes
              </h2>
              <a
                href="/operacional"
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Ver todas
              </a>
            </div>
            <div className="divide-y divide-slate-50">
              {faturasLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-4 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-slate-100 rounded-full" />
                        <div>
                          <div className="h-4 bg-slate-100 rounded w-24 mb-1.5" />
                          <div className="h-3 bg-slate-50 rounded w-32" />
                        </div>
                      </div>
                      <div className="h-5 bg-slate-100 rounded w-16" />
                    </div>
                  </div>
                ))
              ) : filteredFaturas?.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400 text-sm">
                  Nenhuma fatura encontrada
                </div>
              ) : (
                filteredFaturas?.map((fatura) => (
                  <a
                    key={fatura.id}
                    href={`/operacional`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-4 w-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          #{fatura.number}
                        </p>
                        <p className="text-xs text-slate-500">
                          {fatura.supplier ?? "Fornecedor não informado"} &bull;{" "}
                          {format(new Date(fatura.createdAt), "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {fatura._count && fatura._count.discrepancies > 0 && (
                        <div className="flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {fatura._count.discrepancies}
                        </div>
                      )}
                      <StatusBadge status={fatura.status} type="fatura" size="sm" />
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Status Overview */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              Faturas por Status
            </h2>
            {metricsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="flex items-center justify-between mb-1">
                      <div className="h-3.5 bg-slate-100 rounded w-20" />
                      <div className="h-5 bg-slate-100 rounded w-8" />
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(Object.keys(statusLabels) as FaturaStatusKey[]).map((status) => {
                  const count = metrics?.faturasByStatus?.[status] ?? 0;
                  const total = metrics?.totalFaturas ?? 1;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${statusColors[status]}`}
                          />
                          <span className="text-xs text-slate-600 font-medium">
                            {statusLabels[status]}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-slate-900">
                          {count}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${statusColors[status]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick stats */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              Resumo
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Taxa de Aprovação</span>
                <span className="text-sm font-semibold text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {metrics?.totalFaturas
                    ? Math.round(
                        ((metrics.faturasByStatus?.APROVADO ?? 0) /
                          metrics.totalFaturas) *
                          100
                      )
                    : 0}
                  %
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Em Processamento</span>
                <span className="text-sm font-semibold text-blue-600">
                  {metrics?.faturasByStatus?.PROCESSANDO ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Rejeitadas</span>
                <span className="text-sm font-semibold text-red-600">
                  {metrics?.faturasByStatus?.REJEITADO ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
