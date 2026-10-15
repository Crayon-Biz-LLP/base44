import { NextResponse } from "next/server";
import { db } from "@/db";
import { events, workflows, locations } from "@/db/schema";
import { eq } from "drizzle-orm";

import { evaluateFormula, checkInvariant } from "@/lib/domain/math";
import { computeEventVerdict } from "@/lib/domain/verdict";
import { getAppAccess } from "@/lib/infra/app-auth";

export async function POST(req: Request) {
  try {
    const { workflowId, layout_type, actuals, ai_corrections, filledBy, payload } = await req.json();

    const reporter = typeof filledBy === "string" ? filledBy.trim().slice(0, 80) : "";
    if (!reporter) {
      return NextResponse.json({ error: "Please enter your name before submitting." }, { status: 400 });
    }

    const workflowResult = await db.select().from(workflows).where(eq(workflows.id, workflowId));
    if (workflowResult.length === 0) return NextResponse.json({ error: "Form not found" }, { status: 404 });
    
    const workflow = workflowResult[0];
    const schema = (workflow.config as Record<string, unknown>).schema as any;
    const tenantId = workflow.tenantId;

    // Archetype consoles are PIN-gated products: their state changes require a
    // verified owner/staff session. Manifest-tier forms (/submit) stay open by
    // design — they are deliberately shareable, like a form link.
    if ((workflow.config as Record<string, unknown>)?.archetype) {
      const session = await getAppAccess(tenantId);
      if (!session) return NextResponse.json({ error: "Unauthorized — sign in to the console" }, { status: 401 });
    }

    let locationId;
    const existingLoc = await db.select().from(locations).where(eq(locations.tenantId, tenantId)).limit(1);
    if (existingLoc.length > 0) {
      locationId = existingLoc[0].id;
    } else {
      const newLoc = await db.insert(locations).values({ tenantId, name: "Main Branch" }).returning();
      locationId = newLoc[0].id;
    }

    let finalPayload: any;

    if (payload && payload.records) {
      // V2 Cube Payload
      finalPayload = payload;
    } else {
      // V1 Legacy Grid/List Payload
      const calculatedPayload: Record<string, unknown>[] = [];
      const logic = schema.logic || {};

      if (layout_type === "grid") {
        // Canonical grid dialect: one spread record per row, { row, [colKey]: val, target }.
        const rowAcc = new Map<string, Record<string, unknown>>();
        
        // Form sends actuals as { [rowKey]: { [colKey]: value } }
        // We evaluate logic and build payload per column key.
        const gridActuals = actuals as Record<string, Record<string, unknown>>;
        const colKeys = schema.columns?.map((c: any) => c.key || c.label) || [];
        // Accept actuals keyed by rowKey OR rowLabel (generated artifacts vary).
        const rowActual = (row: { key?: string; id?: string; label?: string }) => {
          const key = row.key || row.id;
          const byKey = key !== undefined ? gridActuals[key] : undefined;
          return byKey ?? (row.label ? gridActuals[row.label] : undefined);
        };
        
        const int = schema.intelligence || {};
        const logic = schema.logic || {};
        
        // Coverage checks
        if (int.coverage) {
          for (const cov of int.coverage) {
            if (cov.scope === "column") {
              let filled = 0;
              for (const row of schema.rows) {
                if (rowActual(row)?.[cov.key]) filled++;
              }
              if (filled < cov.count && cov.severity === "block") {
                return NextResponse.json({ error: cov.label || `Coverage: ${cov.key} needs ${cov.count} filled (got ${filled})` }, { status: 400 });
              }
            }
          }
        }
        
        // Uniqueness checks
        if (int.uniqueness && int.uniqueness.scope === "row") {
          for (const row of schema.rows) {
            const seen = new Set();
            for (const colKey of colKeys) {
              const val = rowActual(row)?.[colKey];
              if (val && seen.has(val)) {
                 if (int.uniqueness.severity !== "warning") {
                    return NextResponse.json({ error: int.uniqueness.label || `Duplicate ${val} in row ${row.label}` }, { status: 400 });
                 }
              }
              seen.add(val);
            }
          }
        }

        for (const colKey of colKeys) {
          const scope: Record<string, number> = {};
          for (const row of schema.rows) {
            const rowKey = row.key || row.id || row.label;
            scope[rowKey] = Number(rowActual(row)?.[colKey]) || 0;
          }

          // Evaluate formulas
          const formulas = int.formulas || logic.formulas || [];
          for (const f of formulas) {
             if (!f.scope || f.scope === "column") {
              try {
                scope[f.targetKey] = evaluateFormula(f.expression, scope);
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                return NextResponse.json({ error: `Formula error on ${colKey}: ${msg}` }, { status: 400 });
              }
            }
          }

          // Check invariants
          const invariants = int.invariants || logic.invariants || [];
          for (const inv of invariants) {
            const left = scope[inv.leftKey];
            const right = inv.rightKey ? scope[inv.rightKey] : inv.rightValue;
            if (!checkInvariant(left, inv.op, right)) {
              if (inv.severity !== "warning") {
                return NextResponse.json({ error: inv.errorMessage || `Math invariant failed: ${inv.leftKey} ${inv.op} ${right}` }, { status: 400 });
              }
            }
          }

          for (const row of schema.rows) {
            const rowKey = row.key || row.id || row.label;
            const target = row.target;
            const actual = scope[rowKey] !== undefined && scope[rowKey] !== 0 ? scope[rowKey] : rowActual(row)?.[colKey];

            if (actual === undefined || actual === "") continue;

            const entry: any = rowAcc.get(rowKey) || { row: rowKey, label: row.label, target: target || '-', percent_achieved: null, primitive: row.primitive };
            entry[colKey] = actual;
            rowAcc.set(rowKey, entry);
          }
        }

        // Flatten in schema.rows order; compute percent_achieved
        for (const row of schema.rows) {
          const rowKey = row.key || row.id || row.label;
          const rec = rowAcc.get(rowKey);
          if (!rec) continue;
          const valueKeys = Object.keys(rec).filter(k => !["row", "label", "target", "percent_achieved", "primitive"].includes(k));
          
          let colTargetsSum = 0;
          let colActualsSum = 0;
          let hasColTargets = false;

          if (schema.columns) {
            for (const col of schema.columns) {
              const cellTarget = col.targets && col.targets[rowKey] ? Number(col.targets[rowKey]) : (col.target ? Number(col.target) : 0);
              
              if (cellTarget > 0) {
                hasColTargets = true;
                colTargetsSum += cellTarget;
                // col key in rec might be col.key or deriveKey(col.label)
                const cKey = col.key || (col.label ? col.label.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+(.)/g, (_: string, c: string) => c.toUpperCase()).replace(/^(.)/, (c: string) => c.toLowerCase()) : '');
                const val = rec[cKey] !== undefined ? rec[cKey] : rec[col.label];
                if (val !== undefined && val !== "") {
                  colActualsSum += Number(val) || 0;
                }
              }
            }
          }

          if (hasColTargets && colTargetsSum > 0) {
            rec.percent_achieved = Number(((colActualsSum / colTargetsSum) * 100).toFixed(1));
          } else if (rec.target && Number(rec.target) > 0) {
            let totalActuals = 0;
            for (const k of valueKeys) {
              totalActuals += Number(rec[k]) || 0;
            }
            rec.percent_achieved = Number(((totalActuals / Number(rec.target)) * 100).toFixed(1));
          }
          
          calculatedPayload.push(rec);
        }
        finalPayload = { grid: calculatedPayload };
      } else if (layout_type === "list") {
        // Process Flat List Form
        const scope: Record<string, number> = {};
        for (const field of schema.fields) {
          const fieldKey = field.key || field.id || field.label;
          if (field.type === "number" || field.type === "currency") {
            scope[fieldKey] = Number(actuals[fieldKey]) || 0;
          }
        }

        // Evaluate formulas
        if (logic.formulas) {
          for (const f of logic.formulas) {
            try {
              scope[f.targetKey] = evaluateFormula(f.expression, scope);
              actuals[f.targetKey] = scope[f.targetKey]; // populate actuals so it gets saved
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              return NextResponse.json({ error: `Formula error: ${msg}` }, { status: 400 });
            }
          }
        }

        // Check invariants
        if (logic.invariants) {
          for (const inv of logic.invariants) {
            const left = scope[inv.leftKey];
            const right = inv.rightKey ? scope[inv.rightKey] : inv.rightValue;
            if (!checkInvariant(left, inv.op, right)) {
              return NextResponse.json({ error: inv.errorMessage || `Math invariant failed: ${inv.leftKey} ${inv.op} ${right}` }, { status: 400 });
            }
          }
        }

        for (const field of schema.fields) {
          const fieldKey = field.key || field.id || field.label;
          if (actuals[fieldKey] !== undefined || scope[fieldKey] !== undefined) {
            calculatedPayload.push({
              label: field.label,
              key: fieldKey,
              value: actuals[fieldKey] !== undefined ? actuals[fieldKey] : scope[fieldKey],
              primitive: field.primitive
            });
          }
        }
        finalPayload = { list: calculatedPayload };
      }
    }

    await db.insert(events).values({
      tenantId,
      workflowId,
      locationId,
      imageUrl: "form-submission", 
      filledBy: reporter,
      payload: finalPayload,
      verdict: computeEventVerdict(workflow.config as Record<string, unknown>, finalPayload),
      schemaVersion: workflow.schemaVersion,
      status: "confirmed"
    });

    // Replay corrections to process-ledger (Fire and forget training signal)
    if (ai_corrections && ai_corrections.length > 0) {
      const baseUrl = req.headers.get('origin') || `http://${req.headers.get('host')}`;
      fetch(`${baseUrl}/api/process-ledger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          training_signal: true,
          corrections: ai_corrections,
          workflowId
        })
      }).catch(console.error);
    }

    return NextResponse.json({ success: true, message: "Saved successfully!" });
  } catch (error) {
    console.error("Submission Error:", error);
    return NextResponse.json({ error: "Failed to process form" }, { status: 500 });
  }
}

