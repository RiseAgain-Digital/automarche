import { auth } from "../src/lib/auth";

// Run with: npx tsx prisma/seed.ts

async function main() {
  const email = "admin@automarche.com";
  const password = "admin123";
  const name = "Admin";

  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
    });

    if (result.user) {
      console.log("✓ Test user created:");
      console.log(`  Email:    ${email}`);
      console.log(`  Password: ${password}`);
    } else {
      console.log("User may already exist or sign-up failed.");
    }
  } catch (e: any) {
    if (e?.message?.includes("already exists") || e?.status === 422) {
      console.log(`ℹ User ${email} already exists — skipping.`);
    } else {
      throw e;
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
