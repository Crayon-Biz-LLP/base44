"use client";

import { useState, useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { Manifest } from "@/lib/domain/manifest";

interface ScanConfig {
  title?: string;
  layout_type?: string;
  schema?: Manifest;
  artifactHtml?: string;
}

interface ScanMeta {
  count: number;
  confidence: number;
  mathVerified: boolean;
  flags: string[];
}

export function ScanCapture({
  schema,
  config,
  onExtracted,
}: {
  schema: Manifest;
  config: ScanConfig;
  onExtracted: (payload: Record<string, unknown>, meta: ScanMeta) => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });

  const handleScan = async (file: File) => {
    setScanning(true);
    setScanError(null);
    try {
      const base64Image = await toBase64(file);
      const res = await fetch("/api/process-ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Image,
          config: {
            title: config?.title || "",
            layout_type: schema?.layout_type,
            schema,
          },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const extracted = data.data?.extracted_payload;
      if (!extracted || typeof extracted !== "object") {
        throw new Error("No data could be read — try again with better lighting.");
      }

      const meta: ScanMeta = {
        count: Object.keys(extracted).length,
        confidence: Number(data.data?.confidence_score ?? 0),
        mathVerified: Boolean(data.data?.math_verified),
        flags: Array.isArray(data.data?.anomaly_flags) ? data.data.anomaly_flags : [],
      };
      onExtracted(extracted as Record<string, unknown>, meta);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <button
      type="button"
      disabled={scanning}
      onClick={() => inputRef.current?.click()}
      className="w-full flex items-center gap-4 text-left border-2 border-dashed border-slate-300 rounded-2xl p-4 min-h-[72px] bg-white hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-60"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Scan a paper record"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleScan(file);
        }}
      />
      <span className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
        {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-bold text-slate-800">
          {scanning ? "Reading paper…" : "📸 Snap from paper"}
        </span>
        <span className="text-xs text-slate-500 truncate">
          {scanning ? "Extracting fields from your photo" : "Point at the printed sheet — we'll read the numbers"}
        </span>
      </span>
      {scanError && <span className="text-xs text-red-600 ml-auto shrink-0">{scanError}</span>}
    </button>
  );
}
