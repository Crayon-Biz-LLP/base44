"use client";

// Alert destination card — where the reflexes ring. Owner sets an email
// (Resend) and/or a WhatsApp phone (Meta Cloud API, E.164). Channels without
// credentials skip cleanly at send time; this card only owns the DESTINATION.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BellRing } from "lucide-react";

export function AlertContactCard() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/alert-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setEmail(d.alertEmail ?? "");
          setPhone(d.alertPhone ?? "");
        }
      })
      .catch(() => {});
  }, []);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/alert-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertEmail: email, alertPhone: phone }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      setStatus("Saved — daily alerts will use this.");
    } catch (e) {
      setStatus((e as { message?: string }).message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-amber-600" />
          <CardTitle className="text-base">Daily alerts</CardTitle>
        </div>
        <CardDescription>Where should OpsDesk send drops, spikes, and stock/renewal warnings?</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@shop.com"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
          aria-label="Alert email"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+919812345678 (WhatsApp)"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
          aria-label="Alert WhatsApp phone"
        />
        <Button onClick={save} disabled={busy} className="shrink-0">{busy ? "Saving…" : "Save"}</Button>
      </CardContent>
      {status && <CardContent className="pt-0 text-xs text-gray-500">{status}</CardContent>}
    </Card>
  );
}
