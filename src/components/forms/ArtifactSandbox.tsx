"use client";

import React, { useEffect, useRef } from "react";
import { safeJson } from "@/lib/util/fetch";

interface ArtifactSandboxProps {
  html: string;
  workflowId: string;
  layoutType?: string;
  staffName?: string;
  role?: "owner" | "staff";
  /** Full-bleed standalone app presentation (no card chrome, fills viewport). */
  fullBleed?: boolean;
  onSubmitted?: () => void;
  onError?: (message: string) => void;
}

const BRIDGE = `<script>
// Storage shim: the sandboxed iframe runs on an opaque origin where accessing
// window.localStorage THROWS a SecurityError — which used to kill artifact boot
// scripts before first render (blank console). Fall back to an in-memory store;
// durable persistence still goes through the submit/load bridge.
(function () {
  var mem = {};
  try {
    window.localStorage.setItem('__opsdesk_probe', '1');
    window.localStorage.removeItem('__opsdesk_probe');
  } catch (e) {
    var shim = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] != null ? Object.keys(mem)[i] : null; }
    };
    Object.defineProperty(shim, 'length', { get: function () { return Object.keys(mem).length; } });
    try { Object.defineProperty(window, 'localStorage', { value: shim, configurable: true }); } catch (e2) {}
  }
})();
window.__opsDeskSubmit__ = function (data) {
  return new Promise(function (resolve, reject) {
    function onResponse(e) {
      if (e.data && e.data.source === "opsdesk-host" && e.data.type === "submit-response") {
        window.removeEventListener("message", onResponse);
        if (e.data.ok) resolve({ ok: true });
        else reject(new Error(e.data.error || "Save failed"));
      }
    }
    window.addEventListener("message", onResponse);
    try {
      parent.postMessage({ source: "opsdesk-artifact", type: "submit", data: data || {} }, "*");
    } catch (err) {
      window.removeEventListener("message", onResponse);
      reject(err);
    }
  });
};
window.__opsDeskLoad__ = function () {
  return new Promise(function (resolve, reject) {
    function onResponse(e) {
      if (e.data && e.data.source === "opsdesk-host" && e.data.type === "load-response") {
        window.removeEventListener("message", onResponse);
        if (e.data.ok) resolve(e.data);
        else reject(new Error(e.data.error || "Load failed"));
      }
    }
    window.addEventListener("message", onResponse);
    try {
      parent.postMessage({ source: "opsdesk-artifact", type: "load" }, "*");
    } catch (err) {
      window.removeEventListener("message", onResponse);
      reject(err);
    }
  });
};
</script>`;

function injectBridge(html: string): string {
  const withHead = html.replace(/<head[^>]*>/i, (m) => `${m}\n${BRIDGE}`);
  if (withHead !== html) return withHead;
  const withHtml = html.replace(/<html[^>]*>/i, (m) => `${m}\n${BRIDGE}`);
  if (withHtml !== html) return withHtml;
  return BRIDGE + html;
}

export function ArtifactSandbox({ html, workflowId, layoutType, staffName, role, fullBleed, onSubmitted, onError }: ArtifactSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const propsRef = useRef({ workflowId, layoutType, staffName, role, onSubmitted, onError });

  useEffect(() => {
    propsRef.current = { workflowId, layoutType, staffName, role, onSubmitted, onError };
  });

  const srcDoc = React.useMemo(() => injectBridge(html), [html]);

  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;
      const payload = event.data as { source?: string; type?: string; data?: unknown } | null;
      if (!payload || payload.source !== "opsdesk-artifact") return;

      const { workflowId, staffName, role, onSubmitted, onError } = propsRef.current;

      // ---- Boot-time state load (app tier) ----
      if (payload.type === "load") {
        try {
          const res = await fetch(`/api/app-state/${workflowId}`);
          const result = await safeJson(res);
          if (result.error) throw new Error(result.error);
          iframe.contentWindow?.postMessage(
            { source: "opsdesk-host", type: "load-response", ok: true, records: result.records ?? [], savedAt: result.savedAt ?? null, filledBy: result.filledBy ?? null, staffName: staffName ?? null, role: role ?? "owner" },
            "*"
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to load app state";
          iframe.contentWindow?.postMessage({ source: "opsdesk-host", type: "load-response", ok: false, error: message }, "*");
        }
        return;
      }

      // ---- Save / sync (unchanged contract) ----
      if (payload.type !== "submit") return;
      const data = payload.data ?? {};
      const body: Record<string, unknown> = { workflowId, filledBy: staffName };

      if (data && typeof data === "object" && Array.isArray((data as { records?: unknown }).records)) {
        body.layout_type = layoutType || "grid";
        body.payload = { records: (data as { records: unknown[] }).records };
      } else if (data && typeof data === "object" && (data as { actuals?: unknown }).actuals && typeof (data as { actuals: unknown }).actuals === "object") {
        body.layout_type = typeof (data as { layout_type?: unknown }).layout_type === "string" ? (data as { layout_type: string }).layout_type : layoutType || "grid";
        body.actuals = (data as { actuals: object }).actuals;
      } else {
        body.layout_type = layoutType || "grid";
        body.payload = { records: [data] };
      }

      try {
        const res = await fetch("/api/submit-form", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const result = await safeJson(res);
        if (!result.success) throw new Error(result.error || "Failed to submit");

        try {
          iframe.contentWindow?.postMessage({ source: "opsdesk-host", type: "submit-response", ok: true }, "*");
        } catch {}
        onSubmitted?.();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to submit";
        try {
          iframe.contentWindow?.postMessage({ source: "opsdesk-host", type: "submit-response", ok: false, error: message }, "*");
        } catch {}
        onError?.(message);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [layoutType]);

  return (
    <iframe
      ref={iframeRef}
      title="Generated App"
      sandbox="allow-scripts allow-modals allow-downloads"
      srcDoc={srcDoc}
      className={
        fullBleed
          ? "w-full h-[calc(100dvh-56px)] border-0 bg-transparent"
          : "w-full h-[85vh] rounded-2xl border border-slate-200 bg-white shadow-sm"
      }
    />
  );
}
