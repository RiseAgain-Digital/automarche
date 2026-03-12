import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const ocrItemSchema = z.object({
  productCode: z.string().optional().nullable(),
  productName: z.string().optional().nullable(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
});

const webhookPayloadSchema = z.object({
  faturaId: z.string(),
  items: z.array(ocrItemSchema),
  ocrData: z.unknown().optional(),
  totalInvoice: z.number().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    const secret = request.headers.get("x-webhook-secret");
    const expectedSecret = process.env.N8N_WEBHOOK_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      logger.warn("Invalid webhook secret attempt");
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const validated = webhookPayloadSchema.parse(body);

    const { faturaId, items, ocrData, totalInvoice } = validated;

    // Check fatura exists
    const fatura = await prisma.fatura.findUnique({
      where: { id: faturaId },
      include: { scanItems: true },
    });

    if (!fatura) {
      return NextResponse.json(
        { error: "Fatura não encontrada" },
        { status: 404 }
      );
    }

    // Delete existing invoice items
    await prisma.faturaItem.deleteMany({ where: { faturaId } });
    // Delete existing discrepancies
    await prisma.discrepancy.deleteMany({ where: { faturaId } });

    // Create new invoice items from OCR
    if (items.length > 0) {
      await prisma.faturaItem.createMany({
        data: items.map((item) => ({
          faturaId,
          productCode: item.productCode ?? null,
          productName: item.productName ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
      });
    }

    // Compute discrepancies vs scan items
    const discrepancies: Array<{
      faturaId: string;
      productCode: string | null;
      productName: string | null;
      invoiceQty: number;
      scannedQty: number;
      difference: number;
    }> = [];

    // Build maps by product code
    const invoiceMap = new Map<string, { qty: number; name: string | null }>();
    for (const item of items) {
      const key = item.productCode ?? item.productName ?? `item-${Math.random()}`;
      const existing = invoiceMap.get(key);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        invoiceMap.set(key, { qty: item.quantity, name: item.productName ?? null });
      }
    }

    const scanMap = new Map<string, { qty: number; name: string | null }>();
    for (const scan of fatura.scanItems) {
      const key = scan.productCode ?? scan.productName ?? `scan-${scan.id}`;
      const existing = scanMap.get(key);
      if (existing) {
        existing.qty += Number(scan.quantity);
      } else {
        scanMap.set(key, {
          qty: Number(scan.quantity),
          name: scan.productName ?? null,
        });
      }
    }

    // Find all unique product keys
    const allKeys = new Set([...invoiceMap.keys(), ...scanMap.keys()]);

    for (const key of allKeys) {
      const invoiceEntry = invoiceMap.get(key);
      const scanEntry = scanMap.get(key);
      const invoiceQty = invoiceEntry?.qty ?? 0;
      const scannedQty = scanEntry?.qty ?? 0;
      const difference = invoiceQty - scannedQty;

      if (Math.abs(difference) > 0.001) {
        discrepancies.push({
          faturaId,
          productCode: key.startsWith("item-") || key.startsWith("scan-") ? null : key,
          productName: invoiceEntry?.name ?? scanEntry?.name ?? null,
          invoiceQty,
          scannedQty,
          difference,
        });
      }
    }

    if (discrepancies.length > 0) {
      await prisma.discrepancy.createMany({ data: discrepancies });
    }

    // Determine new status
    const hasDiscrepancies = discrepancies.length > 0;
    const newStatus = hasDiscrepancies ? "DIVERGENCIA" : "VALIDADO";

    // Update fatura
    await prisma.fatura.update({
      where: { id: faturaId },
      data: {
        status: newStatus,
        ocrData: ocrData !== undefined ? (ocrData as object) : undefined,
        totalInvoice: totalInvoice ?? null,
      },
    });

    logger.info(
      {
        faturaId,
        itemsCount: items.length,
        discrepanciesCount: discrepancies.length,
        newStatus,
      },
      "n8n webhook processed"
    );

    return NextResponse.json({
      message: "Processado com sucesso",
      status: newStatus,
      itemsCount: items.length,
      discrepanciesCount: discrepancies.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Payload inválido", details: error.issues },
        { status: 400 }
      );
    }
    logger.error(error, "Error processing n8n webhook");
    return NextResponse.json(
      { error: "Erro ao processar webhook" },
      { status: 500 }
    );
  }
}
