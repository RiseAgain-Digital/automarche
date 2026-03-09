"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Play,
  Square,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  RotateCcw,
  CheckCheck,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TaskData } from "@/types";

const SHIFTS = [
  { key: "MANHA", label: "Manhã", time: "06:00 - 14:00", color: "text-orange-600 bg-orange-50" },
  { key: "TARDE", label: "Tarde", time: "14:00 - 22:00", color: "text-blue-600 bg-blue-50" },
  { key: "NOITE", label: "Noite", time: "22:00 - 06:00", color: "text-purple-600 bg-purple-50" },
] as const;

const createTaskSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  shift: z.enum(["MANHA", "TARDE", "NOITE"]).optional(),
  assignedToId: z.string().optional(),
  faturaId: z.string().optional(),
  // Keep as string to avoid Zod v4 input/output type split with coerce + default
  priority: z.string().optional(),
});

type CreateTaskForm = z.infer<typeof createTaskSchema>;

interface UserOption {
  id: string;
  name: string;
  email: string;
}

async function fetchTasks(date: string, assignedToId?: string): Promise<TaskData[]> {
  const params = new URLSearchParams({ date });
  if (assignedToId) params.set("assignedToId", assignedToId);
  const res = await fetch(`/api/tasks?${params.toString()}`);
  if (!res.ok) throw new Error("Erro ao buscar tarefas");
  const json = await res.json();
  return json.data;
}

