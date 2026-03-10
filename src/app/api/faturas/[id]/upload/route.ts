import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { id } = await params;

    // Check fatura exists
    const fatura = await prisma.fatura.findUnique({ where: { id } });
    if (!fatura) {
      return NextResponse.json(
        { error: "Fatura não encontrada" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo de arquivo não suportado. Use JPG, PNG, WebP, GIF ou PDF." },
        { status: 400 }
      );
    }

    // Save file to /public/uploads/
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const ext = file.name.split(".").pop() ?? "jpg";
    const fileName = `fatura-${id}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const imageUrl = `/uploads/${fileName}`;

    // Update fatura with image URL and set status to PROCESSANDO
    await prisma.fatura.update({
      where: { id },
      data: {
        imageUrl,
        status: "PROCESSANDO",
      },
    });

    logger.info({ faturaId: id, imageUrl }, "Fatura image uploaded");

    // Trigger n8n webhook (fire and forget)
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (n8nWebhookUrl) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      // Include base64-encoded image so n8n doesn't need to download it
      const imageBase64 = Buffer.from(bytes).toString("base64");
      const imageMimeType = file.type;
      fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET ?? "",
        },
        body: JSON.stringify({
          faturaId: id,
          faturaNumber: fatura.number,
          imageUrl: `${appUrl}${imageUrl}`,
          imageBase64,
          imageMimeType,
          callbackUrl: `${appUrl}/api/webhooks/n8n`,
        }),
      }).catch((err) => logger.error(err, "Failed to trigger n8n webhook"));
    }

    return NextResponse.json({
      data: { imageUrl },
      message: "Imagem enviada com sucesso. Processamento OCR iniciado.",
    });
  } catch (error) {
    logger.error(error, "Error uploading fatura image");
    return NextResponse.json(
      { error: "Erro ao fazer upload da imagem" },
      { status: 500 }
    );
  }
}
