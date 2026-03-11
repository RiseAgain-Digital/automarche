import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const createProdutoSchema = z.object({
  code: z.string().min(1, "Código é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  unit: z.string().default("UN"),
  price: z.number().positive().optional().nullable(),
  category: z.string().optional().nullable(),
  active: z.boolean().default(true),
});

const bulkCreateSchema = z.array(createProdutoSchema);

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "1");
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
    const search = searchParams.get("search") ?? undefined;
    const active = searchParams.get("active");

    const skip = (page - 1) * pageSize;

    const where = {
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
              { category: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(active !== null && active !== undefined
        ? { active: active === "true" }
        : {}),
    };

    const [produtos, total] = await Promise.all([
      prisma.produto.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      prisma.produto.count({ where }),
    ]);

    return NextResponse.json({
      data: produtos,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    logger.error(error, "Error fetching produtos");
    return NextResponse.json(
      { error: "Erro ao buscar produtos" },
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

    // Support bulk import — batching happens here so the client fires one request and can navigate away
    if (Array.isArray(body)) {
      const validated = bulkCreateSchema.parse(body);
      const BATCH_SIZE = 500;
      let totalImported = 0;

      for (let i = 0; i < validated.length; i += BATCH_SIZE) {
        const batch = validated.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(
          batch.map((p) =>
            prisma.produto.upsert({
              where: { code: p.code },
              update: {
                name: p.name,
                unit: p.unit,
                price: p.price ?? null,
                category: p.category ?? null,
                active: p.active,
              },
              create: {
                code: p.code,
                name: p.name,
                unit: p.unit,
                price: p.price ?? null,
                category: p.category ?? null,
                active: p.active,
              },
            })
          )
        );
        totalImported += batch.length;
      }

      logger.info({ count: totalImported }, "Produtos bulk imported");
      return NextResponse.json(
        { message: `${totalImported} produtos importados` },
        { status: 201 }
      );
    }

    const validated = createProdutoSchema.parse(body);
    const produto = await prisma.produto.create({
      data: {
        code: validated.code,
        name: validated.name,
        unit: validated.unit,
        price: validated.price ?? null,
        category: validated.category ?? null,
        active: validated.active,
      },
    });

    logger.info({ produtoId: produto.id }, "Produto created");
    return NextResponse.json({ data: produto }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    logger.error(error, "Error creating produto");
    return NextResponse.json(
      { error: "Erro ao criar produto" },
      { status: 500 }
    );
  }
}
