import { generateObject } from "ai";
import { z } from "zod";

function canonicalizeKey(raw: string): string {
  let k = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!/^[a-z]/.test(k)) k = 'k' + k;
  return k;
}

function parseLabelPayload(payload: string): any {
  const trimmed = payload.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fixed = trimmed
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'/g, '"');
  try { return JSON.parse(fixed); } catch {}
  try { return JSON.parse('[' + fixed + ']'); } catch {}
  return undefined;
}

function fixStringifiedArrays(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string') {
        if (item.trim().startsWith('{') && item.trim().endsWith('}')) {
          try { return fixStringifiedArrays(JSON.parse(item)); } catch (e) {}
        }
        let genKey = item.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (/^[0-9]/.test(genKey)) genKey = 'k' + genKey;
        return { label: item, key: genKey };
      }
      return fixStringifiedArrays(item);
    });
  }
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'type' && value === 'dropdown') {
      result[key] = 'select';
    } else if (key === 'type' && value === 'checkbox') {
      result[key] = 'boolean';
    } else if (key === 'field_type' || key === 'fieldType') {
      result['type'] = fixStringifiedArrays(value);
    } else if (key === 'name' || key === 'header') {
      result['label'] = fixStringifiedArrays(value);
      result[key] = fixStringifiedArrays(value); // Keep original too
    } else {
      result[key] = fixStringifiedArrays(value);
    }
  }
  
  if (result.ui_schema) {
    let oldInt: any = null;
    if (result.ui_schema.intelligence && (typeof result.ui_schema.intelligence !== 'object' || Array.isArray(result.ui_schema.intelligence))) {
      oldInt = result.ui_schema.intelligence;
      delete result.ui_schema.intelligence; // Reset malformed string/array so it gets rebuilt
    }

    // Rescue any key containing 'intelligence'
    const intKeys = Object.keys(result.ui_schema || {}).filter(k => k.toLowerCase().includes('intelligence'));
    intKeys.forEach(k => {
        if (k !== 'intelligence') {
            if (!result.ui_schema.intelligence) result.ui_schema.intelligence = {};
            // It could be an array of objects
            if (Array.isArray(result.ui_schema[k])) {
                if (!oldInt) oldInt = [];
                oldInt = oldInt.concat(result.ui_schema[k]);
            } else if (typeof result.ui_schema[k] === 'object') {
                Object.assign(result.ui_schema.intelligence, result.ui_schema[k]);
            }
            delete result.ui_schema[k];
        }
    });

    if (!result.ui_schema.intelligence) {
       const intelligenceKeys = ['entities', 'coverage', 'uniqueness', 'invariants', 'formulas', 'status_matrix', 'threshold_alert', 'sequence', 'deadline', 'analytics', 'repeatable'];
       const int: any = {};
       let hasInt = false;
       for (const k of intelligenceKeys) {
          if (result.ui_schema[k]) {
             int[k] = result.ui_schema[k];
             delete result.ui_schema[k];
             hasInt = true;
          } else if (result[k]) {
             int[k] = result[k];
             delete result[k];
             hasInt = true;
          }
       }
       // Try to rescue from oldInt if it was an array of objects
       if (Array.isArray(oldInt)) {
          for (const item of oldInt) {
             if (item && typeof item === 'object') {
                for (const k of intelligenceKeys) {

                   if (item.label && item.label.toLowerCase().startsWith(k + ':')) {
                       // Try to parse the JSON after the colon
                       const jsonStr = item.label.substring(k.length + 1).trim();
                       try {
                           // sometimes it uses single quotes
                           const validJson = jsonStr.replace(/'/g, '"');
                           int[k] = JSON.parse(validJson);
                           hasInt = true;
                       } catch {
                           // If it fails, just put it as an array to let later logic handle it
                           if (!int[k]) int[k] = [];
                           int[k].push({ label: item.label });
                           hasInt = true;
                       }
                   } else if (item.label && item.label.toLowerCase() === k) {

                      // It's a label marker, we can't do much. But wait, if item has the key?
                      // Usually the model puts the actual data in result[k] or result.ui_schema[k].
                   }
                }
             } else if (typeof item === 'string') {
                 // strings like "coverage"
                 if (!int[item] && intelligenceKeys.includes(item)) {
                     int[item] = []; 
                     hasInt = true;
                 }
             }
          }
       }
       if (hasInt) result.ui_schema.intelligence = int;
    }
    
    // Normalization logic for flash-lite intelligence strings
    if (result.ui_schema.intelligence) {
      const int: any = result.ui_schema.intelligence;

    // Rescue label-collapsed array items: flash-lite sometimes emits the whole
    // array contents as ONE item like { label: "entities: [{...},{...}]" }.
    // Unwrap the embedded payload back into a proper array of objects.
    const arrKeys = ['entities', 'formulas', 'invariants', 'analytics', 'coverage', 'threshold_alert', 'status_matrix'];
    for (const k of arrKeys) {
      const arr = int[k];
      if (!Array.isArray(arr)) continue;
      let hit = false;
      const recovered: any[] = [];
      for (const item of arr) {
        if (item && typeof item === 'object' && typeof item.label === 'string') {
          const m = item.label.match(new RegExp('^' + k + '\\s*:\\s*([\\s\\S]+)$', 'i'));
          if (m) {
            hit = true;
            const parsed = parseLabelPayload(m[1]);
            if (parsed !== undefined) {
              const list = Array.isArray(parsed) ? parsed : [parsed];
              for (const p of list) {
                if (p && typeof p === 'object') {
                  const c: any = {};
                  for (const [pk, pv] of Object.entries(p)) {
                    if (pk === 'key' && typeof pv === 'string') c.key = canonicalizeKey(pv);
                    else c[pk] = pv;
                  }
                  recovered.push(c);
                }
              }
              continue;
            }
          }
        }
        recovered.push(item);
      }
      if (hit) int[k] = recovered;
    }

    // Normalize repeatable
    if (int.repeatable !== undefined) {
      if (typeof int.repeatable === 'boolean') {
        int.repeatable = { enabled: int.repeatable };
      } else if (Array.isArray(int.repeatable)) {
        const rep: any = { enabled: true };
        int.repeatable.forEach((r: any) => {
          if (r && r.label) {
            const lab = r.label.toLowerCase();
            if (lab.includes('enabled:')) rep.enabled = lab.includes('true');
            if (lab.includes('prefix:')) rep.prefix = r.label.split(':')[1].trim();
            if (lab.includes('start:')) rep.start = parseInt(r.label.split(':')[1].trim(), 10);
          }
        });
        int.repeatable = rep;
      }
    }

    
    // Normalize invariants shorthand
    if (Array.isArray(int.invariants)) {
       const hasShorthand = int.invariants.some((i: any) => i && i.label && !i.leftKey && (i.label.startsWith('op:') || i.label.startsWith('field:')));
       if (hasShorthand) {
           let newInvariants: any[] = [];
           let current: any = {};
           for (const i of int.invariants) {
               if (i && i.label) {
                   const lab = i.label;
                   const llow = lab.toLowerCase();
                   if (llow.startsWith('field:') || llow.startsWith('leftkey:')) {
                       if (current.leftKey) newInvariants.push(current);
                       current = { leftKey: lab.split(':')[1].trim().replace(/['"]/g, '') };
                   } else if (llow.startsWith('op:')) {
                       current.op = lab.split(':')[1].trim().replace(/['"]/g, '');
                   } else if (llow.startsWith('value:') || llow.startsWith('rightvalue:')) {
                       current.rightValue = lab.split(':')[1].trim().replace(/['"]/g, '');
                   } else if (llow.startsWith('message:') || llow.startsWith('errormessage:')) {
                       current.errorMessage = lab.split(':').slice(1).join(':').trim().replace(/['"]/g, '');
                   } else if (llow.startsWith('targetkey:')) { // for formulas
                       current.targetKey = lab.split(':')[1].trim().replace(/['"]/g, '');
                   }
               }
           }
           if (current.leftKey || current.op) newInvariants.push(current);
           if (newInvariants.length > 0) {
               int.invariants = newInvariants.filter(inv => inv.leftKey && inv.op && inv.errorMessage);
           }
       }
    }

    
    if (typeof int.sequence === 'string') {
        int.sequence = [{ key: int.sequence, start: 1 }];
    }

    // Normalize formulas shorthand
    if (Array.isArray(int.formulas)) {
       const hasShorthand = int.formulas.some((f: any) => f && f.label && !f.targetKey && !f.expression);
       if (hasShorthand) {
           let newFormulas: any[] = [];
           let current: any = {};
           for (const f of int.formulas) {
               if (f && f.label) {
                   const lab = f.label;
                   if (lab.toLowerCase().startsWith('targetkey:')) {
                       if (current.targetKey) newFormulas.push(current);
                       current = { targetKey: lab.split(':')[1].trim().replace(/['"]/g, '') };
                   } else if (lab.toLowerCase().startsWith('expression:')) {
                       current.expression = lab.split(':').slice(1).join(':').trim().replace(/['"]/g, '');
                   } else if (lab.toLowerCase().startsWith('scope:')) {
                       current.scope = lab.split(':')[1].trim();
                   } else if (lab.includes('=')) {
                       const [tk, expr] = lab.split('=');
                       newFormulas.push({ targetKey: tk.trim(), expression: expr.trim() });
                   } else if (lab.includes('targetKey:') && lab.includes('expression:')) {
                       const tkMatch = lab.match(/targetKey:\s*['"]?([^,'"]+)['"]?/i);
                       const exMatch = lab.match(/expression:\s*['"]?([^'"]+)['"]?/i);
                       if (tkMatch && exMatch) {
                           newFormulas.push({ targetKey: tkMatch[1], expression: exMatch[1] });
                       }
                   }
               }
           }
           if (current.targetKey) newFormulas.push(current);
           if (newFormulas.length > 0) int.formulas = newFormulas;
       }
    } else if (typeof int.formulas === 'string') {
        const expr = int.formulas;
        int.formulas = [{ targetKey: "total", expression: expr }];
    }

    // Ensure all formulas have valid targetKeys
    if (Array.isArray(int.formulas)) {
        int.formulas.forEach((f: any) => {
            if (f && f.targetKey && f.expression) {
                if (/[*+\-/\(\)]/.test(f.targetKey) && !/[*+\-/\(\)]/.test(f.expression)) {
                    const temp = f.targetKey;
                    f.targetKey = f.expression;
                    f.expression = temp;
                }
            }
            if (f && f.targetKey && typeof f.targetKey === 'string') {
                f.targetKey = f.targetKey.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!/^[a-z]/.test(f.targetKey)) f.targetKey = 'k' + f.targetKey;
            }
        });
    }


      if (typeof int.uniqueness === 'string') {
         int.uniqueness = { scope: int.uniqueness, label: "No duplicates allowed", severity: "warning" };
      }
      if (typeof int.deadline === 'string') {
         int.deadline = { closeBy: "23:59" };
      }
      if (Array.isArray(int.coverage)) {
         int.coverage = int.coverage.map((c: any) => {
            if (typeof c === 'string') return { scope: 'column', key: c.toLowerCase().replace(/[^a-z0-9]/g, ''), count: 1, label: c, severity: "warning" };
            if (!c.scope) c.scope = 'column';
            if (c.count === undefined) {
               // Extract number from label if possible
               const match = (c.label || '').match(/\\d+/);
               c.count = match ? parseInt(match[0], 10) : 1;
            }
            if (!c.severity) c.severity = "warning";
            return c;
         });
      }
    }
  }
  return result;
}

import { getModel, isQuotaError, aiKeys } from "./ai";

/**
 * Raised when a Zod-valid extraction still violates referential integrity
 * (phantom keys). The repair loop feeds the semantic errors back to the model
 * so it can correct BOTH shape and meaning — then normalization is the safety net.
 */
export class SemanticFailure extends Error {
  constructor(public value: unknown, public issues: string[]) {
    super(`Semantic guardrail failure (${issues.length} issue(s))`);
  }
}

export async function generateWithRepair<T>(options: any, schema: z.ZodSchema<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  const messages = options.messages ? [...options.messages] : [];
  if (options.prompt && messages.length === 0) {
    messages.push({ role: 'user', content: options.prompt });
  }
  
  let quotaAttempts = 0;
  const maxQuotaAttempts = aiKeys.length;

  const semanticFeedback = async (rawValue: unknown): Promise<T> => {
    const issues = options.semanticChecks ? options.semanticChecks(rawValue) : [];
    if (!issues || issues.length === 0) return rawValue as T;
    console.warn(`[Semantic Guardrails] ${issues.length} issue(s) on attempt ${attempt + 1}:`, issues);
    messages.push({ role: 'assistant', content: JSON.stringify(rawValue) });
    messages.push({
      role: 'user',
      content: `Your JSON passed schema validation BUT violates referential integrity. Every constraint key must reference a REAL row/column/field that actually exists in the ui_schema (or the user's own words).\n\nIssues (fix by using the exact real keys, or remove the constraint):\n- ${issues.join('\n- ')}\n\nRe-return ONLY the corrected complete JSON.`
    });
    throw new SemanticFailure(rawValue, issues);
  };

  while (attempt < maxRetries && quotaAttempts < maxQuotaAttempts) {
    try {
      // Extraction mode policy (measured, not guessed):
      // - Wire structured decoding wins where it works — prompts that pass on
      //   wire consistently FAIL through JSON+repair (schema drift), so wire
      //   must stay the fast path (acceptance evidence, both directions).
      // - But complex schemas drift under wire decoding (cold storage: 1/3
      //   valid over 6 rolls) and the old thin loop never fed errors back.
      // Policy: attempt 0 = wire (fast path). Attempt 1+ = JSON mode + client
      // Zod + error-feedback repair (convergent path). AI_STRUCTURED_OUTPUTS=1
      // forces wire on every attempt (legacy kill-switch).
      const forceWire = process.env.AI_STRUCTURED_OUTPUTS === "1";
      const useStructuredOutputs = forceWire || attempt === 0;
      const { object } = await generateObject({
        ...options,
        model: getModel(quotaAttempts),
        schema,
        prompt: undefined,
        messages,
        ...(useStructuredOutputs ? {} : {
          providerOptions: {
            ...(options.providerOptions ?? {}),
            google: { ...(options.providerOptions?.google ?? {}), structuredOutputs: false },
          },
        }),
      });
      if (process.env.REPAIR_DEBUG === "1") {
        try { const fs = await import("node:fs"); fs.default.writeFileSync(`/tmp/gen-attempt-${attempt}-${Date.now()}.json`, JSON.stringify(object, null, 2)); } catch {}
      }
      return await semanticFeedback(object);
    } catch (e: any) {
      if (e instanceof SemanticFailure) {
        attempt++;
        if (attempt >= maxRetries && (options as { bestEffortSemantic?: boolean }).bestEffortSemantic) {
          console.warn(`[Semantic Guardrails] ${maxRetries} retries exhausted; hand-off to deterministic normalization...`);
          return e.value as T;
        }
        continue;
      }
      const validationCause = e instanceof z.ZodError ? e : (e.cause || e);
      const isValidationError = e instanceof z.ZodError || 
                              validationCause?.name?.includes("Validation") || 
                              validationCause?.name?.includes("Parse") ||
                              e.name?.includes("NoObjectGeneratedError");
                              
      if (isValidationError) {
        // Attempt to auto-fix stringified arrays
        const rawValue = validationCause.value || e.value;
        let errorMessage = validationCause.message || e.message;
        if (validationCause && Array.isArray(validationCause.errors)) {
          errorMessage = validationCause.errors.map((err: any) => `- Path ${err.path?.join('.')} : ${err.message}`).join('\n');
        }

        if (rawValue) {
          let fixed: unknown = rawValue;
          try {
            if (typeof fixed === 'string') fixed = JSON.parse(fixed);
            fixed = fixStringifiedArrays(fixed);
            if (process.env.REPAIR_DEBUG === "1") {
              console.log("FIXED ATTEMPT: ", JSON.stringify(fixed, null, 2));
            }
            // Re-validate against the schema
            const parsed = schema.parse(fixed);
            return await semanticFeedback(parsed);
          } catch (fixErr: any) {
            if (fixErr instanceof SemanticFailure) {
              attempt++;
              if (attempt >= maxRetries && (options as { bestEffortSemantic?: boolean }).bestEffortSemantic) {
                console.warn(`[Semantic Guardrails] ${maxRetries} retries exhausted in auto-fix path; hand-off to deterministic normalization...`);
                return fixed as T;
              }
              continue;
            }
            // Auto-fix failed or validation still failed, continue with repair loop
            const fixCause = fixErr instanceof z.ZodError ? fixErr : (fixErr.cause || fixErr);
            if (fixCause && Array.isArray(fixCause.errors)) {
              errorMessage = fixCause.errors.map((err: any) => `- Path ${err.path?.join('.')} : ${err.message}`).join('\n');
            } else {
              errorMessage = fixCause.message || fixErr.message || errorMessage;
            }
          }
        }
        
        console.warn(`[Repair Loop] Attempt ${attempt + 1} failed.\nError message: ${errorMessage}`);
        
        let invalidText = "{}";
        if (validationCause.value) invalidText = JSON.stringify(validationCause.value);
        else if (validationCause.text) invalidText = validationCause.text;
        
        messages.push({ role: 'assistant', content: invalidText });
        messages.push({
          role: 'user',
          content: `The JSON output you generated failed schema validation.\n\nValidation Error Details:\n${errorMessage}\n\nPlease fix the JSON output. You MUST ensure nested arrays (like 'fields', 'rows', or 'columns') contain actual JSON OBJECTS (e.g., {"label": "Name", "type": "text"}), NOT stringified JSON and NOT plain strings. Return ONLY the corrected JSON.`
        });
        attempt++;
        continue;
      }
      
      if (e instanceof SemanticFailure) {
        attempt++;
        continue;
      }      if (isQuotaError(e)) {
        console.warn(`[Quota Rotation] Key ${quotaAttempts} hit quota limit. Rotating...`);
        quotaAttempts++;
        if (quotaAttempts < maxQuotaAttempts) {
          continue;
        }
      }

      // Wire mode (attempt 0) can be rejected outright by the provider for
      // certain schema shapes ("Request contains an invalid argument" — e.g.
      // ledger with optional staff arrays). Don't die: fall through to JSON
      // mode (attempt 1+), which has no wire schema to reject. Bounded by the
      // retry budget; genuine provider failures still throw after retries.
      if (attempt === 0) {
        console.warn(`[Mode Fallback] attempt 0 failed (${e?.name || "error"}) — retrying in JSON mode`);
        attempt++;
        continue;
      }

      throw e;
    }
  }
  
  if (quotaAttempts >= maxQuotaAttempts) {
    throw new Error(`Quota exceeded on all ${maxQuotaAttempts} available API keys.`);
  }
  
  throw new Error(`Failed to generate valid output after ${maxRetries} attempts.`);
}
