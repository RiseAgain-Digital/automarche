import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const updateProdutoSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  unit: z.string().optional(),
  price: z.number().positive().optional().nullable(),
  category: z.string().optional().nullable(),
  active: z.boolean().optional(),
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
    const produto = await prisma.produto.findUnique({ where: { id } });

    if (!produto) {
      return NextResponse.json(
        { error: "Produto não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: produto });
  } catch (error) {
    logger.error(error, "Error fetching produto");
    return NextResponse.json(
      { error: "Erro ao buscar produto" },
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
    const validated = updateProdutoSchema.parse(body);

    const produto = await prisma.produto.update({
      where: { id },
      data: validated,
    });

    logger.info({ produtoId: produto.id }, "Produto updated");
    return NextResponse.json({ data: produto });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    logger.error(error, "Error updating produto");
    return NextResponse.json(
      { error: "Erro ao atualizar produto" },
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
    await prisma.produto.delete({ where: { id } });

    logger.info({ produtoId: id }, "Produto deleted");
    return NextResponse.json({ message: "Produto excluído com sucesso" });
  } catch (error) {
    logger.error(error, "Error deleting produto");
    return NextResponse.json(
      { error: "Erro ao excluir produto" },
      { status: 500 }
    );
  }
}
