"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Package,
  Truck,
  Filter,
  ChevronDown,
  Image as ImageIcon,
  LayoutGrid,
  List,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { FaturaWithRelations, FaturaStatusKey } from "@/types";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "ALL", label: "Todas" },
  { key: "PENDENTE", label: "Pendente" },
  { key: "PROCESSANDO", label: "Processando" },
  { key: "EM_REVISAO", label: "Em Revisão" },
  { key: "APROVADO", label: "Aprovado" },
  { key: "REJEITADO", label: "Rejeitado" },
];

const statusAccent: Record<FaturaStatusKey, string> = {
  PENDENTE: "border-l-slate-400",
  PROCESSANDO: "border-l-blue-500",
  EM_REVISAO: "border-l-amber-500",
  APROVADO: "border-l-green-500",
  REJEITADO: "border-l-red-500",
};

async function fetchFaturas(status?: string): Promise<FaturaWithRelations[]> {
  const params = new URLSearchParams({ pageSize: "100" });
  if (status && status !== "ALL") params.set("status", status);
  const res = await fetch(`/api/faturas?${params.toString()}`);
  if (!res.ok) throw new Error("Erro ao buscar faturas");
  const json = await res.json();
  return json.data;
}

async function fetchFaturaDetail(
  id: string
): Promise<FaturaWithRelations> {
  const res = await fetch(`/api/faturas/${id}`);
  if (!res.ok) throw new Error("Erro ao buscar fatura");
  const json = await res.json();
  return json.data;
}

