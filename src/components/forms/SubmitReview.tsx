import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InvariantBanner } from "@/components/ds/InvariantBanner";
import { evaluateFormula, checkInvariant } from "@/lib/domain/math";
import { AlertTriangle } from "lucide-react";

export function SubmitReview({ schema, formState, onSubmit, isSubmitting, onEdit }: { schema: any, formState: any, onSubmit: () => void, isSubmitting: boolean, onEdit: () => void }) {
  
  const warnings = useMemo(() => {
    const warns: string[] = [];
    const int = schema.intelligence || {};
    const logic = schema.logic || {};

    if (schema.layout_type === "list") {
      const scope: any = { ...formState };
      if (int.formulas) {
        for (const f of int.formulas) {
          try { scope[f.targetKey] = evaluateFormula(f.expression, scope); } catch {}
        }
      }
      const invariants = int.invariants || logic.invariants || [];
      for (const inv of invariants) {
        const left = scope[inv.leftKey];
        const right = inv.rightKey ? scope[inv.rightKey] : inv.rightValue;
        if (!checkInvariant(left, inv.op, right)) {
          warns.push(inv.errorMessage || `Check failed: ${inv.leftKey} ${inv.op} ${right}`);
        }
      }
    } else if (schema.layout_type === "grid") {
      const rows = schema.rows || [];
      const cols = schema.columns || [];
      
      const gridActuals = formState || {};
      
      // Coverage checks
      if (int.coverage) {
        for (const cov of int.coverage) {
           if (cov.scope === "column") {
              let filled = 0;
              for (const r of rows) {
                 const rKey = r.key || r.label;
                 if (gridActuals[rKey]?.[cov.key]) filled++;
              }
              if (filled < cov.count) warns.push(cov.label || `Coverage: ${cov.key} needs ${cov.count} filled (got ${filled})`);
           }
        }
      }
      
      // Uniqueness checks
      if (int.uniqueness) {
         if (int.uniqueness.scope === "row") {
            for (const r of rows) {
               const rKey = r.key || r.label;
               const seen = new Set();
               for (const c of cols) {
                  const cKey = c.key || c.label;
                  const val = gridActuals[rKey]?.[cKey];
                  if (val && seen.has(val)) warns.push(int.uniqueness.label || `Duplicate ${val} in row ${r.label}`);
                  seen.add(val);
               }
            }
         }
      }
      
      // Status matrix
      if (int.status_matrix) {
         for (const sm of int.status_matrix) {
            let matches = 0;
            for (const r of rows) {
               const rKey = r.key || r.label;
               const val = gridActuals[rKey]?.[sm.columnKey];
               if (val && sm.barring.includes(val.toLowerCase())) matches++;
            }
            if (matches >= sm.escalateAt) warns.push(sm.label || `Escalation: ${matches} marked as ${sm.barring.join("/")}`);
         }
      }

      for (const col of cols) {
        const colKey = col.key || col.label;
        const scope: any = {};
        for (const r of rows) {
          const rKey = r.key || r.label;
          scope[rKey] = Number(gridActuals[rKey]?.[colKey]) || 0;
        }
        
        const formulas = int.formulas || logic.formulas || [];
        for (const f of formulas) {
           if (!f.scope || f.scope === "column") {
              try { scope[f.targetKey] = evaluateFormula(f.expression, scope); } catch {}
           }
        }
        
        const invariants = int.invariants || logic.invariants || [];
        for (const inv of invariants) {
          const left = scope[inv.leftKey];
          const right = inv.rightKey ? scope[inv.rightKey] : inv.rightValue;
          if (!checkInvariant(left, inv.op, right)) {
            warns.push(`[${col.label}] ` + (inv.errorMessage || `Check failed: ${inv.leftKey} ${inv.op} ${right}`));
          }
        }
      }
    }
    return warns;
  }, [schema, formState]);

  const anythingFilled = Object.keys(formState).length > 0;

  return (
    <Card className="rounded-2xl shadow-sm p-6 space-y-6">
      <h3 className="text-lg font-bold text-slate-800">Review & Submit</h3>

      <InvariantBanner
        status={!anythingFilled ? "pending" : warnings.length === 0 ? "success" : "warning"}
        label={!anythingFilled ? "Nothing entered yet" : warnings.length === 0 ? "All checks passed" : `${warnings.length} check${warnings.length > 1 ? "s" : ""} need review`}
        detail={warnings.length === 0 && anythingFilled ? "Balanced and ready to save" : undefined}
      />

      {warnings.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 font-bold">
            <AlertTriangle className="w-5 h-5" />
            <span>Warnings (Please review)</span>
          </div>
          <ul className="list-disc pl-6 text-sm text-amber-700 space-y-1">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <Button variant="outline" onClick={onEdit} className="flex-1 min-h-[48px] rounded-xl">Edit Entries</Button>
        <Button onClick={onSubmit} disabled={isSubmitting} className="flex-1 min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
          {isSubmitting ? "Saving..." : "Confirm & Submit"}
        </Button>
      </div>
    </Card>
  );
}
