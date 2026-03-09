import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]).optional(),
  shift: z.enum(["MANHA", "TARDE", "NOITE"]).optional().nullable(),
  priority: z.number().int().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  faturaId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
  // Time entry actions
  action: z.enum(["start_timer", "stop_timer"]).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        fatura: { select: { id: true, number: true, status: true } },
        timeEntries: {
          orderBy: { startTime: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Tarefa não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: task });
  } catch (error) {
    logger.error(error, "Error fetching task");
    return NextResponse.json(
      { error: "Erro ao buscar tarefa" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const validated = updateTaskSchema.parse(body);

    // Handle timer actions
    if (validated.action === "start_timer") {
      // Close any open time entry for this user on this task
      await prisma.taskTimeEntry.updateMany({
        where: { taskId: id, userId: session.user.id, endTime: null },
        data: { endTime: new Date(), duration: 0 },
      });
      // Create new time entry
      await prisma.taskTimeEntry.create({
        data: {
          taskId: id,
          userId: session.user.id,
          startTime: new Date(),
        },
      });
      // Always move to IN_PROGRESS when timer starts
      if (!validated.status) validated.status = "IN_PROGRESS";
      if (!validated.startedAt) (validated as Record<string, unknown>).startedAt = new Date().toISOString();
    } else if (validated.action === "stop_timer") {
      const openEntry = await prisma.taskTimeEntry.findFirst({
        where: { taskId: id, userId: session.user.id, endTime: null },
        orderBy: { startTime: "desc" },
      });
      if (openEntry) {
        const endTime = new Date();
        const duration = Math.floor(
          (endTime.getTime() - openEntry.startTime.getTime()) / 1000
        );
        await prisma.taskTimeEntry.update({
          where: { id: openEntry.id },
          data: { endTime, duration },
        });
      }
    }

    const { action: _, ...updateData } = validated;

    const taskUpdate: Record<string, unknown> = {};
    if (updateData.title !== undefined) taskUpdate.title = updateData.title;
    if (updateData.description !== undefined) taskUpdate.description = updateData.description;
    if (updateData.status !== undefined) {
      taskUpdate.status = updateData.status;
      if (updateData.status === "IN_PROGRESS" && !updateData.startedAt) {
        taskUpdate.startedAt = new Date();
      }
      if (updateData.status === "DONE" && !updateData.completedAt) {
        taskUpdate.completedAt = new Date();
      }
    }
    if (updateData.shift !== undefined) taskUpdate.shift = updateData.shift;
    if (updateData.priority !== undefined) taskUpdate.priority = updateData.priority;
    if (updateData.dueDate !== undefined)
      taskUpdate.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    if (updateData.faturaId !== undefined) taskUpdate.faturaId = updateData.faturaId;
    if (updateData.assignedToId !== undefined) taskUpdate.assignedToId = updateData.assignedToId;
    if (updateData.startedAt !== undefined)
      taskUpdate.startedAt = updateData.startedAt ? new Date(updateData.startedAt) : null;
    if (updateData.completedAt !== undefined)
      taskUpdate.completedAt = updateData.completedAt ? new Date(updateData.completedAt) : null;

    const task = await prisma.task.update({
      where: { id },
      data: taskUpdate,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        timeEntries: {
          select: { id: true, startTime: true, endTime: true, duration: true },
          orderBy: { startTime: "asc" },
        },
      },
    });

    logger.info({ taskId: task.id }, "Task updated");
    return NextResponse.json({ data: task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    logger.error(error, "Error updating task");
    return NextResponse.json(
      { error: "Erro ao atualizar tarefa" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;
    await prisma.task.delete({ where: { id } });

    logger.info({ taskId: id }, "Task deleted");
    return NextResponse.json({ message: "Tarefa excluída com sucesso" });
  } catch (error) {
    logger.error(error, "Error deleting task");
    return NextResponse.json(
      { error: "Erro ao excluir tarefa" },
      { status: 500 }
    );
  }
}
