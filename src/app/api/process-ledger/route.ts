import { google } from "@ai-sdk/google";
import { z } from "zod";
import { NextResponse } from "next/server";
import { generateWithRepair } from "@/lib/infra/repair";

// The Universal Schema: Instead of hardcoding cash/upi, we allow the AI to return 
// ANY dynamic JSON structure inside 'extracted_payload' based on the config.
const DynamicExtractionSchema = z.object({
  scratchpad: z
    .string()
    .describe("Transcribe the input and show your step-by-step math calculations (e.g. percentages)."),
  extracted_payload: z
    .record(z.string(), z.any())
    .describe("The dynamic JSON payload containing the structured data, arrays, and calculated metrics based on the rules."),
  math_verified: z
    .boolean()
    .describe("True if all formulas, percentages, and invariants check out perfectly."),
  confidence_score: z
    .number()
    .min(0)
    .max(1)
    .describe("A score from 0.0 to 1.0 on how confident you are in the extraction."),
  anomaly_flags: z
    .array(z.string())
    .describe("List any missing targets, weird numbers, or failed math here."),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Early return for training signal (Moat #6)
    if (body.training_signal) {
      console.log(`[Training Signal] Received ${body.corrections?.length} corrections for workflow ${body.workflowId}`);
      // In a full implementation, persist to a tuning dataset
      return NextResponse.json({ success: true, logged: true });
    }

    const { base64Image, textNote, config } = body;

    if (!base64Image && !textNote) {
      return NextResponse.json({ error: "No image or note provided" }, { status: 400 });
    }

    const userContent: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
      {
        type: "text",
        text: "Extract and structure the data from the provided input.",
      }
    ];

    if (base64Image) {
      userContent.push({ type: "image", image: base64Image });
    }

    if (textNote) {
      userContent.push({
        type: "text",
        text: `Here is the input from the staff: \n\n"${textNote}"`,
      });
    }

    const object = await generateWithRepair({
      model: google("gemini-3.1-flash-lite"), 
      instructions: `You are the Universal Data Extraction Engine for the Autonomous Operations Desk.
          Your job is to read messy physical inputs or chat logs and structure them into JSON.
          
          TENANT CONFIGURATION RULES & MATH INSTRUCTIONS:
          ${JSON.stringify(config || {})}
          
          INSTRUCTIONS:
          1. Use the 'scratchpad' to transcribe the data and calculate any percentages or totals requested in the rules.
          2. Structure the final data perfectly into 'extracted_payload' matching the EXACT keys provided in the schema.
             - If layout_type is 'list', return a flat object: { "fieldKey1": value, "fieldKey2": value }
             - If layout_type is 'grid', return a nested object mapping column keys to row keys: { "colKey1": { "rowKey1": value }, "colKey2": { "rowKey1": value } }
          3. Verify all math. If a percentage is calculated, double check it. Set 'math_verified' to true if everything is perfect.
          4. If data is missing for a person or field, leave it null and add an 'anomaly_flag'.`,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    }, DynamicExtractionSchema);

    return NextResponse.json({ success: true, data: object });
  } catch (error) {
    console.error("AI Extraction Error:", error);
    return NextResponse.json(
      { error: "Failed to process input" },
      { status: 500 }
    );
  }
}
