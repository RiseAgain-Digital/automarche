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
  UniqueIdentifier,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Upload,
  X,
  FileText,
  ArrowLeft,
  Send,
  CheckCircle2,
  FileOutput,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FaturaWithRelations, FaturaStatusKey } from "@/types";

const COLUMNS: {
  key: FaturaStatusKey;
  label: string;
  badgeBg: string;
  badgeText: string;
  description: string;
  ring: string;
  actionText: string;
  actionColor: string;
}[] = [
  { key: "RECEBIDO", label: "Recebido", badgeBg: "bg-amber-100", badgeText: "text-amber-700", description: "Fatura entregue pelo fornecedor e aguarda picagem.", ring: "ring-amber-200", actionText: "Aguardar picagem", actionColor: "text-amber-600" },
  { key: "EM_PICAGEM", label: "Em Picagem", badgeBg: "bg-orange-100", badgeText: "text-orange-700", description: "Armazém a confirmar mercadoria.", ring: "ring-orange-200", actionText: "Confirmar picagem", actionColor: "text-orange-600" },
  { key: "BLOQUEADO", label: "Bloqueado", badgeBg: "bg-orange-100", badgeText: "text-orange-800", description: "Existem produtos sem referência ou erros na picagem.", ring: "ring-orange-300", actionText: "Criar referência do produto", actionColor: "text-orange-700" },
  { key: "EM_VALORIZACAO", label: "Em Valorização", badgeBg: "bg-blue-100", badgeText: "text-blue-700", description: "Departamento de ficheiro a validar preços.", ring: "ring-blue-200", actionText: "Validar preços", actionColor: "text-blue-600" },
  { key: "DIVERGENCIA", label: "Divergência", badgeBg: "bg-red-100", badgeText: "text-red-700", description: "Diferenças detectadas entre fatura e picagem.", ring: "ring-red-200", actionText: "Criar nota de débito", actionColor: "text-red-600" },
  { key: "VALIDADO", label: "Validado", badgeBg: "bg-green-100", badgeText: "text-green-700", description: "Fatura validada e pronta para contabilidade.", ring: "ring-green-200", actionText: "Enviar para contabilidade", actionColor: "text-green-600" },
];

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
        className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 h-[100px]"
      />
    );
  }

  const col = COLUMNS.find((c) => c.key === fatura.status);
  const amount = fatura.totalInvoice
    ? `${parseFloat(String(fatura.totalInvoice)).toFixed(0)}€`
    : null;

  const card = (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-4 ${
        overlay
          ? "shadow-xl cursor-grabbing"
          : "shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing hover:border-slate-300"
      } transition-all duration-150`}
      onClick={!overlay && onOpen ? () => onOpen(fatura.id) : undefined}
    >
      <p className="text-sm font-semibold text-slate-900 truncate">
        {fatura.supplier ?? "Fornecedor não informado"}
      </p>
      <p className="text-xs text-slate-400 mt-0.5">{fatura.number}</p>
      {amount && (
        <p className="text-base font-bold text-slate-900 mt-2">{amount}</p>
      )}
      {col && (
        <p className={`text-xs mt-1.5 ${col.actionColor}`}>{col.actionText}</p>
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
    <div className="flex flex-col w-[220px] flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-1 px-1">
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${column.badgeBg} ${column.badgeText}`}
        >
          {column.label}
        </span>
        <span className="text-sm font-semibold text-slate-600">{realCount}</span>
      </div>
      {/* Description */}
      <p className="text-xs text-slate-400 px-1 mb-3 leading-snug">
        {column.description}
      </p>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-40 space-y-2 transition-all duration-150 rounded-xl ${
          isOver ? `ring-2 ring-inset ${column.ring} bg-slate-50` : ""
        }`}
        style={{ paddingBottom: isOver ? "2.5rem" : "0" }}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((id) => {
            const fatura = allFaturas.find((f) => f.id === id);
            if (!fatura) return null;
            return <FaturaCard key={id} fatura={fatura} onOpen={onOpen} />;
          })}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-slate-200">
            <FileText className="h-5 w-5 mb-1" />
            <span className="text-[11px]">Vazio</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail full-page view ────────────────────────────────────────────────────

function FaturaDetailPanel({
  faturaId,
  onClose,
  onUpdateStatus,
}: {
  faturaId: string | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
}) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["fatura", faturaId],
    queryFn: () => fetchFaturaDetail(faturaId!),
    enabled: !!faturaId,
  });

  if (!faturaId) return null;

  const amount = detail?.totalInvoice
    ? `${parseFloat(String(detail.totalInvoice)).toFixed(0)}€`
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      {isLoading || !detail ? (
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
                  <p className="text-sm text-slate-400 mt-0.5">{detail.number}</p>
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
                onClick={() => { onUpdateStatus(detail.id, "EM_VALORIZACAO"); onClose(); }}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Send className="h-4 w-4" />
                Enviar para validação
              </button>
              <button
                onClick={() => { onUpdateStatus(detail.id, "VALIDADO"); onClose(); }}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                Marcar como validado
              </button>
              <button
                onClick={() => { onUpdateStatus(detail.id, "VALIDADO"); onClose(); }}
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
                      <th key={h} className="px-6 py-3 text-left text-xs text-slate-400 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {detail.items.length > 0 ? (
                    detail.items.map((item) => {
                      const scan = detail.scanItems.find((s) => s.productCode === item.productCode);
                      const hasIssue = detail.discrepancies.some((d) => d.productCode === item.productCode);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-800">{item.productName ?? "—"}</td>
                          <td className="px-6 py-3 text-slate-500">{item.productCode ?? "—"}</td>
                          <td className="px-6 py-3 text-slate-500">{scan ? parseFloat(String(scan.quantity)).toFixed(3) : "—"}</td>
                          <td className="px-6 py-3 text-slate-500">{parseFloat(String(item.quantity)).toFixed(0)}</td>
                          <td className="px-6 py-3 text-slate-500">{item.unitPrice ? `${parseFloat(String(item.unitPrice)).toFixed(2)}€` : "—"}</td>
                          <td className="px-6 py-3">
                            <span className={`text-xs font-medium ${hasIssue ? "text-red-600" : "text-emerald-600"}`}>
                              {hasIssue ? "Divergência" : "Validado"}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-slate-400 text-xs">
                            {hasIssue ? "Criar nota de débito" : COLUMNS.find((c) => c.key === detail.status)?.actionText ?? "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : detail.scanItems.length > 0 ? (
                    detail.scanItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-medium text-slate-800">{item.productName ?? "—"}</td>
                        <td className="px-6 py-3 text-slate-500">{item.productCode ?? "—"}</td>
                        <td className="px-6 py-3 text-slate-500">{parseFloat(String(item.quantity)).toFixed(3)}</td>
                        <td className="px-6 py-3 text-slate-500">—</td>
                        <td className="px-6 py-3 text-slate-500">—</td>
                        <td className="px-6 py-3"><span className="text-xs text-slate-400">—</span></td>
                        <td className="px-6 py-3 text-slate-400 text-xs">{COLUMNS.find((c) => c.key === detail.status)?.actionText ?? "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-slate-400 text-sm">
                        Nenhum produto registado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {detail.notes && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">Observações</h2>
              <p className="text-sm text-slate-600">{detail.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Collision detection ──────────────────────────────────────────────────────

function kanbanCollision(args: Parameters<typeof pointerWithin>[0]) {
  const columnIds = new Set<UniqueIdentifier>(COLUMNS.map((c) => c.key));
  const pointerCollisions = pointerWithin(args);
  const overColumn = pointerCollisions.find((c) => columnIds.has(c.id));
  if (overColumn) return [overColumn];
  const rectCollisions = rectIntersection(args);
  const overColumnRect = rectCollisions.find((c) => columnIds.has(c.id));
  if (overColumnRect) return [overColumnRect];
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
      const activeColKey = COLUMNS.find((col) => prev[col.key].includes(activeId))?.key;
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
      return { ...prev, [activeColKey]: activeItems, [overColKey]: overItems };
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

  // Show detail view full-page when a card is selected
  if (selectedId) {
    return (
      <div className="h-full overflow-y-auto bg-[#F7F8FA]">
        <FaturaDetailPanel
          faturaId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdateStatus={(id, status) =>
            updateStatusMutation.mutate({ id, status })
          }
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kanban Operacional</h1>
          <p className="text-sm text-slate-400 mt-0.5">Acompanhamento visual do fluxo de faturas</p>
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
        <div className="flex gap-4 p-6">
          {COLUMNS.map((col) => (
            <div key={col.key} className="w-[220px] flex-shrink-0 bg-slate-100 rounded-xl h-72 animate-pulse" />
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
            <div className="flex gap-4 p-6 min-h-full">
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
            <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
              {activeFatura && <FaturaCard fatura={activeFatura} overlay />}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* New Fatura Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setUploadFile(null); reset(); }}
        title="Nova Fatura"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setIsModalOpen(false); setUploadFile(null); reset(); }}>
              Cancelar
            </Button>
            <Button form="create-fatura-form" type="submit" loading={isSubmitting || uploadingId !== null}>
              {uploadingId ? "Enviando imagem..." : "Criar Fatura"}
            </Button>
          </div>
        }
      >
        <form id="create-fatura-form" onSubmit={handleSubmit(onCreateFatura)} className="space-y-4">
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
              <p className="mt-1 text-xs text-red-600">{errors.number.message}</p>
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
                <span className="text-sm text-blue-700 flex-1 truncate">{uploadFile.name}</span>
                <button type="button" onClick={() => setUploadFile(null)} className="text-blue-400 hover:text-blue-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <Upload className="h-6 w-6 text-slate-400 mb-1" />
                <span className="text-xs text-slate-500">Clique para selecionar a imagem da fatura</span>
                <span className="text-xs text-slate-400">JPG, PNG, WebP, PDF</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) setUploadFile(file); }}
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
