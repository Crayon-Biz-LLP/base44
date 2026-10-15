"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ds/StatusPill";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";

const statusLabel: Record<string, string> = {
  pending_verification: "Pending",
  confirmed: "Confirmed",
  flagged: "Flagged",
};

const statusProp: Record<string, "pending" | "success" | "warning" | "error" | "neutral"> = {
  pending_verification: "warning",
  confirmed: "success",
  flagged: "error",
};

export function EventActions({
  eventId,
  initialStatus,
}: {
  eventId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState<string | null>(null);

  const act = async (action: "approve" | "flag") => {
    setLoading(action);
    try {
      const res = await fetch(`/api/events/${eventId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.event?.status) setStatus(json.event.status);
    } catch {
      // silent — keep current status
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <StatusPill 
        status={statusProp[status] || "neutral"} 
        label={statusLabel[status] || status} 
      />
      {status === "pending_verification" && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            disabled={loading !== null}
            onClick={() => act("approve")}
          >
            {loading === "approve" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
            disabled={loading !== null}
            onClick={() => act("flag")}
          >
            {loading === "flag" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Flag className="w-3 h-3" />}
            Flag
          </Button>
        </>
      )}
    </div>
  );
}