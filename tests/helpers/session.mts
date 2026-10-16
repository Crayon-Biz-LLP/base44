// Shared browser-harness for the behavioral suites. Extracted so the
// owner/staff session contract lives in ONE place: after the A3 hardening the
// app cookie is HMAC-signed (v1.<value>.<hmac>), so a test that injects a raw
// tenant id (or no cookie at all) is rejected with 401 by every gated route.
//
// Everything here is derived from the SAME secret the dev server uses, so the
// seeded context is byte-for-byte what the real gate would set.
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from "playwright-core";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Load .env.local before anything reads process.env (mirrors the server).
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const { signOwnerValue, signStaffValue, OWNER_COOKIE_NAME, staffCookieName } = await import(
  "../../src/lib/infra/app-auth"
);

export const BASE = process.env.OPSDESK_BASE || "http://localhost:3000";

/**
 * Chromium binary. Prefer PLAYWRIGHT_CHROMIUM (CI/other machines), else scan
 * the Playwright cache for whatever chromium-* revision is installed, else
 * fall back to the historical revision-1234 path.
 */
export function chromiumPath(): string {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const suffix = "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
  const cacheRoots = [join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")];
  const suffixes = [suffix, "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-linux/chrome"];
  for (const root of cacheRoots) {
    try {
      const dirs = readdirSync(root)
        .filter((d) => d.startsWith("chromium-"))
        .sort()
        .reverse();
      for (const d of dirs) {
        for (const s of suffixes) {
          const p = join(root, d, s);
          if (existsSync(p)) return p;
        }
      }
    } catch {
      /* cache missing — try next root */
    }
  }
  return join(cacheRoots[0], "chromium-1234", suffix);
}

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ executablePath: chromiumPath(), headless: true });
}

/**
 * Seed a verified OWNER session: signed tenant cookie + the {name, role}
 * localStorage the client gate reads to render the unscoped owner console.
 */
export async function addOwnerSession(context: BrowserContext, tenantId: string): Promise<void> {
  await seedSession(
    context,
    tenantId,
    JSON.stringify({ name: "__owner__", role: "owner" }),
    `${OWNER_COOKIE_NAME}=${signOwnerValue(tenantId)}; path=/`,
  );
}

/** Seed a verified STAFF session for `name` (consoles scope by it). */
export async function addStaffSession(context: BrowserContext, tenantId: string, name: string): Promise<void> {
  await seedSession(
    context,
    tenantId,
    JSON.stringify({ name, role: "staff" }),
    `${staffCookieName(tenantId)}=${encodeURIComponent(signStaffValue(tenantId, name))}; path=/`,
  );
}

async function seedSession(context: BrowserContext, tenantId: string, session: string, cookie: string): Promise<void> {
  await context.addInitScript(
    ([tid, sess, ck]) => {
      try {
        localStorage.setItem(`staff_${tid}`, sess!);
        document.cookie = ck!;
      } catch {
        /* opaque origin — ignore */
      }
    },
    [tenantId, session, cookie] as [string, string, string],
  );
}

/** The artifact iframe (the opaque-origin sandbox rendering the console). */
export async function artifactFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 30; i++) {
    const frame = page.frames().find((f) => f !== page.mainFrame());
    if (frame) {
      const ok = await frame.evaluate(() => !!document.body).catch(() => false);
      if (ok) return frame;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("artifact iframe unavailable");
}

export type Workflow = {
  id?: string;
  tenantId?: string;
  config?: Record<string, unknown>;
};

/** Fetch a workflow record (id + tenant + config) through the private API. */
export async function fetchWorkflow(id: string): Promise<Workflow> {
  const res = await fetch(`${BASE}/api/workflow/${id}`);
  const json = (await res.json()) as { workflow?: Workflow };
  return json.workflow ?? {};
}

export async function tenantOf(id: string): Promise<string | undefined> {
  return (await fetchWorkflow(id)).tenantId;
}

/** Loud pass/fail counter with a process-exit summary. */
export function createChecker() {
  let passes = 0;
  let failures = 0;
  const check = (name: string, ok: boolean, extra = ""): void => {
    if (ok) {
      passes++;
      console.log(`  ok  ${name} ${extra}`);
    } else {
      failures++;
      console.log(`  FAIL  ${name} ${extra}`);
    }
  };
  const finish = (): never => {
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures > 0 ? 1 : 0);
  };
  return { check, finish, get failures() { return failures; }, get passes() { return passes; } };
}

/** Require a workflow id from the environment with a readable error. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}=<workflow id> (run scripts/seed-behavior.mts)`);
  return v;
}