async function fetchUsers(): Promise<UserOption[]> {
  // We fetch from a simple endpoint - for now return empty if no users endpoint
  try {
    const res = await fetch("/api/users");
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function TaskCard({
  task,
  onAction,
}: {
  task: TaskData;
  onAction: (id: string, payload: Record<string, unknown>) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [showStopPrompt, setShowStopPrompt] = useState(false);
  const isRunning = task.status === "IN_PROGRESS";

  useEffect(() => {
    // Sum all completed time entries
    const pastSeconds = (task.timeEntries ?? [])
      .filter((e) => e.endTime !== null)
      .reduce((sum, e) => sum + (e.duration ?? 0), 0);

    if (!isRunning) {
      setElapsed(pastSeconds);
      return;
    }

    // Find the open (running) entry to get its start time
    const openEntry = (task.timeEntries ?? []).find((e) => e.endTime === null);
    const sessionStart = openEntry
      ? new Date(openEntry.startTime).getTime()
      : Date.now();

    const tick = () =>
      setElapsed(pastSeconds + Math.floor((Date.now() - sessionStart) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isRunning, task.timeEntries]);

  const handleStopConfirm = (outcome: "DONE" | "BLOCKED") => {
    setShowStopPrompt(false);
    // Single call: stop timer + set final status together
    onAction(task.id, { action: "stop_timer", status: outcome });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={task.status} type="task" size="sm" />
            {task.priority > 5 && (
              <span className="text-xs text-orange-600 font-medium">Alta Prioridade</span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-900 truncate">
            {task.title}
          </h3>
          {task.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
              {task.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* TODO → start timer */}
          {task.status === "TODO" && (
            <button
              onClick={() => onAction(task.id, { action: "start_timer" })}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg text-xs font-medium transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              {elapsed > 0 ? formatDuration(elapsed) : "Iniciar"}
            </button>
          )}

          {/* IN_PROGRESS → stop and prompt */}
          {task.status === "IN_PROGRESS" && (
            <button
              onClick={() => setShowStopPrompt(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-medium transition-colors"
            >
              <Square className="h-3.5 w-3.5" />
              {elapsed > 0 ? formatDuration(elapsed) : "Parar"}
            </button>
          )}

          {/* BLOCKED → resume */}
          {task.status === "BLOCKED" && (
            <button
              onClick={() => onAction(task.id, { action: "start_timer" })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-lg text-xs font-medium transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retomar {elapsed > 0 && `(${formatDuration(elapsed)})`}
            </button>
          )}
        </div>
      </div>

      {/* Stop prompt — inline below the title */}
      {showStopPrompt && (
        <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-xs font-medium text-slate-700 mb-2">
            Como deseja encerrar esta tarefa?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleStopConfirm("DONE")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Concluída
            </button>
            <button
              onClick={() => handleStopConfirm("BLOCKED")}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Bloqueada
            </button>
            <button
              onClick={() => setShowStopPrompt(false)}
              className="px-3 py-2 text-slate-500 hover:bg-slate-200 rounded-lg text-xs font-medium transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
        <div className="flex items-center gap-3">
          {task.assignedTo && (
            <div className="flex items-center gap-1.5" title={task.assignedTo.name}>
              <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-xs font-semibold text-white">
                  {getInitials(task.assignedTo.name)}
                </span>
              </div>
              <span className="text-xs text-slate-500 truncate max-w-20">
                {task.assignedTo.name.split(" ")[0]}
              </span>
            </div>
          )}
          {task.dueDate && (
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(task.dueDate), "dd/MM")}
            </div>
          )}
        </div>

        {/* Status label — read-only for IN_PROGRESS/DONE, actionable only for BLOCKED showing reopen hint */}
        <span className="text-xs text-slate-400">
          {task.status === "TODO" && "A fazer"}
          {task.status === "IN_PROGRESS" && "Em progresso"}
          {task.status === "DONE" && "Concluída"}
          {task.status === "BLOCKED" && "Bloqueada"}
        </span>
      </div>
    </div>
  );
}

export default function TarefasPage() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const dateStr = format(currentDate, "yyyy-MM-dd");
  const displayDate = format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", dateStr, selectedUser],
    queryFn: () => fetchTasks(dateStr, selectedUser || undefined),
    refetchInterval: 15000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & Record<string, unknown>) =>
      fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const handleAction = useCallback(
    (id: string, payload: Record<string, unknown>) => {
      updateTaskMutation.mutate({ id, ...payload });
    },
    [updateTaskMutation]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTaskForm>({
    resolver: zodResolver(createTaskSchema),
  });

  const onCreateTask = async (data: CreateTaskForm) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          priority: data.priority ? parseInt(data.priority, 10) || 0 : 0,
          dueDate: currentDate.toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Erro ao criar tarefa");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setIsModalOpen(false);
      reset();
    } catch {
      // handled
    }
  };

  // Group tasks by shift
  const tasksByShift = SHIFTS.map((shift) => ({
    shift,
    tasks: tasks.filter((t) => t.shift === shift.key),
    noShift: false,
  }));

  const tasksWithoutShift = tasks.filter((t) => !t.shift);

  // Metrics
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const blockedTasks = tasks.filter((t) => t.status === "BLOCKED").length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Gestão de Tarefas
          </h1>
          <p className="text-sm text-slate-500 mt-1 capitalize">{displayDate}</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          Nova Tarefa
        </Button>
      </div>

      {/* Day selector + user filter */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-100 shadow-sm px-2 py-1.5">
          <button
            onClick={() => setCurrentDate((d) => subDays(d, 1))}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-slate-900 min-w-36 text-center">
            {format(currentDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
          </span>
          <button
            onClick={() => setCurrentDate((d) => addDays(d, 1))}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        >
          <option value="">Todos os usuários</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: totalTasks, icon: Clock, color: "text-slate-600", bg: "bg-slate-50" },
          { label: "Concluídas", value: doneTasks, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
          { label: "Em Progresso", value: inProgressTasks, icon: Loader2, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Bloqueadas", value: blockedTasks, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3"
          >
            <div className={`p-2 rounded-lg ${bg}`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tasks by shift */}
      {isLoading ? (
        <div className="space-y-4">
          {SHIFTS.map((shift) => (
            <div key={shift.key} className="animate-pulse">
              <div className="h-8 bg-slate-100 rounded-lg w-48 mb-3" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="h-24 bg-slate-50 rounded-xl" />
                <div className="h-24 bg-slate-50 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {tasksByShift.map(({ shift, tasks: shiftTasks }) => (
            <div key={shift.key}>
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${shift.color} mb-3`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span className="text-sm font-semibold">{shift.label}</span>
                <span className="text-xs opacity-70">{shift.time}</span>
                <span className="text-xs font-bold">({shiftTasks.length})</span>
              </div>

              {shiftTasks.length === 0 ? (
                <div className="text-sm text-slate-400 pl-1">
                  Nenhuma tarefa para este turno
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {shiftTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onAction={handleAction}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Tasks without shift */}
          {tasksWithoutShift.length > 0 && (
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 mb-3">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-sm font-semibold">Sem Turno</span>
                <span className="text-xs font-bold">({tasksWithoutShift.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tasksWithoutShift.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatusChange}
                    onTimerAction={handleTimerAction}
                  />
                ))}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nenhuma tarefa para este dia</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >
                Criar uma tarefa
              </button>
            </div>
          )}
        </div>
      )}

      {/* New Task Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          reset();
        }}
        title="Nova Tarefa"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIsModalOpen(false);
                reset();
              }}
            >
              Cancelar
            </Button>
            <Button
              form="create-task-form"
              type="submit"
              loading={isSubmitting}
            >
              Criar Tarefa
            </Button>
          </div>
        }
      >
        <form
          id="create-task-form"
          onSubmit={handleSubmit(onCreateTask)}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Título *
            </label>
            <input
              {...register("title")}
              type="text"
              placeholder="Título da tarefa"
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.title ? "border-red-400" : "border-slate-300"
              }`}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Descrição
            </label>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="Descrição detalhada da tarefa..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Turno
              </label>
              <select
                {...register("shift")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Nenhum</option>
                <option value="MANHA">Manhã</option>
                <option value="TARDE">Tarde</option>
                <option value="NOITE">Noite</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Prioridade (0-10)
              </label>
              <input
                {...register("priority")}
                type="number"
                min="0"
                max="10"
                defaultValue="0"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {users.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Atribuir a
              </label>
              <select
                {...register("assignedToId")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Ninguém</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
