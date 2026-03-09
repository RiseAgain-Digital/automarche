import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const createFaturaSchema = z.object({
  number: z.string().min(1, "Número é obrigatório"),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
    const status = searchParams.get("status") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const skip = (page - 1) * pageSize;

    const where = {
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: "insensitive" as const } },
              { supplier: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [faturas, total] = await Promise.all([
      prisma.fatura.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: {
            select: {
              items: true,
              scanItems: true,
              discrepancies: true,
              tasks: true,
            },
          },
        },
      }),
      prisma.fatura.count({ where }),
    ]);

    return NextResponse.json({
      data: faturas,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    logger.error(error, "Error fetching faturas");
    return NextResponse.json(
      { error: "Erro ao buscar faturas" },
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
    const validated = createFaturaSchema.parse(body);

    const fatura = await prisma.fatura.create({
      data: {
        number: validated.number,
        supplier: validated.supplier,
        notes: validated.notes,
        receivedAt: validated.receivedAt
          ? new Date(validated.receivedAt)
          : new Date(),
        userId: session.user.id,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    logger.info({ faturaId: fatura.id }, "Fatura created");
    return NextResponse.json({ data: fatura }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    logger.error(error, "Error creating fatura");
    return NextResponse.json(
      { error: "Erro ao criar fatura" },
      { status: 500 }
    );
  }
}
