// Alert channels (reflexes → voice). Both senders degrade to SKIP when
// credentials are absent, so dev and preview never break: the cron records
// the skip in alert_log and moves on. Email = Resend; WhatsApp = Meta Cloud
// API via plain fetch (works the moment WHATSAPP_TOKEN + phone-id exist —
// Meta business verification is the human prerequisite, not code).
import { Resend } from "resend";

export interface SendResult {
  channel: "email" | "whatsapp";
  status: "sent" | "skipped-no-creds" | "failed";
  detail?: string;
}

let resendClient: Resend | null = null;
function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<SendResult> {
  const client = resend();
  if (!client) return { channel: "email", status: "skipped-no-creds", detail: "RESEND_API_KEY not set" };
  try {
    const from = process.env.ALERT_FROM_EMAIL || "OpsDesk <alerts@resend.dev>";
    const res = await client.emails.send({ from, to: opts.to, subject: opts.subject, text: opts.text });
    if (res.error) return { channel: "email", status: "failed", detail: res.error.message };
    return { channel: "email", status: "sent" };
  } catch (e) {
    return { channel: "email", status: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendWhatsApp(opts: { to: string; text: string }): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return { channel: "whatsapp", status: "skipped-no-creds", detail: "WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set" };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: opts.to,
        type: "text",
        text: { preview_url: false, body: opts.text },
      }),
    });
    if (!res.ok) {
      return { channel: "whatsapp", status: "failed", detail: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { channel: "whatsapp", status: "sent" };
  } catch (e) {
    return { channel: "whatsapp", status: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** One plain-text digest (WhatsApp-flavored markdown works fine in email too). */
export function renderAlertDigest(
  tenantName: string,
  items: { consoleTitle: string; messages: string[] }[],
): string {
  const stamp = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const body = items
    .map((i) => `*${i.consoleTitle}*\n${i.messages.map((m) => `• ${m}`).join("\n")}`)
    .join("\n\n");
  return `*OpsDesk alerts — ${tenantName}*\n🕐 ${stamp}\n\n${body || "All clear ✅"}`;
}
