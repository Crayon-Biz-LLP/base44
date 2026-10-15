/**
 * Safely parses a fetch Response, handling empty bodies and invalid JSON gracefully.
 * Next.js dev server sometimes returns empty 500 responses during hot-reloads.
 */
export async function safeJson(res: Response) {
  const text = await res.text();
  
  if (!text || text.trim() === "") {
    return { error: `Server returned an empty response (status ${res.status}). Please retry.` };
  }
  
  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: `Invalid JSON response from server (status ${res.status}). Please retry.` };
  }
}
