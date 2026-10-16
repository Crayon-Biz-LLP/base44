import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const aiKeys = [
  process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  process.env.GOOGLE_GENERATIVE_AI_API_KEY_2,
  process.env.GOOGLE_GENERATIVE_AI_API_KEY_3,
].filter((k): k is string => typeof k === "string" && k.trim().length > 0);

// Fallback to empty string if no keys provided, though API will fail
const safeKeys = aiKeys.length > 0 ? aiKeys : [""];

const providers = safeKeys.map((apiKey) => createGoogleGenerativeAI({ apiKey }));

// Extraction reroll budget. The extractors retry schema mismatches AND rotate
// keys on every attempt (getModel rotates). Key count alone (3) proved too thin
// for flash-lite schema variance (cold-storage prompt: 1/3 success at 3 rolls).
// Two passes over the keys gives variance room to converge; worst-case latency
// is bounded because healthy keys answer in one call.
export const EXTRACTION_ATTEMPTS = aiKeys.length * 2;

export function getModel(attempt: number, modelId: string = "gemini-3.1-flash-lite") {
  const provider = providers[attempt % providers.length];
  return provider(modelId);
}

export function isQuotaError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { statusCode?: number; message?: string; cause?: { statusCode?: number; message?: string } };
  
  if (e.statusCode === 429 || e.cause?.statusCode === 429) {
    return true;
  }
  
  const errorMessage = e.message || e.cause?.message || String(error);
  const lowerMsg = errorMessage.toLowerCase();
  
  return (
    lowerMsg.includes("quota exceeded") ||
    lowerMsg.includes("exceeded your current quota") ||
    lowerMsg.includes("resource_exhausted") ||
    lowerMsg.includes("free_tier_requests") ||
    lowerMsg.includes("429") ||
    // Per-key/per-project capacity responses (verified by probe-gemini.mts:
    // same model 503s on one key while others return 200). These must rotate
    // to the next key exactly like quota exhaustion, not abort extraction.
    lowerMsg.includes("high demand") ||
    lowerMsg.includes("overloaded") ||
    e.statusCode === 503 ||
    e.cause?.statusCode === 503
  );
}
