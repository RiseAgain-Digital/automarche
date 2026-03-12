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

    const now = new Date();

    // Today boundaries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Yesterday boundaries
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    yesterdayEnd.setMilliseconds(-1);

    // This month boundaries
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Last month boundaries
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [
      totalFaturas,
      aguardandoRevisao,
      aprovadasHoje,
      aprovadasOntem,
      totalProdutos,
      faturasEsteMes,
      faturasUltimoMes,
      faturasByStatusRaw,
    ] = await Promise.all([
      prisma.fatura.count(),
      prisma.fatura.count({ where: { status: "EM_VALORIZACAO" } }),
      prisma.fatura.count({
        where: { status: "VALIDADO", updatedAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.fatura.count({
        where: { status: "VALIDADO", updatedAt: { gte: yesterdayStart, lte: yesterdayEnd } },
      }),
      prisma.produto.count({ where: { active: true } }),
      prisma.fatura.count({ where: { createdAt: { gte: thisMonthStart, lte: thisMonthEnd } } }),
      prisma.fatura.count({ where: { createdAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
      prisma.fatura.groupBy({ by: ["status"], _count: { status: true } }),
    ]);

    const faturasByStatus: Record<string, number> = {
      RECEBIDO: 0, EM_PICAGEM: 0, BLOQUEADO: 0, EM_VALORIZACAO: 0, DIVERGENCIA: 0, VALIDADO: 0,
    };
    for (const row of faturasByStatusRaw) {
      faturasByStatus[row.status] = row._count.status;
    }

    return NextResponse.json({
      data: {
        totalFaturas,
        aguardandoRevisao,
        aprovadasHoje,
        aprovadasOntem,
        totalProdutos,
        faturasEsteMes,
        faturasUltimoMes,
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
