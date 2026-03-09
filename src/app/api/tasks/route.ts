import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const createTaskSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]).default("TODO"),
  shift: z.enum(["MANHA", "TARDE", "NOITE"]).optional().nullable(),
  priority: z.number().int().default(0),
  dueDate: z.string().datetime().optional().nullable(),
  faturaId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? undefined;
    const shift = searchParams.get("shift") ?? undefined;
    const assignedToId = searchParams.get("assignedToId") ?? undefined;
    const date = searchParams.get("date") ?? undefined;
    const faturaId = searchParams.get("faturaId") ?? undefined;

    const where = {
      ...(status ? { status: status as never } : {}),
      ...(shift ? { shift: shift as never } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(faturaId ? { faturaId } : {}),
      ...(date
        ? {
            createdAt: {
              gte: new Date(date + "T00:00:00.000Z"),
              lt: new Date(date + "T23:59:59.999Z"),
            },
          }
        : {}),
    };

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        fatura: { select: { id: true, number: true, status: true } },
        timeEntries: {
          select: { id: true, startTime: true, endTime: true, duration: true },
          orderBy: { startTime: "asc" },
        },
      },
    });

    return NextResponse.json({ data: tasks });
  } catch (error) {
    logger.error(error, "Error fetching tasks");
    return NextResponse.json(
      { error: "Erro ao buscar tarefas" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const validated = createTaskSchema.parse(body);

    const task = await prisma.task.create({
      data: {
        title: validated.title,
        description: validated.description,
        status: validated.status,
        shift: validated.shift ?? null,
        priority: validated.priority,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
        faturaId: validated.faturaId ?? null,
        assignedToId: validated.assignedToId ?? null,
        createdById: session.user.id,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        fatura: { select: { id: true, number: true, status: true } },
      },
    });

    logger.info({ taskId: task.id }, "Task created");
    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    logger.error(error, "Error creating task");
    return NextResponse.json(
      { error: "Erro ao criar tarefa" },
      { status: 500 }
    );
  }
}
