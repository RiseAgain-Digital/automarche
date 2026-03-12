"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  closestCenter,
  getFirstCollision,
  UniqueIdentifier,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import {
  Plus,
  Upload,
  X,
  FileText,
  AlertTriangle,
  Truck,
  Calendar,
  Package,
  User,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { FaturaWithRelations, FaturaStatusKey } from "@/types";

const COLUMNS: {
  key: FaturaStatusKey;
  label: string;
  headerBg: string;
  headerText: string;
  dot: string;
  columnBg: string;
  ring: string;
}[] = [
  { key: "RECEBIDO", label: "Recebido", headerBg: "bg-amber-50", headerText: "text-amber-700", dot: "bg-amber-400", columnBg: "bg-amber-50/30", ring: "ring-amber-200" },
  { key: "EM_PICAGEM", label: "Em Picagem", headerBg: "bg-amber-100", headerText: "text-amber-800", dot: "bg-amber-500", columnBg: "bg-amber-50/20", ring: "ring-amber-300" },
  { key: "BLOQUEADO", label: "Bloqueado", headerBg: "bg-orange-50", headerText: "text-orange-700", dot: "bg-orange-500", columnBg: "bg-orange-50/30", ring: "ring-orange-200" },
  { key: "EM_VALORIZACAO", label: "Em Valorização", headerBg: "bg-blue-50", headerText: "text-blue-700", dot: "bg-blue-500", columnBg: "bg-blue-50/30", ring: "ring-blue-200" },
  { key: "DIVERGENCIA", label: "Divergência", headerBg: "bg-red-50", headerText: "text-red-700", dot: "bg-red-400", columnBg: "bg-red-50/30", ring: "ring-red-200" },
  { key: "VALIDADO", label: "Validado", headerBg: "bg-emerald-50", headerText: "text-emerald-700", dot: "bg-emerald-500", columnBg: "bg-emerald-50/30", ring: "ring-emerald-200" },
];

const STATUS_BORDER: Record<FaturaStatusKey, string> = {
  RECEBIDO: "border-l-amber-400",
  EM_PICAGEM: "border-l-amber-500",
  BLOQUEADO: "border-l-orange-500",
  EM_VALORIZACAO: "border-l-blue-500",
  DIVERGENCIA: "border-l-red-500",
  VALIDADO: "border-l-emerald-500",
};

function buildColumnItems(
  faturas: FaturaWithRelations[]
): Record<FaturaStatusKey, string[]> {
  const result = {} as Record<FaturaStatusKey, string[]>;
  for (const col of COLUMNS) {
    result[col.key] = faturas
      .filter((f) => f.status === col.key)
      .map((f) => f.id);
  }
  return result;
}

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

async function updateFaturaStatus(id: string, status: string) {
  const res = await fetch(`/api/faturas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error("Erro ao atualizar fatura");
  return res.json();
}

const createFaturaSchema = z.object({
  number: z.string().min(1, "Número é obrigatório"),
  supplier: z.string().optional(),
  notes: z.string().optional(),
});

type CreateFaturaForm = z.infer<typeof createFaturaSchema>;

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// ─── Kanban card ─────────────────────────────────────────────────────────────

function FaturaCard({
  fatura,
  overlay = false,
  onOpen,
}: {
  fatura: FaturaWithRelations;
  overlay?: boolean;
  onOpen?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: fatura.id, disabled: overlay });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
  };

  if (isDragging && !overlay) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-100/60 h-[88px]"
      />
    );
  }

  const statusBorder =
    STATUS_BORDER[fatura.status as FaturaStatusKey] ?? "border-l-slate-300";
  const hasDiscrepancies = (fatura._count?.discrepancies ?? 0) > 0;

  const card = (
    <div
      className={`group relative bg-white rounded-lg border border-slate-200/80 border-l-[3px] ${statusBorder} p-3 ${
        overlay
          ? "shadow-2xl rotate-[1.5deg] scale-[1.03] cursor-grabbing"
          : "shadow-[0_1px_3px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:border-slate-300 cursor-grab active:cursor-grabbing"
      } transition-all duration-150`}
      onClick={!overlay && onOpen ? () => onOpen(fatura.id) : undefined}
    >
      {/* Number + discrepancy flag */}
      <div className="flex items-start justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-500 font-mono tracking-wide">
          #{fatura.number}
        </span>
        {hasDiscrepancies && (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-500 bg-red-50 rounded px-1.5 py-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            {fatura._count?.discrepancies}
          </span>
        )}
      </div>

      {/* Supplier */}
      {fatura.supplier && (
        <p className="text-sm font-medium text-slate-800 truncate leading-tight mb-2">
          {fatura.supplier}
        </p>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>{format(new Date(fatura.createdAt), "dd/MM/yy")}</span>
          {fatura._count && fatura._count.items > 0 && (
            <>
              <span className="text-slate-200">·</span>
              <span>{fatura._count.items} itens</span>
            </>
          )}
        </div>
        {fatura.user && (
          <div
            className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0"
            title={fatura.user.name}
          >
            <span className="text-[9px] font-bold text-white">
              {getInitials(fatura.user.name)}
            </span>
          </div>
        )}
      </div>

      {/* Hover arrow indicator */}
      {!overlay && onOpen && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight className="h-3 w-3 text-slate-400" />
        </div>
      )}
    </div>
  );

  if (overlay) return card;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {card}
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  items,
  allFaturas,
  realCount,
  onOpen,
}: {
  column: (typeof COLUMNS)[0];
  items: string[];
  allFaturas: FaturaWithRelations[];
  realCount: number;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  return (
    <div className="flex flex-col w-64 flex-shrink-0">
      {/* Column header */}
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${column.headerBg} border border-b-0 border-slate-200`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.dot}`} />
          <span className={`text-xs font-semibold uppercase tracking-wider ${column.headerText}`}>
            {column.label}
          </span>
        </div>
        <span
          className={`text-xs font-bold ${column.headerText} opacity-70 bg-white/60 rounded-full px-1.5 py-0.5`}
        >
          {realCount}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-40 px-2 pt-2 rounded-b-lg border border-t-0 border-slate-200 space-y-2 transition-all duration-150 ${
          isOver
            ? `${column.columnBg} ring-2 ring-inset ${column.ring}`
            : column.columnBg
        }`}
        style={{ paddingBottom: isOver ? "2.5rem" : "0.5rem" }}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((id) => {
            const fatura = allFaturas.find((f) => f.id === id);
            if (!fatura) return null;
            return <FaturaCard key={id} fatura={fatura} onOpen={onOpen} />;
          })}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-20 text-slate-300">
            <FileText className="h-6 w-6 mb-1 opacity-40" />
            <span className="text-[11px]">Vazio</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail slide panel ───────────────────────────────────────────────────────

