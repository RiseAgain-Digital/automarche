"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Ban,
  ArrowLeft,
  FileText,
  Send,
  CheckCircle,
  FileOutput,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FaturaWithRelations, FaturaStatusKey } from "@/types";

const STATUS_RECOMMENDATION: Record<FaturaStatusKey, string> = {
  RECEBIDO: "Aguardar picagem",
  EM_PICAGEM: "Confirmar picagem",
  BLOQUEADO: "Criar referência do produto",
  EM_VALORIZACAO: "Validar preços",
  DIVERGENCIA: "Criar nota de débito",
  VALIDADO: "Nenhuma ação necessária",
};

const GROUPS: {
  title: string;
  icon: React.ElementType;
  statuses: FaturaStatusKey[];
}[] = [
  {
    title: "Faturas que aguardam resposta do armazém",
    icon: Clock,
    statuses: ["RECEBIDO", "EM_PICAGEM"],
  },
  {
    title: "Faturas com divergências",
    icon: AlertTriangle,
    statuses: ["DIVERGENCIA"],
  },
  {
    title: "Faturas bloqueadas por falta de referência",
    icon: Ban,
    statuses: ["BLOQUEADO"],
  },
  {
    title: "Faturas prontas para envio à contabilidade",
    icon: CheckCircle2,
    statuses: ["EM_VALORIZACAO", "VALIDADO"],
  },
];

async function fetchFaturas(): Promise<FaturaWithRelations[]> {
  const res = await fetch("/api/faturas?pageSize=200");
  if (!res.ok) throw new Error("Erro ao buscar faturas");
  const json = await res.json();
  return json.data;
}

async function fetchFaturaDetail(id: string): Promise<FaturaWithRelations> {
  const res = await fetch(`/api/faturas/${id}`);
  if (!res.ok) throw new Error("Erro ao buscar fatura");
  const json = await res.json();
  return json.data;
}

