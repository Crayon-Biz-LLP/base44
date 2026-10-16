import React from "react";
import { FieldInput, type FormState, type SetFormState } from "./FieldInput";
import { Masthead } from "@/components/ds/Masthead";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ListManifest } from "@/lib/domain/manifest";

export function ListForm({ schema, formState, setFormState }: { schema: ListManifest, formState: FormState, setFormState: SetFormState }) {
  const int = schema.intelligence;

  return (
    <Card className="rounded-2xl shadow-sm p-6 space-y-6">
      {schema.description && (
        <Masthead
          title={schema.description}
          className="border-none pb-2 mb-2"
        />
      )}

      {schema.fields?.map((f, i: number) => {
        const key = f.key || f.label;
        const isHero = f.visual?.variant === "hero" || f.visual?.variant === "quick_tap";
        const target = (f as { target?: number }).target;

        return (
          <div key={i} className="space-y-2">
            {!isHero && (
              <label className="flex justify-between items-center text-sm font-semibold text-slate-700">
                <span>{f.label} {f.required && <span className="text-red-500">*</span>}</span>
                {target && (
                  <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700 font-bold">
                    🎯 {target}
                  </Badge>
                )}
              </label>
            )}
            <FieldInput
              field={f}
              entities={int?.entities}
              value={(formState[key] as string) || ""}
              onChange={(val) => setFormState((prev) => ({ ...prev, [key]: val }))}
            />
          </div>
        );
      })}
    </Card>
  );
}
