"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
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
  faturas,
}: {
  column: (typeof COLUMNS)[0];
  faturas: FaturaWithRelations[];
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
          {faturas.length}
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
        <SortableContext
          items={faturas.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          {faturas.map((fatura) => (
            <FaturaCard key={fatura.id} fatura={fatura} />
          ))}
        </SortableContext>
        {faturas.length === 0 && (
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: faturas = [], isLoading } = useQuery({
    queryKey: ["faturas", "kanban"],
    queryFn: fetchFaturas,
    refetchInterval: 15000,
  });

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
      setActiveFatura(null);
      const { active, over } = event;
      if (!over) return;

      const overId = over.id as string;
      const validStatuses: FaturaStatusKey[] = [
        "PENDENTE",
        "PROCESSANDO",
        "EM_REVISAO",
        "APROVADO",
        "REJEITADO",
      ];

      // Check if dropped on a column
      if (validStatuses.includes(overId as FaturaStatusKey)) {
        const fatura = faturas.find((f) => f.id === active.id);
        if (fatura && fatura.status !== overId) {
          applyOptimisticStatus(fatura.id, overId);
          updateStatusMutation.mutate({ id: fatura.id, status: overId });
        }
        return;
      }

      // Dropped on a card - find the column it belongs to
      const overFatura = faturas.find((f) => f.id === overId);
      if (overFatura) {
        const fatura = faturas.find((f) => f.id === active.id);
        if (fatura && fatura.status !== overFatura.status) {
          applyOptimisticStatus(fatura.id, overFatura.status);
          updateStatusMutation.mutate({ id: fatura.id, status: overFatura.status });
        }
      }
    },
    [faturas, updateStatusMutation, applyOptimisticStatus]
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

  const columnFaturas = (status: FaturaStatusKey) =>
    faturas.filter((f) => f.status === status);

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
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 pb-4">
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.key}
                  column={col}
                  faturas={columnFaturas(col.key)}
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