export default function OperacionalPage() {
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFatura, setSelectedFatura] = useState<string | null>(null);

  const { data: faturas = [], isLoading } = useQuery({
    queryKey: ["faturas", "operacional", activeStatus],
    queryFn: () => fetchFaturas(activeStatus),
    refetchInterval: 15000,
  });

  const { data: faturaDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["fatura", selectedFatura],
    queryFn: () => fetchFaturaDetail(selectedFatura!),
    enabled: !!selectedFatura,
  });

  const updateStatusMutation = useMutation({
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
      if (selectedFatura) {
        queryClient.invalidateQueries({
          queryKey: ["fatura", selectedFatura],
        });
      }
    },
  });

  const handleApprove = (id: string) => {
    updateStatusMutation.mutate({ id, status: "APROVADO" });
  };

  const handleReject = (id: string) => {
    updateStatusMutation.mutate({ id, status: "REJEITADO" });
  };

  const FaturaCard = ({ fatura }: { fatura: FaturaWithRelations }) => {
    const hasDiscrepancies = (fatura._count?.discrepancies ?? 0) > 0;
    const accent = statusAccent[fatura.status as FaturaStatusKey] ?? "border-l-slate-300";

    return (
      <div
        className={`bg-white rounded-xl border border-slate-100 shadow-sm border-l-4 ${accent} p-4 hover:shadow-md transition-shadow`}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <StatusBadge status={fatura.status} type="fatura" size="sm" />
            <h3 className="text-base font-bold text-slate-900 mt-1.5">
              #{fatura.number}
            </h3>
          </div>
          {hasDiscrepancies && (
            <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {fatura._count?.discrepancies} discrepâncias
            </div>
          )}
        </div>

        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Truck className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">
              {fatura.supplier ?? "Fornecedor não informado"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              {fatura._count?.items ?? 0} itens OCR &bull;{" "}
              {fatura._count?.scanItems ?? 0} lidos
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Recebido:{" "}
            {fatura.receivedAt
              ? format(new Date(fatura.receivedAt), "dd/MM/yyyy HH:mm")
              : format(new Date(fatura.createdAt), "dd/MM/yyyy HH:mm")}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedFatura(fatura.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Eye className="h-3.5 w-3.5" />
            Detalhes
          </button>
          {fatura.status !== "APROVADO" && fatura.status !== "REJEITADO" && (
            <>
              <button
                onClick={() => handleApprove(fatura.id)}
                disabled={updateStatusMutation.isPending}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Aprovar
              </button>
              <button
                onClick={() => handleReject(fatura.id)}
                disabled={updateStatusMutation.isPending}
                className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Rejeitar
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const FaturaListRow = ({ fatura }: { fatura: FaturaWithRelations }) => {
    const hasDiscrepancies = (fatura._count?.discrepancies ?? 0) > 0;

    return (
      <tr className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3">
          <StatusBadge status={fatura.status} type="fatura" size="sm" />
        </td>
        <td className="px-4 py-3 font-semibold text-slate-900">
          #{fatura.number}
        </td>
        <td className="px-4 py-3 text-slate-600 max-w-40 truncate">
          {fatura.supplier ?? "—"}
        </td>
        <td className="px-4 py-3 text-slate-500 text-xs">
          {format(new Date(fatura.createdAt), "dd/MM/yyyy")}
        </td>
        <td className="px-4 py-3 text-slate-500 text-xs">
          {fatura._count?.items ?? 0} / {fatura._count?.scanItems ?? 0}
        </td>
        <td className="px-4 py-3">
          {hasDiscrepancies ? (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {fatura._count?.discrepancies}
            </span>
          ) : (
            <span className="text-xs text-green-600">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedFatura(fatura.id)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Ver detalhes"
            >
              <Eye className="h-4 w-4" />
            </button>
            {fatura.status !== "APROVADO" && fatura.status !== "REJEITADO" && (
              <>
                <button
                  onClick={() => handleApprove(fatura.id)}
                  className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  title="Aprovar"
                >
                  <CheckCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleReject(fatura.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Rejeitar"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operacional</h1>
          <p className="text-sm text-slate-500 mt-1">
            {faturas.length} fatura{faturas.length !== 1 ? "s" : ""}{" "}
            {activeStatus !== "ALL"
              ? `com status ${STATUS_TABS.find((s) => s.key === activeStatus)?.label}`
              : "no total"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === "grid"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-colors ${
              viewMode === "list"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:bg-slate-100"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-6 bg-white border border-slate-100 rounded-xl p-1 shadow-sm w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeStatus === tab.key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "space-y-2"
          }
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`bg-white rounded-xl animate-pulse ${
                viewMode === "grid" ? "h-48" : "h-16"
              }`}
            />
          ))}
        </div>
      ) : faturas.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package className="h-14 w-14 mx-auto mb-3 opacity-20" />
          <p className="text-base font-medium">Nenhuma fatura encontrada</p>
          <p className="text-sm mt-1">
            {activeStatus !== "ALL"
              ? "Tente selecionar outro status"
              : "Crie uma fatura para começar"}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {faturas.map((fatura) => (
            <FaturaCard key={fatura.id} fatura={fatura} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["Status", "Número", "Fornecedor", "Data", "Itens (OCR/Scan)", "Discrepâncias", "Ações"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {faturas.map((fatura) => (
                <FaturaListRow key={fatura.id} fatura={fatura} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fatura Detail Modal */}
      <Modal
        isOpen={!!selectedFatura}
        onClose={() => setSelectedFatura(null)}
        title={
          faturaDetail
            ? `Fatura #${faturaDetail.number}`
            : "Detalhes da Fatura"
        }
        size="2xl"
        footer={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {faturaDetail &&
                faturaDetail.status !== "APROVADO" &&
                faturaDetail.status !== "REJEITADO" && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        handleApprove(faturaDetail.id);
                        setSelectedFatura(null);
                      }}
                      leftIcon={<CheckCircle className="h-4 w-4" />}
                    >
                      Aprovar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        handleReject(faturaDetail.id);
                        setSelectedFatura(null);
                      }}
                      leftIcon={<XCircle className="h-4 w-4" />}
                    >
                      Rejeitar
                    </Button>
                  </>
                )}
            </div>
            <Button variant="ghost" onClick={() => setSelectedFatura(null)}>
              Fechar
            </Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-6 bg-slate-100 rounded w-1/3" />
            <div className="h-48 bg-slate-100 rounded-xl" />
            <div className="h-32 bg-slate-50 rounded-xl" />
          </div>
        ) : faturaDetail ? (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-center gap-4 flex-wrap">
              <StatusBadge status={faturaDetail.status} type="fatura" />
              <div className="text-sm text-slate-500">
                <span className="font-medium text-slate-700">Fornecedor:</span>{" "}
                {faturaDetail.supplier ?? "Não informado"}
              </div>
              <div className="text-sm text-slate-500">
                <span className="font-medium text-slate-700">Recebido:</span>{" "}
                {faturaDetail.receivedAt
                  ? format(new Date(faturaDetail.receivedAt), "dd/MM/yyyy HH:mm")
                  : "—"}
              </div>
              {faturaDetail.totalInvoice && (
                <div className="text-sm text-slate-500">
                  <span className="font-medium text-slate-700">Total Fatura:</span>{" "}
                  R$ {parseFloat(String(faturaDetail.totalInvoice)).toFixed(2).replace(".", ",")}
                </div>
              )}
            </div>

            {/* Invoice image */}
            {faturaDetail.imageUrl && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Imagem da Fatura
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <img
                    src={faturaDetail.imageUrl}
                    alt={`Fatura ${faturaDetail.number}`}
                    className="w-full max-h-64 object-contain bg-slate-50"
                  />
                </div>
              </div>
            )}

            {/* OCR Items */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                Itens da Fatura (OCR) — {faturaDetail.items.length} itens
              </h3>
              {faturaDetail.items.length === 0 ? (
                <p className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3">
                  Nenhum item extraído via OCR
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        {["Código", "Produto", "Qtd", "Preço Unit.", "Total"].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 bg-white">
                      {faturaDetail.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {item.productCode ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-32 truncate">
                            {item.productName ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {parseFloat(String(item.quantity)).toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            R$ {parseFloat(String(item.unitPrice)).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 font-medium text-slate-700">
                            R$ {parseFloat(String(item.total)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Scan Items */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                Itens Escaneados — {faturaDetail.scanItems.length} itens
              </h3>
              {faturaDetail.scanItems.length === 0 ? (
                <p className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3">
                  Nenhum item escaneado registrado
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-100 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        {["Código", "Produto", "Qtd", "Escaneado em"].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 bg-white">
                      {faturaDetail.scanItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {item.productCode ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-32 truncate">
                            {item.productName ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {parseFloat(String(item.quantity)).toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-slate-400">
                            {format(new Date(item.scannedAt), "dd/MM HH:mm")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Discrepancies */}
            {faturaDetail.discrepancies.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Discrepâncias — {faturaDetail.discrepancies.length} encontradas
                </h3>
                <div className="overflow-hidden rounded-xl border border-red-100">
                  <table className="w-full text-xs">
                    <thead className="bg-red-50">
                      <tr>
                        {["Código", "Produto", "Qtd Fatura", "Qtd Scan", "Diferença", "Status"].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-3 py-2 text-left font-semibold text-red-700 uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50 bg-white">
                      {faturaDetail.discrepancies.map((d) => (
                        <tr key={d.id}>
                          <td className="px-3 py-2 font-mono text-slate-600">
                            {d.productCode ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-28 truncate">
                            {d.productName ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {parseFloat(String(d.invoiceQty)).toFixed(3)}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {parseFloat(String(d.scannedQty)).toFixed(3)}
                          </td>
                          <td
                            className={`px-3 py-2 font-bold ${
                              parseFloat(String(d.difference)) > 0
                                ? "text-orange-600"
                                : "text-red-600"
                            }`}
                          >
                            {parseFloat(String(d.difference)) > 0 ? "+" : ""}
                            {parseFloat(String(d.difference)).toFixed(3)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                d.status === "RESOLVIDO"
                                  ? "bg-green-100 text-green-700"
                                  : d.status === "IGNORADO"
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {d.status === "PENDENTE"
                                ? "Pendente"
                                : d.status === "RESOLVIDO"
                                ? "Resolvido"
                                : "Ignorado"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {faturaDetail.notes && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1.5">
                  Observações
                </h3>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                  {faturaDetail.notes}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
