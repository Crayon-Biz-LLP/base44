// Artifact validator — Section D of the Chassis Craft Pass. ZERO-LLM.
//
// Deterministic source-of-truth checks over the assembled console HTML. This
// is the floor, not the ceiling: a pass proves NOT-SLOP (a11y, mobile-native
// inputs, self-containment, motion safety), never "world-class" — the craft
// lives in the design layer (artifact-design.ts) and the assembler templates.
// Wired as gate #2 in scripts/publish-studio-v2.mts, mirroring the node
// --check syntax gate: errors → publish exits 1; warnings report only.
//
// Severity doctrine:
//   error   = breaks an operator on a factory-floor phone (blocked publish)
//   warn    = degrades gracefully or is advisory (reported, not blocking)
//   (external font stylesheets are the canonical warn — system-ui fallback
//   survives offline; external SCRIPTS are the canonical error — code the
//   artifact cannot run without is a hard runtime dependency.)

export interface ValidationIssue {
  rule: string;
  severity: "error" | "warn";
  detail: string;
}

export interface ValidationResult {
  ok: boolean; // no errors (warnings allowed)
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) ||
            tag.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? m[1] : null;
}

/** Extract declaration-block bodies of CSS rules whose selector matches re. */
function cssBodies(css: string, re: RegExp): string[] {
  const out: string[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(css))) {
    if (re.test(m[1])) out.push(m[2]);
  }
  return out;
}

