import React, { useState } from "react";
import { FieldInput } from "./FieldInput";
import { Masthead } from "@/components/ds/Masthead";
import { QuickChipGroup } from "@/components/ds/QuickChipGroup";
import { deriveChips } from "@/lib/domain/manifest";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export function GridForm({ schema, formState, setFormState, selectedPersona }: { schema: any, formState: any, setFormState: any, selectedPersona?: string }) {
  const { rows = [], columns = [], intelligence, description } = schema;
  const isPersonal = schema.entryMode === "personal";
  const repeatable = intelligence?.repeatable?.enabled;

  const [rowKeys, setRowKeys] = useState<string[]>(() => {
    const initialKeys = rows.map((r: any) => r.key || r.label);
    if (repeatable && initialKeys.length === 0) initialKeys.push(`line_0`);
    return initialKeys;
  });

  const getColTarget = (rowKey: string, col: any) => {
    if (col.targets && col.targets[rowKey] !== undefined) return col.targets[rowKey];
    return col.target;
  };

  const getRowTarget = (row: any) => row?.target;

  return (
    <Card className="rounded-2xl shadow-sm p-4 space-y-4">
      {description && (
        <Masthead
          title={description}
          className="border-none pb-0 mb-0 px-2 pt-2"
        />
      )}
      {intelligence?.sequence && intelligence.sequence.map((seq:any) => (
         <div key={seq.key} className="px-2">
            <Badge variant="secondary" className="font-mono text-sm px-3 py-1">
              {seq.key.toUpperCase()}: {seq.prefix || ""}{seq.start}
            </Badge>
         </div>
      ))}
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="p-4 font-semibold text-slate-500 text-xs uppercase tracking-wider">
              {repeatable ? "Item" : "Name / Date"}
            </TableHead>
            {columns.map((c: any, i: number) => (
              <TableHead key={i} className="p-4 font-semibold text-slate-500 text-xs uppercase tracking-wider min-w-[150px]">
                {c.label}{" "}
                {c.target && (
                  <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0 border-indigo-200 bg-indigo-50 text-indigo-700">
                    🎯 {c.target}
                  </Badge>
                )}
              </TableHead>
            ))}
            {rows.some((r:any) => getRowTarget(r)) && (
               <TableHead className="p-4 font-semibold text-slate-500 text-xs uppercase tracking-wider">Target</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowKeys.map((rowKey: string, rIdx: number) => {
            const rowDef = repeatable ? { label: `Line ${rIdx+1}` } : rows.find((r:any) => (r.key || r.label) === rowKey);
            // personal mode: staff identity ("Bhuvana") may differ from the
            // canonicalized row key ("bhuvana") — match label OR key, case-insensitively.
            if (isPersonal && selectedPersona) {
              const own = [rowKey, rowDef?.label]
                .filter(Boolean)
                .some((v) => String(v).trim().toLowerCase() === selectedPersona.trim().toLowerCase());
              if (!own) return null;
            }

            return (
              <TableRow key={rIdx}>
                <TableCell className="p-4 font-semibold text-slate-800 whitespace-normal">{rowDef?.label}</TableCell>
                {columns.map((col: any, cIdx: number) => {
                  const colKey = col.key || col.label;

                  const target = getColTarget(rowKey, col);
                  const isTextType = rowDef && !rowDef.target && !col.target;
                  const fieldDef = { ...col, target, type: col.type || rowDef?.type || (isTextType ? "text" : "number"), required: true };
                  const chips = target && !getRowTarget(rowDef) ? deriveChips(fieldDef) : undefined;

                  return (
                    <TableCell key={cIdx} className="p-4 relative align-top">
                      <FieldInput
                        field={fieldDef}
                        entities={intelligence?.entities}
                        value={formState[rowKey]?.[colKey] ?? ""}
                        onChange={(val) => {
                          setFormState((prev: any) => {
                            const next = { ...prev };
                            if (!next[rowKey]) next[rowKey] = {};
                            next[rowKey][colKey] = val;
                            return next;
                          });
                        }}
                      />
                      {target && formState[rowKey]?.[colKey] && (
                        <div className="absolute top-1.5 right-5 text-[10px] font-mono text-slate-400">
                          {formState[rowKey][colKey]} / {target}
                        </div>
                      )}
                      {chips && (
                        <QuickChipGroup
                          chips={chips}
                          className="mt-2"
                          ariaLabel={`Quick add for ${col.label}`}
                          onTap={(chip) => {
                            setFormState((prev: any) => {
                              const next = { ...prev };
                              if (!next[rowKey]) next[rowKey] = {};
                              next[rowKey][colKey] = String(chip);
                              return next;
                            });
                          }}
                        />
                      )}
                    </TableCell>
                  );
                })}
                {getRowTarget(rowDef) && (
                   <TableCell className="p-4 align-top">
                     <div className="font-bold text-indigo-700">🎯 {getRowTarget(rowDef)}</div>
                     {(() => {
                       const rowChips = deriveChips({ ...(rowDef || {}), target: getRowTarget(rowDef) });
                       if (!rowChips) return null;
                       return (
                         <QuickChipGroup
                           chips={rowChips}
                           className="mt-2"
                           ariaLabel={`Quick add for ${rowDef?.label ?? "row"}`}
                           onTap={(chip) => {
                             const first = columns[0];
                             const firstKey = first?.key || first?.label;
                             if (!firstKey) return;
                             setFormState((prev: any) => {
                               const next = { ...prev };
                               if (!next[rowKey]) next[rowKey] = {};
                               next[rowKey][firstKey] = String(chip);
                               return next;
                             });
                           }}
                         />
                       );
                     })()}
                   </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {repeatable && (
         <Button
           variant="outline"
           onClick={() => setRowKeys([...rowKeys, `line_${rowKeys.length}`])}
           className="w-full min-h-[48px] font-bold border-dashed text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
         >
           + Add Line
         </Button>
      )}
    </Card>
  );
}
