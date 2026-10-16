import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, index, primaryKey } from "drizzle-orm/pg-core";

// 1. Tenants (The Business Owner)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  accessCode: text("access_code"), // For demo login
  tier: text("tier").notNull().default("starter"), // starter, growth, enterprise
  staffPin: text("staff_pin"), // PIN for staff identity gate
  alertEmail: text("alert_email"), // owner alert destination (email channel)
  alertPhone: text("alert_phone"), // owner alert destination (WhatsApp channel, E.164)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 1b. Alert log — one row per alert actually dispatched (or suppressed), so
// alerting has its own audit: what fired, through which channel, and when.
export const alertLog = pgTable("alert_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lineageId: uuid("lineage_id"),
  rule: text("rule").notNull(), // 'headline-drop' | 'headline-spike' | 'translator-alerts' | …
  severity: text("severity").notNull().default("info"), // info | warn | critical
  message: text("message").notNull(),
  channels: jsonb("channels").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("sent"), // sent | skipped-no-creds | failed
  detail: jsonb("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 1c. Alert state — hysteresis memory per (tenant, lineage, rule): when a rule
// last fired and whether the condition has recovered since (re-arm gate).
export const alertState = pgTable("alert_state", {
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lineageId: uuid("lineage_id").notNull(),
  rule: text("rule").notNull(),
  firedAt: timestamp("fired_at"),
  recovered: boolean("recovered").notNull().default(false),
}, (t) => [primaryKey({ columns: [t.tenantId, t.lineageId, t.rule] })]);

// 2. Locations (The Physical Branches)
export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 3. Workflows (The AI Manifest - Defines the Primitives)
export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  primitiveType: text("primitive_type").notNull(), // e.g., 'ledger', 'slot', 'line_item', 'checklist'
  config: jsonb("config").notNull(), // The JSON-B rules injected into the AI prompt
  lineageId: uuid("lineage_id").notNull().defaultRandom(),
  schemaVersion: integer("schema_version").notNull().default(1),
  configVersion: integer("config_version").notNull().default(1), // archetype-config evolution (see lib/domain/config-versions.ts)
  status: text("status").notNull().default("published"), // 'draft' | 'published'
  isActive: boolean("is_active").notNull().default(true),
  deprecatedAt: timestamp("deprecated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 3b. Workflow change audit — every lifecycle mutation on a console lineage
// (edit, chat revision, restore, activate, rebuild). Written by lib/data/audit
// via a never-throwing helper; doubles as the future learning signal.
export const workflowChanges = pgTable("workflow_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lineageId: uuid("lineage_id").notNull(),
  fromVersion: integer("from_version"),
  toVersion: integer("to_version"),
  fromWorkflowId: uuid("from_workflow_id"),
  toWorkflowId: uuid("to_workflow_id"),
  kind: text("kind").notNull(), // 'edit' | 'chat' | 'restore' | 'activate' | 'rebuild'
  actor: text("actor").notNull().default("owner"),
  summary: text("summary"),
  patch: jsonb("patch"),
  configHash: text("config_hash"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// 4. Events (The Heartbeat - AI Extracted Data)
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending_verification"), // pending_verification, confirmed, flagged
  imageUrl: text("image_url").notNull(), // Reference to the uploaded physical receipt
  payload: jsonb("payload").notNull(), // The dynamically extracted JSON from the AI
  verdict: jsonb("verdict"), // Engine-computed verdict (money totals, coverage) — never LLM arithmetic
  filledBy: text("filled_by"), // Name of the person who filled the form
  schemaVersion: integer("schema_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => {
  return {
    eventsWorkflowCreatedIdx: index("events_workflow_created_idx").on(table.workflowId, table.createdAt),
  };
});
