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
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format } from "date-fns";
import { Plus, Upload, X, FileText, Loader2, AlertTriangle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { FaturaWithRelations, FaturaStatusKey } from "@/types";

const COLUMNS: { key: FaturaStatusKey; label: string; color: string; accent: string }[] = [
  { key: "PENDENTE", label: "Pendente", color: "bg-slate-50", accent: "bg-slate-400" },
  { key: "PROCESSANDO", label: "Processando", color: "bg-blue-50", accent: "bg-blue-500" },
  { key: "EM_REVISAO", label: "Em Revisão", color: "bg-amber-50", accent: "bg-amber-500" },
  { key: "APROVADO", label: "Aprovado", color: "bg-green-50", accent: "bg-green-500" },
  { key: "REJEITADO", label: "Rejeitado", color: "bg-red-50", accent: "bg-red-500" },
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
  const res = await fetch("/api/faturas?pageSize=100");
  if (!res.ok) throw new Error("Erro ao buscar faturas");
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
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

// Sortable fatura card
function FaturaCard({
  fatura,
  overlay = false,
}: {
  fatura: FaturaWithRelations;
  overlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: fatura.id, disabled: overlay });

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
        className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/40 h-24"
      />
    );
  }

  const card = (
    <div
      className={`bg-white rounded-xl border p-4 ${
        overlay
          ? "shadow-2xl border-slate-200 rotate-[2deg] scale-[1.04] cursor-grabbing"
          : "border-slate-100 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md hover:border-slate-200 hover:-translate-y-0.5"
      } transition-all duration-150`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-900 truncate">
            #{fatura.number}
          </span>
        </div>
        {fatura._count && fatura._count.discrepancies > 0 && (
          <div className="flex items-center gap-1 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            {fatura._count.discrepancies}
          </div>
        )}
      </div>
      {fatura.supplier && (
        <p className="text-xs text-slate-500 mb-3 truncate">{fatura.supplier}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-slate-400">
          {format(new Date(fatura.createdAt), "dd/MM/yy")}
        </span>
        <div className="flex items-center gap-2">
          {fatura._count && (
            <span className="text-xs text-slate-400">
              {fatura._count.items} itens
            </span>
          )}
          {fatura.user && (
            <div
              className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center"
              title={fatura.user.name}
            >
              <span className="text-xs font-semibold text-white">
                {getInitials(fatura.user.name)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (overlay) return card;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {card}
    </div>
  );
}

// Droppable column
function KanbanColumn({
  column,
  items,
  allFaturas,
  realCount,
}: {
  column: (typeof COLUMNS)[0];
  items: string[];
  allFaturas: FaturaWithRelations[];
  realCount: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column header */}
      <div
        className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${column.color} border border-b-0 border-slate-200`}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${column.accent}`} />
          <span className="text-sm font-semibold text-slate-700">
            {column.label}
          </span>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-white/70 rounded-full px-2 py-0.5">
          {realCount}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-48 px-2 pt-2 rounded-b-xl border border-t-0 border-slate-200 space-y-2 transition-all duration-200 ease-out ${
          isOver ? "bg-blue-50/60 ring-2 ring-inset ring-blue-200/70" : column.color
        } kanban-column`}
        style={{ paddingBottom: isOver ? "3rem" : "0.5rem" }}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.map((id) => {
            const fatura = allFaturas.find((f) => f.id === id);
            if (!fatura) return null;
            return <FaturaCard key={id} fatura={fatura} />;
          })}
        </SortableContext>
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-slate-300">
            <FileText className="h-8 w-8 mb-1" />
            <span className="text-xs">Solte aqui</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeFatura, setActiveFatura] = useState<FaturaWithRelations | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [columnItems, setColumnItems] = useState<Record<FaturaStatusKey, string[]>>(
    () => buildColumnItems([])
  );
  // Ref so handleDragEnd can read latest columnItems without stale closure
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

  // Sync columnItems from server data whenever we're not mid-drag
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
      // Find which column the active item is currently in
      const activeColKey = COLUMNS.find((col) =>
        prev[col.key].includes(activeId)
      )?.key;
      if (!activeColKey) return prev;

      // Find which column the over target belongs to
      let overColKey: FaturaStatusKey | undefined;
      if (COLUMNS.find((col) => col.key === overId)) {
        overColKey = overId as FaturaStatusKey;
      } else {
        overColKey = COLUMNS.find((col) => prev[col.key].includes(overId))?.key;
      }
      if (!overColKey) return prev;

      // Same column — let dnd-kit handle intra-column reordering naturally
      if (activeColKey === overColKey) return prev;

      const activeItems = prev[activeColKey].filter((id) => id !== activeId);
      const overItems = [...prev[overColKey]];

      // Insert at the position of the hovered card, or at end if hovering the column
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

      // Find where the card ended up (from the live columnItems state)
      const targetColKey = COLUMNS.find((col) =>
        columnItemsRef.current[col.key].includes(activeId)
      )?.key;

      const fatura = faturas.find((f) => f.id === activeId);
      if (fatura && targetColKey && fatura.status !== targetColKey) {
        applyOptimisticStatus(activeId, targetColKey);
        updateStatusMutation.mutate({ id: activeId, status: targetColKey });
      }

      // Clear active — the useEffect will re-sync columnItems from server data
      setActiveFatura(null);
    },
    [faturas, updateStatusMutation, applyOptimisticStatus]
  );

  const handleDragCancel = useCallback(() => {
    // Reset column layout to server state
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

      // Upload image if selected
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
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Kanban de Faturas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Arraste os cards para mudar o status
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          Nova Fatura
        </Button>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex gap-4">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className="w-72 flex-shrink-0 bg-slate-100 rounded-xl h-96 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex gap-4 pb-4">
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.key}
                  column={col}
                  items={columnItems[col.key] ?? []}
                  allFaturas={faturas}
                  realCount={faturas.filter((f) => f.status === col.key).length}
                />
              ))}
            </div>
            <DragOverlay
              dropAnimation={{
                duration: 220,
                easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
              }}
            >
              {activeFatura && (
                <FaturaCard fatura={activeFatura} overlay />
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

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

          {/* Image upload */}
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
