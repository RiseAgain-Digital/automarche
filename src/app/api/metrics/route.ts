import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalFaturas,
      aguardandoRevisao,
      aprovadasHoje,
      totalProdutos,
      faturasByStatusRaw,
    ] = await Promise.all([
      prisma.fatura.count(),
      prisma.fatura.count({ where: { status: "EM_REVISAO" } }),
      prisma.fatura.count({
        where: {
          status: "APROVADO",
          updatedAt: { gte: today, lt: tomorrow },
        },
      }),
      prisma.produto.count({ where: { active: true } }),
      prisma.fatura.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    const faturasByStatus: Record<string, number> = {
      PENDENTE: 0,
      PROCESSANDO: 0,
      EM_REVISAO: 0,
      APROVADO: 0,
      REJEITADO: 0,
    };

    for (const row of faturasByStatusRaw) {
      faturasByStatus[row.status] = row._count.status;
    }

    return NextResponse.json({
      data: {
        totalFaturas,
        aguardandoRevisao,
        aprovadasHoje,
        totalProdutos,
        faturasByStatus,
      },
    });
  } catch (error) {
    logger.error(error, "Error fetching metrics");
    return NextResponse.json(
      { error: "Erro ao buscar métricas" },
      { status: 500 }
    );
  }
}
