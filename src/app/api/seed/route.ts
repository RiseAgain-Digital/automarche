import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// One-shot seed endpoint — creates test user if it doesn't exist yet
// Visit: http://localhost:3000/api/seed
// REMOVE THIS FILE BEFORE PRODUCTION DEPLOYMENT

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const email = "admin@automarche.com";
  const password = "admin123";
  const name = "Admin";

  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
    });

    if (result.user) {
      return NextResponse.json({
        ok: true,
        message: "✓ Test user created",
        email,
        password,
      });
    }

    return NextResponse.json({ ok: false, message: "Sign-up returned no user" }, { status: 400 });
  } catch (e: any) {
    // User already exists — try to confirm it works by checking the error
    const msg: string = e?.message ?? String(e);
    if (msg.toLowerCase().includes("already") || e?.status === 422 || e?.statusCode === 422) {
      return NextResponse.json({
        ok: true,
        message: "ℹ User already exists",
        email,
        password,
      });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
