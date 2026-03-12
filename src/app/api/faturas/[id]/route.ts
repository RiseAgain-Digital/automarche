import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const updateFaturaSchema = z.object({
  status: z
    .enum(["RECEBIDO", "EM_PICAGEM", "BLOQUEADO", "EM_VALORIZACAO", "DIVERGENCIA", "VALIDADO"])
    .optional(),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  imageUrl: z.string().optional(),
  totalInvoice: z.number().optional(),
  totalScanned: z.number().optional(),
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

    const fatura = await prisma.fatura.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: true,
        scanItems: true,
        discrepancies: true,
        tasks: {
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: {
            items: true,
            scanItems: true,
            discrepancies: true,
            tasks: true,
          },
        },
      },
    });

    if (!fatura) {
      return NextResponse.json(
        { error: "Fatura não encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: fatura });
  } catch (error) {
    logger.error(error, "Error fetching fatura");
    return NextResponse.json(
      { error: "Erro ao buscar fatura" },
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
    const validated = updateFaturaSchema.parse(body);

    const fatura = await prisma.fatura.update({
      where: { id },
      data: {
        ...(validated.status ? { status: validated.status } : {}),
        ...(validated.supplier !== undefined
          ? { supplier: validated.supplier }
          : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
        ...(validated.imageUrl !== undefined
          ? { imageUrl: validated.imageUrl }
          : {}),
        ...(validated.totalInvoice !== undefined
          ? { totalInvoice: validated.totalInvoice }
          : {}),
        ...(validated.totalScanned !== undefined
          ? { totalScanned: validated.totalScanned }
          : {}),
      },
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
    });

    logger.info({ faturaId: fatura.id, status: fatura.status }, "Fatura updated");
    return NextResponse.json({ data: fatura });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Dados inválidos", details: error.issues },
        { status: 400 }
      );
    }
    logger.error(error, "Error updating fatura");
    return NextResponse.json(
      { error: "Erro ao atualizar fatura" },
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

    await prisma.fatura.delete({ where: { id } });

    logger.info({ faturaId: id }, "Fatura deleted");
    return NextResponse.json({ message: "Fatura excluída com sucesso" });
  } catch (error) {
    logger.error(error, "Error deleting fatura");
    return NextResponse.json(
      { error: "Erro ao excluir fatura" },
      { status: 500 }
    );
  }
}