export default function OperacionalPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: faturas = [], isLoading } = useQuery({
    queryKey: ["faturas", "operacional"],
    queryFn: fetchFaturas,
    refetchInterval: 15000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["fatura", selectedId],
    queryFn: () => fetchFaturaDetail(selectedId!),
    enabled: !!selectedId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/faturas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: ["fatura", selectedId] });
      }
    },
  });

  // ── Detail view ────────────────────────────────────────────────────────────
  if (selectedId) {
    const amount = detail?.totalInvoice
      ? `${parseFloat(String(detail.totalInvoice)).toFixed(0)}€`
      : null;

    return (
      <div className="p-6 max-w-7xl mx-auto">
        <button
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        {detailLoading || !detail ? (
          <div className="space-y-4 animate-pulse">
            <div className="bg-white rounded-xl p-6 border border-slate-200 h-32" />
            <div className="bg-white rounded-xl p-6 border border-slate-200 h-48" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">
                      {detail.supplier ?? "Fornecedor não informado"}
                    </h1>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {detail.number}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {amount && (
                    <p className="text-2xl font-bold text-slate-900">{amount}</p>
                  )}
                  <div className="mt-1">
                    <StatusBadge status={detail.status} type="fatura" />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100 flex-wrap">
                <button className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                  <FileOutput className="h-4 w-4" />
                  Criar nota de débito
                </button>
                <button
                  onClick={() => updateStatus.mutate({ id: detail.id, status: "EM_VALORIZACAO" })}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Send className="h-4 w-4" />
                  Enviar para validação
                </button>
                <button
                  onClick={() => updateStatus.mutate({ id: detail.id, status: "VALIDADO" })}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <CheckCircle className="h-4 w-4" />
                  Marcar como validado
                </button>
                <button
                  onClick={() => updateStatus.mutate({ id: detail.id, status: "VALIDADO" })}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <Send className="h-4 w-4" />
                  Enviar para contabilidade
                </button>
              </div>
            </div>

            {/* Products table */}
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Produtos</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["Produto", "Referência", "Qtd Picada", "Qtd Fatura", "Preço Unit.", "Estado", "Recomendação"].map((h) => (
                        <th
                          key={h}
                          className="px-6 py-3 text-left text-xs text-slate-400 font-normal"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {detail.items.length > 0
                      ? detail.items.map((item) => {
                          const scan = detail.scanItems.find(
                            (s) => s.productCode === item.productCode
                          );
                          const discrepancy = detail.discrepancies.find(
                            (d) => d.productCode === item.productCode
                          );
                          const hasIssue = !!discrepancy;
                          return (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="px-6 py-3 font-medium text-slate-800">
                                {item.productName ?? "—"}
                              </td>
                              <td className="px-6 py-3 text-slate-500">
                                {item.productCode ?? "—"}
                              </td>
                              <td className="px-6 py-3 text-slate-500">
                                {scan
                                  ? parseFloat(String(scan.quantity)).toFixed(3)
                                  : "—"}
                              </td>
                              <td className="px-6 py-3 text-slate-500">
                                {parseFloat(String(item.quantity)).toFixed(0)}
                              </td>
                              <td className="px-6 py-3 text-slate-500">
                                {item.unitPrice
                                  ? `${parseFloat(String(item.unitPrice)).toFixed(2)}€`
                                  : "—"}
                              </td>
                              <td className="px-6 py-3">
                                <span
                                  className={`text-xs font-medium ${
                                    hasIssue
                                      ? "text-red-600"
                                      : "text-emerald-600"
                                  }`}
                                >
                                  {hasIssue ? "Divergência" : "Validado"}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-slate-400 text-xs">
                                {hasIssue
                                  ? "Criar nota de débito"
                                  : STATUS_RECOMMENDATION[
                                      detail.status as FaturaStatusKey
                                    ] ?? "—"}
                              </td>
                            </tr>
                          );
                        })
                      : detail.scanItems.length > 0
                      ? detail.scanItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-6 py-3 font-medium text-slate-800">
                              {item.productName ?? "—"}
                            </td>
                            <td className="px-6 py-3 text-slate-500">
                              {item.productCode ?? "—"}
                            </td>
                            <td className="px-6 py-3 text-slate-500">
                              {parseFloat(String(item.quantity)).toFixed(3)}
                            </td>
                            <td className="px-6 py-3 text-slate-500">—</td>
                            <td className="px-6 py-3 text-slate-500">—</td>
                            <td className="px-6 py-3">
                              <span className="text-xs font-medium text-slate-400">
                                —
                              </span>
                            </td>
                            <td className="px-6 py-3 text-slate-400 text-xs">
                              {STATUS_RECOMMENDATION[
                                detail.status as FaturaStatusKey
                              ] ?? "—"}
                            </td>
                          </tr>
                        ))
                      : (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-6 py-10 text-center text-slate-400 text-sm"
                            >
                              Nenhum produto registado
                            </td>
                          </tr>
                        )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            {detail.notes && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="text-sm font-semibold text-slate-700 mb-2">
                  Observações
                </h2>
                <p className="text-sm text-slate-600">{detail.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Overview ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Visão Geral Operacional
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Estado operacional de todas as faturas
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 h-48 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            const grouped = faturas.filter((f) =>
              group.statuses.includes(f.status as FaturaStatusKey)
            );
            return (
              <div
                key={group.title}
                className="bg-white rounded-xl border border-slate-200"
              >
                {/* Group header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Icon className="h-4 w-4" />
                    <span>{group.title}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    {grouped.length}
                  </span>
                </div>

                {/* Rows */}
                <div className="divide-y divide-slate-50">
                  {grouped.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-slate-300 text-center">
                      Nenhuma fatura
                    </p>
                  ) : (
                    grouped.map((fatura) => {
                      const amount = fatura.totalInvoice
                        ? `${parseFloat(String(fatura.totalInvoice)).toFixed(0)}€`
                        : null;
                      return (
                        <button
                          key={fatura.id}
                          onClick={() => setSelectedId(fatura.id)}
                          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {fatura.supplier ?? "Fornecedor não informado"}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {fatura.number}
                              {amount && ` · ${amount}`}
                            </p>
                          </div>
                          <StatusBadge status={fatura.status} type="fatura" size="sm" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