export function validateArtifact(html: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (rule: string, detail: string) => errors.push({ rule, severity: "error", detail });
  const warn = (rule: string, detail: string) => warnings.push({ rule, severity: "warn", detail });

  // ---- Document shell ------------------------------------------------------
  if (!/<!doctype html>/i.test(html)) err("doctype", "missing <!DOCTYPE html>");
  if (!/<html[^>]*\blang\s*=/i.test(html)) err("lang", "<html> lacks a lang attribute");
  if (!/<meta[^>]*name="viewport"/i.test(html)) err("viewport", "no viewport meta — mobile layout will not scale");
  const title = html.match(/<title>([^<]*)<\/title>/i);
  if (!title || !title[1].trim()) err("title", "missing or empty <title>");

  // ---- Heading structure ---------------------------------------------------
  const h1s = html.match(/<h1\b/gi);
  if (!h1s || h1s.length !== 1) err("h1", `expected exactly one <h1>, found ${h1s ? h1s.length : 0}`);
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(m => Number(m[1]));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) { warn("heading-order", `heading level jumps h${levels[i - 1]} → h${levels[i]}`); break; }
  }

  // ---- Labelled controls ---------------------------------------------------
  const labelForIds = new Set([...html.matchAll(/<label[^>]*\bfor\s*=\s*"([^"]+)"/gi)].map(m => m[1]));
  const labelledByIds = new Set([...html.matchAll(/\baria-labelledby\s*=\s*"([^"]+)"/gi)].flatMap(m => m[1].split(/\s+/)));
  const controlRe = /<(input|select|textarea)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = controlRe.exec(html))) {
    const tag = m[0];
    const type = (attr(tag, "type") || "text").toLowerCase();
    if (type === "hidden" || type === "submit" || type === "button" || type === "reset") continue;
    const id = attr(tag, "id");
    const named = attr(tag, "aria-label") || attr(tag, "aria-labelledby") ||
      (id ? (labelForIds.has(id) || labelledByIds.has(id)) : false);
    if (!named) {
      err("control-label", `<${m[1]}${id ? ` id="${id}"` : ""}> has no aria-label/label — screen readers and operators guess`);
    }
  }

  // ---- Touch targets: onclick on non-interactive elements ------------------
  const divClicks = html.match(/<(div|span|td|th|img|li)\b[^>]*\bonclick\s*=/gi);
  if (divClicks) {
    warn("touch-target", `${divClicks.length} non-interactive element(s) carry onclick — rows/cells must still expose a ≥44px sibling button or the div must be focusable`);
  }

  // ---- Focus visibility ----------------------------------------------------
  const allCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(x => x[1]).join("\n");
  if (!/:focus-visible|:focus\b/.test(allCss) && !/focus-ring/.test(allCss)) {
    err("focus-style", "no :focus-visible/:focus style declared — keyboard users lose their place");
  }

  // ---- Motion safety -------------------------------------------------------
  const keyframes = (html.match(/@keyframes/g) || []).length;
  const hasReduce = /prefers-reduced-motion\s*:\s*reduce/.test(html);
  if (keyframes > 0 && !hasReduce) {
    err("reduced-motion", `${keyframes} @keyframes with no prefers-reduced-motion guard`);
  }
  if (keyframes === 0 && !/prefers-reduced-motion/.test(html)) {
    warn("reduced-motion", "no animations and no reduced-motion handling — motion bank unused");
  }

  // ---- Self-containment ----------------------------------------------------
  const scriptSrc = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>/gi);
  if (scriptSrc) err("external-script", `external script(s): ${scriptSrc.join("; ")}`);
  if (/(?:href|src|action)\s*=\s*["']\s*javascript\s*:/i.test(html)) err("javascript-url", "javascript: URL present");
  const extStyles = html.match(/<link\b[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi) || [];
  for (const l of extStyles) {
    const href = attr(l, "href") || "";
    if (/^https?:\/\//i.test(href)) {
      if (/fonts\.(googleapis|gstatic)\.com/.test(href)) warn("external-font", `remote font stylesheet (${href.split("family=")[1]?.split("&")[0] || "fonts"}) — falls back to system-ui offline`);
      else err("external-style", `remote stylesheet dependency: ${href}`);
    }
  }

  // ---- Mobile-native inputs ------------------------------------------------
  const inputBlocks = [...allCss.matchAll(/\.input\s*\{([^}]*)\}/g)].map(x => x[1]);
  for (const body of inputBlocks) {
    const fs = body.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/);
    if (fs && Number(fs[1]) < 16) {
      err("input-size", `.input font-size ${fs[1]}px — iOS Safari zooms the page on focus below 16px`);
    }
  }
  const inlineSmall = html.match(/<input\b[^>]*style="[^"]*font-size\s*:\s*1[0-5](?:\.\d+)?px[^"]*"/gi);
  if (inlineSmall) err("input-size", `${inlineSmall.length} input(s) with inline font-size <16px — iOS zoom on focus`);

  // ---- Inline-event hygiene (script tags stay single) ----------------------
  const scripts = (html.match(/<script>/g) || []).length;
  if (scripts !== 1) err("script-count", `expected exactly one inline <script>, found ${scripts}`);

  // ---- Injection: seed breakout --------------------------------------------
  // The console embeds config nouns inside its single <script> seed. A literal
  // "</script" (or a close-tag/comment token) inside a JS string closes the
  // block early — everything after it becomes markup the syntax gate never
  // sees. Assemblers must emit jstr() seed JSON; raw stringify shows up here.
  const scriptBody = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1] ?? "";
  for (const lit of scriptStringLiterals(scriptBody)) {
    if (/<\/script/i.test(lit)) {
      err("seed-breakout", `script string literal contains \"</script\" — seed JSON must be unicode-escaped (jstr)`);
      break;
    }
  }
  const scriptCloses = (html.match(/<\/script>/gi) || []).length;
  if (scriptCloses !== 1) err("script-count", `expected exactly one </script>, found ${scriptCloses}`);

  // ---- Injection: attribute + embed element bans ----------------------------
  // Mask the script block so seed strings don't double-report, then scan the
  // markup. Honest escaped output has &lt; (no raw "<" inside attributes).
  const masked = html.replace(/<script>[\s\S]*?<\/script>/gi, (s) => "\u0000".repeat(s.length));
  if (/=["'][^"'\u0000]*<[a-zA-Z][^"'\u0000]*>["']/.test(masked)) {
    err("attr-breakout", `attribute value contains raw "<" — owner text must pass through esc()`);
  }
  if (/<(iframe|object|embed)\b/i.test(masked)) err("embed-element", "iframe/object/embed elements are not allowed in consoles");
  if (/srcdoc\s*=/i.test(masked)) err("srcdoc", "srcdoc attribute is not allowed in consoles");

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Extract the string-literal contents of a JS program (single/double-quoted,
 * template, with escape handling and // and /* comments skipped). Deliberately
 * not a full parser — just enough to find literals that contain markup tokens.
 */
function scriptStringLiterals(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const end = src.indexOf("\n", i);
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let lit = "";
      while (j < src.length) {
        if (src[j] === "\\") {
          // keep the escape pair verbatim (unescaped later for scanning)
          lit += src[j] + (src[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        lit += src[j];
        j++;
      }
      out.push(lit);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}
