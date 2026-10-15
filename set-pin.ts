import { db } from "./src/db/index";
import { tenants } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const result = await db.update(tenants).set({ staffPin: "1234" }).where(eq(tenants.accessCode, "chennai2026")).returning();
  console.log("Updated:", result);
  process.exit(0);
}
run();