function FaturaDetailPanel({
  faturaId,
  onClose,
  onApprove,
  onReject,
}: {
  faturaId: string | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["fatura", faturaId],
    queryFn: () => fetchFaturaDetail(faturaId!),
    enabled: !!faturaId,
  });

  const isOpen = !!faturaId;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            {detail && (
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                Fatura
              </p>
            )}
            <h2 className="text-base font-bold text-slate-900">
              {detail ? `#${detail.number}` : "Carregando..."}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Panel content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-5 space-y-4 animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-1/3" />
              <div className="h-32 bg-slate-100 rounded-lg" />
              <div className="h-24 bg-slate-50 rounded-lg" />
            </div>
          ) : detail ? (
            <div className="p-5 space-y-5">
              {/* Status + meta */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Status
                  </p>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
                      {
                        RECEBIDO: "bg-amber-50 text-amber-700",
                        EM_PICAGEM: "bg-amber-100 text-amber-800",
                        BLOQUEADO: "bg-orange-50 text-orange-700",
                        EM_VALORIZACAO: "bg-blue-50 text-blue-700",
                        DIVERGENCIA: "bg-red-50 text-red-700",
                        VALIDADO: "bg-emerald-50 text-emerald-700",
                      }[detail.status as FaturaStatusKey] ??
                      "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {
                      {
                        RECEBIDO: "Recebido",
                        EM_PICAGEM: "Em Picagem",
                        BLOQUEADO: "Bloqueado",
                        EM_VALORIZACAO: "Em Valorização",
                        DIVERGENCIA: "Divergência",
                        VALIDADO: "Validado",
                      }[detail.status] ?? detail.status
                    }
                  </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Criado em
                  </p>
                  <p className="text-xs font-medium text-slate-700">
                    {format(new Date(detail.createdAt), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
              </div>

              {/* Info row */}
              <div className="space-y-2">
                {detail.supplier && (
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-700">{detail.supplier}</span>
                  </div>
                )}
                {detail.user && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-700">{detail.user.name}</span>
                  </div>
                )}
                {detail.receivedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-700">
                      Recebido:{" "}
                      {format(new Date(detail.receivedAt), "dd/MM/yyyy HH:mm")}
                    </span>
                  </div>
                )}
                {detail.totalInvoice && (
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-700">
                      Total:{" "}
                      <span className="font-semibold">
                        R${" "}
                        {parseFloat(String(detail.totalInvoice))
                          .toFixed(2)
                          .replace(".", ",")}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center bg-slate-50 rounded-lg py-2.5 px-1">
                  <p className="text-lg font-bold text-slate-800">
                    {detail._count?.items ?? detail.items.length}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Itens OCR
                  </p>
                </div>
                <div className="text-center bg-slate-50 rounded-lg py-2.5 px-1">
                  <p className="text-lg font-bold text-slate-800">
                    {detail._count?.scanItems ?? detail.scanItems.length}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Scaneados
                  </p>
                </div>
                <div
                  className={`text-center rounded-lg py-2.5 px-1 ${
                    (detail._count?.discrepancies ?? detail.discrepancies.length) > 0
                      ? "bg-red-50"
                      : "bg-slate-50"
                  }`}
                >
                  <p
                    className={`text-lg font-bold ${
                      (detail._count?.discrepancies ?? detail.discrepancies.length) > 0
                        ? "text-red-600"
                        : "text-slate-800"
                    }`}
                  >
                    {detail._count?.discrepancies ?? detail.discrepancies.length}
                  </p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Discrepâncias
                  </p>
                </div>
              </div>

              {/* Invoice image */}
              {detail.imageUrl && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Imagem
                  </p>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <img
                      src={detail.imageUrl}
                      alt={`Fatura ${detail.number}`}
                      className="w-full max-h-48 object-contain bg-slate-50"
                    />
                  </div>
                </div>
              )}

              {/* OCR Items */}
              {detail.items.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Itens da Fatura — {detail.items.length}
                  </p>
                  <div className="rounded-lg border border-slate-100 overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                        <tr>
                          {["Código", "Produto", "Qtd", "Total"].map((h) => (
                            <th
                              key={h}
                              className="px-2.5 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 bg-white">
                        {detail.items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-2.5 py-2 font-mono text-slate-500 text-[11px]">
                              {item.productCode ?? "—"}
                            </td>
                            <td className="px-2.5 py-2 text-slate-700 max-w-[120px] truncate">
                              {item.productName ?? "—"}
                            </td>
                            <td className="px-2.5 py-2 text-slate-600">
                              {parseFloat(String(item.quantity)).toFixed(3)}
                            </td>
                            <td className="px-2.5 py-2 font-medium text-slate-700">
                              R${" "}
                              {parseFloat(String(item.total))
                                .toFixed(2)
                                .replace(".", ",")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Scan Items */}
              {detail.scanItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Itens Escaneados — {detail.scanItems.length}
                  </p>
                  <div className="rounded-lg border border-slate-100 overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                        <tr>
                          {["Código", "Produto", "Qtd", "Em"].map((h) => (
                            <th
                              key={h}
                              className="px-2.5 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 bg-white">
                        {detail.scanItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-2.5 py-2 font-mono text-slate-500 text-[11px]">
                              {item.productCode ?? "—"}
                            </td>
                            <td className="px-2.5 py-2 text-slate-700 max-w-[100px] truncate">
                              {item.productName ?? "—"}
                            </td>
                            <td className="px-2.5 py-2 text-slate-600">
                              {parseFloat(String(item.quantity)).toFixed(3)}
                            </td>
                            <td className="px-2.5 py-2 text-slate-400 text-[11px]">
                              {format(new Date(item.scannedAt), "dd/MM HH:mm")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Discrepancies */}
              {detail.discrepancies.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Discrepâncias — {detail.discrepancies.length}
                  </p>
                  <div className="rounded-lg border border-red-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-red-50 border-b border-red-100">
                        <tr>
                          {["Produto", "Fatura", "Scan", "Diff"].map((h) => (
                            <th
                              key={h}
                              className="px-2.5 py-2 text-left text-[10px] font-semibold text-red-600 uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50 bg-white">
                        {detail.discrepancies.map((d) => (
                          <tr key={d.id}>
                            <td className="px-2.5 py-2 text-slate-700 max-w-[120px] truncate">
                              {d.productName ?? d.productCode ?? "—"}
                            </td>
                            <td className="px-2.5 py-2 text-slate-600">
                              {parseFloat(String(d.invoiceQty)).toFixed(3)}
                            </td>
                            <td className="px-2.5 py-2 text-slate-600">
                              {parseFloat(String(d.scannedQty)).toFixed(3)}
                            </td>
                            <td
                              className={`px-2.5 py-2 font-bold ${
                                parseFloat(String(d.difference)) > 0
                                  ? "text-orange-600"
                                  : "text-red-600"
                              }`}
                            >
                              {parseFloat(String(d.difference)) > 0 ? "+" : ""}
                              {parseFloat(String(d.difference)).toFixed(3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {detail.notes && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Observações
                  </p>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 leading-relaxed">
                    {detail.notes}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Panel footer */}
        {detail &&
          detail.status !== "VALIDADO" &&
          detail.status !== "DIVERGENCIA" && (
            <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
              <button
                onClick={() => {
                  onApprove(detail.id);
                  onClose();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Aprovar
              </button>
              <button
                onClick={() => {
                  onReject(detail.id);
                  onClose();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
              >
                <XCircle className="h-4 w-4" />
                Rejeitar
              </button>
            </div>
          )}
      </div>
    </>
  );
}

// ─── Collision detection ──────────────────────────────────────────────────────
// Prefer pointer-within for column droppables so dragging anywhere inside a
// column (not just the bottom) correctly registers as entering that column.
function kanbanCollision(args: Parameters<typeof pointerWithin>[0]) {
  const columnIds = new Set<UniqueIdentifier>(COLUMNS.map((c) => c.key));

  // 1. Check if the pointer is physically inside any column droppable.
  const pointerCollisions = pointerWithin(args);
  const overColumn = pointerCollisions.find((c) => columnIds.has(c.id));
  if (overColumn) return [overColumn];

  // 2. Fallback: rect-intersection to catch edges/fast moves.
  const rectCollisions = rectIntersection(args);
  const overColumnRect = rectCollisions.find((c) => columnIds.has(c.id));
  if (overColumnRect) return [overColumnRect];

  // 3. Fallback: closest center among everything.
  return closestCenter(args);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KanbanPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeFatura, setActiveFatura] = useState<FaturaWithRelations | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [columnItems, setColumnItems] = useState<Record<FaturaStatusKey, string[]>>(
    () => buildColumnItems([])
  );
  const columnItemsRef = useRef(columnItems);
  useEffect(() => {
    columnItemsRef.current = columnItems;
  }, [columnItems]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: faturas = [], isLoading } = useQuery({
    queryKey: ["faturas", "kanban"],
    queryFn: fetchFaturas,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!activeFatura) {
      setColumnItems(buildColumnItems(faturas));
    }
  }, [faturas, activeFatura]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateFaturaStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFaturaForm>({
    resolver: zodResolver(createFaturaSchema),
  });

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const fatura = faturas.find((f) => f.id === event.active.id);
      setActiveFatura(fatura ?? null);
    },
    [faturas]
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    setColumnItems((prev) => {
      const activeColKey = COLUMNS.find((col) =>
        prev[col.key].includes(activeId)
      )?.key;
      if (!activeColKey) return prev;

      let overColKey: FaturaStatusKey | undefined;
      if (COLUMNS.find((col) => col.key === overId)) {
        overColKey = overId as FaturaStatusKey;
      } else {
        overColKey = COLUMNS.find((col) => prev[col.key].includes(overId))?.key;
      }
      if (!overColKey) return prev;

      if (activeColKey === overColKey) return prev;

      const activeItems = prev[activeColKey].filter((id) => id !== activeId);
      const overItems = [...prev[overColKey]];

      const overIndex = overItems.indexOf(overId);
      const insertAt = overIndex === -1 ? overItems.length : overIndex;
      overItems.splice(insertAt, 0, activeId);

      return {
        ...prev,
        [activeColKey]: activeItems,
        [overColKey]: overItems,
      };
    });
  }, []);

  const applyOptimisticStatus = useCallback(
    (id: string, newStatus: string) => {
      queryClient.setQueryData<FaturaWithRelations[]>(
        ["faturas", "kanban"],
        (old) =>
          old
            ? old.map((f) =>
                f.id === id ? { ...f, status: newStatus as FaturaStatusKey } : f
              )
            : old
      );
    },
    [queryClient]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active } = event;
      const activeId = active.id as string;

      const targetColKey = COLUMNS.find((col) =>
        columnItemsRef.current[col.key].includes(activeId)
      )?.key;

      const fatura = faturas.find((f) => f.id === activeId);
      if (fatura && targetColKey && fatura.status !== targetColKey) {
        applyOptimisticStatus(activeId, targetColKey);
        updateStatusMutation.mutate({ id: activeId, status: targetColKey });
      }

      setActiveFatura(null);
    },
    [faturas, updateStatusMutation, applyOptimisticStatus]
  );

  const handleDragCancel = useCallback(() => {
    setColumnItems(buildColumnItems(faturas));
    setActiveFatura(null);
  }, [faturas]);

  const handleApprove = useCallback(
    (id: string) => updateStatusMutation.mutate({ id, status: "VALIDADO" }),
    [updateStatusMutation]
  );

  const handleReject = useCallback(
    (id: string) => updateStatusMutation.mutate({ id, status: "DIVERGENCIA" }),
    [updateStatusMutation]
  );

  const onCreateFatura = async (data: CreateFaturaForm) => {
    try {
      const res = await fetch("/api/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erro ao criar fatura");

      const json = await res.json();
      const newFatura = json.data;

      if (uploadFile && newFatura?.id) {
        setUploadingId(newFatura.id);
        const formData = new FormData();
        formData.append("file", uploadFile);
        await fetch(`/api/faturas/${newFatura.id}/upload`, {
          method: "POST",
          body: formData,
        });
        setUploadingId(null);
      }

      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      setIsModalOpen(false);
      setUploadFile(null);
      reset();
    } catch {
      // handled by form
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-slate-900">
            Kanban de Faturas
          </h1>
          {!isLoading && (
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 font-medium">
              {faturas.length} faturas
            </span>
          )}
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          leftIcon={<Plus className="h-3.5 w-3.5" />}
          size="sm"
        >
          Nova Fatura
        </Button>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex gap-3 p-6">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className="w-64 flex-shrink-0 bg-slate-100 rounded-lg h-72 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={kanbanCollision}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex gap-3 p-6 min-h-full">
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.key}
                  column={col}
                  items={columnItems[col.key] ?? []}
                  allFaturas={faturas}
                  realCount={faturas.filter((f) => f.status === col.key).length}
                  onOpen={setSelectedId}
                />
              ))}
            </div>
            <DragOverlay
              dropAnimation={{
                duration: 200,
                easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
              }}
            >
              {activeFatura && <FaturaCard fatura={activeFatura} overlay />}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* Detail panel */}
      <FaturaDetailPanel
        faturaId={selectedId}
        onClose={() => setSelectedId(null)}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      {/* New Fatura Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setUploadFile(null);
          reset();
        }}
        title="Nova Fatura"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIsModalOpen(false);
                setUploadFile(null);
                reset();
              }}
            >
              Cancelar
            </Button>
            <Button
              form="create-fatura-form"
              type="submit"
              loading={isSubmitting || uploadingId !== null}
            >
              {uploadingId ? "Enviando imagem..." : "Criar Fatura"}
            </Button>
          </div>
        }
      >
        <form
          id="create-fatura-form"
          onSubmit={handleSubmit(onCreateFatura)}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Número da Fatura *
            </label>
            <input
              {...register("number")}
              type="text"
              placeholder="Ex: NF-001234"
              className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.number ? "border-red-400" : "border-slate-300"
              }`}
            />
            {errors.number && (
              <p className="mt-1 text-xs text-red-600">
                {errors.number.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Fornecedor
            </label>
            <input
              {...register("supplier")}
              type="text"
              placeholder="Nome do fornecedor"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Observações
            </label>
            <textarea
              {...register("notes")}
              rows={3}
              placeholder="Observações sobre a fatura..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Imagem da Fatura (OCR)
            </label>
            {uploadFile ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Upload className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="text-sm text-blue-700 flex-1 truncate">
                  {uploadFile.name}
                </span>
                <button
                  type="button"
                  onClick={() => setUploadFile(null)}
                  className="text-blue-400 hover:text-blue-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="h-6 w-6 text-slate-400 mb-1" />
                <span className="text-xs text-slate-500">
                  Clique para selecionar a imagem da fatura
                </span>
                <span className="text-xs text-slate-400">
                  JPG, PNG, WebP, PDF
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setUploadFile(file);
                  }}
                />
              </label>
            )}
            {uploadFile && (
              <p className="mt-1.5 text-xs text-slate-500">
                A imagem será enviada para processamento OCR após criar a fatura.
              </p>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
