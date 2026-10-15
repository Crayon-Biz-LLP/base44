import http from 'http';

const BASE_URL = 'http://127.0.0.1:3000';
let authCookie = null;

async function test() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: "chennai2026" })
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) authCookie = setCookie.split(';')[0];

  let messages = [{ 
    role: "user", 
    content: "I want an invoice for my gym - Danny's Gym and Health Fitness. It should have Date, Name of the client, What service they took from me, Quantity, Amount and total amount. No GST as I dont have GST. and something nice to be added along with the invoice."
  }];
  
  console.log("Sending Initial Prompt...");
  let chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authCookie ? { "Cookie": authCookie } : {}) },
    body: JSON.stringify({ messages })
  });
  
  if (!chatRes.ok) {
     console.error("API Error:", await chatRes.text());
     return;
  }
  let data = await chatRes.json();
  
  if (data.workflowId === null && data.message) {
    console.log("\n[Clarification Needed]:", data.message);
    return;
  }

  console.log("\n[Generation]:");
  console.log("  workflowId:", data.workflowId);
  console.log("  artifact (html emitted):", data.artifact);
  console.log("  app_title:", data.app_title);

  const wfRes = await fetch(`${BASE_URL}/api/workflow/${data.workflowId}`, {
    ...(authCookie ? { headers: { Cookie: authCookie } } : {})
  });
  const wf = await wfRes.json();
  const artifactHtml = wf?.workflow?.config?.artifactHtml;
  const schema = wf?.workflow?.config?.schema;

  console.log("\n[Persistence]:");
  console.log("  artifactHtml length:", artifactHtml ? artifactHtml.length : 0);
  console.log("  manifest layout_type:", schema?.layout_type);
  console.log("  manifest intelligence:", JSON.stringify(schema?.intelligence || {}));

  const hasBridge = artifactHtml && artifactHtml.includes("__opsDeskSubmit__");
  console.log("\n[Artifact checks]:");
  console.log("  calls __opsDeskSubmit__:", !!hasBridge);
  console.log("  uses form action/fetch/audio:", /<form [^>]*action|<script[^>]*fetch\(|<audio|<video/i.test(artifactHtml || ""));

  console.log("\n[Submit URL]:");
  console.log(`  http://localhost:3000/submit/${data.workflowId}`);
}

test().catch(console.error);
