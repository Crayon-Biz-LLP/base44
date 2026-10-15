import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function seed() {
  console.log("Seeding Chennai Central Enterprises demo...");

  // Guard: ensure the events table carries the reporter-name column (E)
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS filled_by text`;

  const tenantName = "Chennai Central Enterprises";
  const accessCode = "chennai2026";

  let tenant = (await db.select().from(schema.tenants).where(eq(schema.tenants.name, tenantName)).limit(1))[0];
  
  if (tenant) {
    console.log("Cleaning existing demo data...");
    await db.delete(schema.events).where(eq(schema.events.tenantId, tenant.id));
    await db.delete(schema.workflows).where(eq(schema.workflows.tenantId, tenant.id));
    await db.delete(schema.locations).where(eq(schema.locations.tenantId, tenant.id));
    await db.update(schema.tenants).set({ accessCode }).where(eq(schema.tenants.id, tenant.id));
  } else {
    console.log("Creating tenant...");
    const res = await db.insert(schema.tenants).values({
      name: tenantName,
      accessCode: accessCode,
      tier: "growth"
    }).returning();
    tenant = res[0];
  }

  // Locations
  const locNames = ["T Nagar Store", "Anna Nagar HQ", "Adyar Cafe"];
  const locations = [];
  for (const name of locNames) {
    const res = await db.insert(schema.locations).values({ tenantId: tenant.id, name }).returning();
    locations.push(res[0]);
  }

  const today = new Date();
  
  async function createWorkflow(primitiveType, title, layout_type, fields, columns, rows, theme) {
    const config = {
      title,
      schema: { layout_type, fields, columns, rows, theme }
    };
    const res = await db.insert(schema.workflows).values({
      tenantId: tenant.id, primitiveType, config, isActive: true, status: "published"
    }).returning();
    await db.update(schema.workflows).set({ lineageId: res[0].id }).where(eq(schema.workflows.id, res[0].id));
    return res[0];
  }

  // --- 1. Retail & F&B ---
  const salesWf = await createWorkflow("grid", "Daily Sales Tracker", "grid", 
    [{ key: "date", label: "Date", type: "date" }],
    [{ key: "staffName", label: "Staff Name" }, { key: "cashSales", label: "Cash Sales (₹)" }, { key: "cardSales", label: "Card/UPI (₹)" }],
    [{ key: "karthik", label: "Karthik", type: "number", target: 50000 }, { key: "priya", label: "Priya", type: "number", target: 45000 }, { key: "arun", label: "Arun", type: "number", target: 40000 }],
    { primaryColor: "#e11d48", radius: "md", fontFamily: "sans" }
  );

  const closingWf = await createWorkflow("list", "Evening Closing Checklist", "list",
    [
      { key: "inspector", label: "Inspector", type: "text" },
      { key: "registersReconciled", label: "Registers Reconciled", type: "boolean" },
      { key: "doorsLocked", label: "Doors Locked", type: "boolean" },
      { key: "acTurnedOff", label: "AC Turned Off", type: "boolean" }
    ], [], [], { primaryColor: "#e11d48", radius: "md", fontFamily: "sans" }
  );

  // --- 2. Fitness/Gym ---
  const gymWf = await createWorkflow("grid", "Daily Trainer Tracker", "grid",
    [{ key: "date", label: "Date", type: "date" }],
    [{ key: "trainerName", label: "Trainer Name" }, { key: "sessionsCompleted", label: "Sessions Completed" }],
    [{ key: "rahul", label: "Rahul", type: "number", target: 30 }, { key: "sneha", label: "Sneha", type: "number", target: 30 }],
    { primaryColor: "#3b82f6", radius: "full", fontFamily: "sans" }
  );

  // --- 3. Salon & Wellness ---
  const salonWf = await createWorkflow("grid", "Stylist Appointments", "grid",
    [{ key: "date", label: "Date", type: "date" }],
    [{ key: "stylistName", label: "Stylist Name" }, { key: "appointments", label: "Appointments" }, { key: "revenue", label: "Revenue (₹)" }],
    [{ key: "meera", label: "Meera", type: "number", target: 15 }, { key: "divya", label: "Divya", type: "number", target: 12 }],
    { primaryColor: "#d946ef", radius: "lg", fontFamily: "sans" }
  );

  // --- 4. Pharmacy ---
  const pharmacyWf = await createWorkflow("list", "EOD Sales vs GST", "list",
    [
      { key: "totalSales", label: "Total Sales", type: "number" },
      { key: "gstCollected", label: "GST Collected", type: "number" },
      { key: "cashInDrawer", label: "Cash In Drawer", type: "number" }
    ], [], [], { primaryColor: "#10b981", radius: "sm", fontFamily: "sans" }
  );

  console.log("Inserting events (7 days)...");
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    // F&B
    await db.insert(schema.events).values({
      tenantId: tenant.id, workflowId: salesWf.id, locationId: locations[0].id, status: "confirmed", imageUrl: "https://example.com/receipt.jpg", createdAt: date,
      payload: {
        date: dateStr,
        grid: [
          { row: "karthik", cashSales: 15000 + (Math.random() * 5000), cardSales: 35000 + (Math.random() * 5000), target: 50000 },
          { row: "priya", cashSales: 12000 + (Math.random() * 5000), cardSales: 31000 + (Math.random() * 5000), target: 45000 },
          { row: "arun", cashSales: 18000 + (Math.random() * 5000), cardSales: 22000 + (Math.random() * 5000), target: 40000 }
        ],
        ...(i === 2 ? { ai_corrections: [{ field: "karthik.cashSales", oldValue: "1500", newValue: "15000" }] } : {})
      }
    });

    await db.insert(schema.events).values({
      tenantId: tenant.id, workflowId: closingWf.id, locationId: locations[1].id, status: "confirmed", imageUrl: "https://example.com/checklist.jpg", createdAt: date,
      payload: {
        list: [
          { key: "inspector", value: "Suresh" },
          { key: "registersReconciled", value: true },
          { key: "doorsLocked", value: true },
          { key: "acTurnedOff", value: i === 4 ? false : true }
        ]
      }
    });

    // Fitness
    await db.insert(schema.events).values({
      tenantId: tenant.id, workflowId: gymWf.id, locationId: locations[0].id, status: "confirmed", imageUrl: "", createdAt: date,
      payload: {
        grid: [
          { row: "rahul", sessionsCompleted: 20 + Math.floor(Math.random() * 15), target: 30 },
          { row: "sneha", sessionsCompleted: 22 + Math.floor(Math.random() * 10), target: 30 }
        ]
      }
    });

    // Salon
    await db.insert(schema.events).values({
      tenantId: tenant.id, workflowId: salonWf.id, locationId: locations[2].id, status: "confirmed", imageUrl: "", createdAt: date,
      payload: {
        grid: [
          { row: "meera", appointments: 10 + Math.floor(Math.random() * 6), revenue: 15000 + Math.random() * 5000, target: 15 },
          { row: "divya", appointments: 8 + Math.floor(Math.random() * 5), revenue: 12000 + Math.random() * 4000, target: 12 }
        ]
      }
    });

    // Pharmacy
    await db.insert(schema.events).values({
      tenantId: tenant.id, workflowId: pharmacyWf.id, locationId: locations[1].id, status: "confirmed", imageUrl: "", createdAt: date,
      payload: {
        list: [
          { key: "totalSales", value: 40000 + Math.random() * 10000 },
          { key: "gstCollected", value: 4000 + Math.random() * 1000 },
          { key: "cashInDrawer", value: i === 1 ? 12000 : 15000 } // day 1 missing cash issue
        ]
      }
    });
  }

  console.log(`\n✅ Demo seed complete.`);
  console.log(`\n-- LOGIN INFO --`);
  console.log(`Access Code: ${accessCode}`);
  console.log(`\n-- PUBLIC LINKS --`);
  console.log(`F&B Tracker: http://localhost:3000/submit/${salesWf.id}`);
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
