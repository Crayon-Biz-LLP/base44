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
    content: "Now, lets create a schedule for next month. There are 3 groups - Beginners, Juniors and Middlers. Juniors and Middlers have 2 slots per day. And i need slots or shifts for all Sundays in Oct 2026, with the volunteers filling out their names in the slots." 
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
    console.log("\nSending clarification: 'Beginners has 1 slot.'\n");
    
    messages.push({ role: "assistant", content: data.message });
    messages.push({ role: "user", content: "Beginners has 1 slot." });
    
    chatRes = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authCookie ? { "Cookie": authCookie } : {}) },
      body: JSON.stringify({ messages })
    });
    data = await chatRes.json();
  }

  console.log("\n[Final API Response]:");
  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
