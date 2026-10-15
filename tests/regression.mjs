import http from 'http';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DELAY_MS = 6000;

const colors = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m'
};

const corpus = [
  {
    id: "VAGUE_GRID",
    prompt: "Build a target tracker",
    expectClarification: true,
  },
  {
    id: "VAGUE_LIST",
    prompt: "Build a schedule",
    expectClarification: true,
  },
  {
    id: "DETAILED_GRID",
    prompt: "Track daily sales targets for 4 staff members: Ramesh, Suresh, Priya, Anil, with targets of 20, 15, 18, 12 units for Morning and Evening shifts",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (schema.rows?.length !== 4) return `Expected exactly 4 rows, got ${schema.rows?.length}`;
      
      const hasTargets = schema.rows?.some(r => r.target > 0) || schema.columns?.some(c => c.targets && Object.keys(c.targets).length > 0) || schema.columns?.some(c => c.target > 0) || schema.intelligence?.invariants?.length > 0;
      if (!hasTargets) return "Expected targets on records or invariants in intelligence";

      return null;
    }
  },
  {
    id: "MULTI_METRIC_TARGETS_GRID",
    prompt: "I have 4 employees: Bhuvana, Srimathi, Shamla, and Niharshana. Every day I need them to report their actual numbers for 'New' (target 3), '10DDay' (target 20), '20Days' (target 18), '30DDay' (target 10), '100DDay' (target 10), 'MC' (target 20), 'Family' (target 20), 'Chronic' (target 6). Please build my form.",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (schema.rows?.length !== 4) return `Expected exactly 4 rows, got ${schema.rows?.length}`;
      if (schema.columns?.length !== 8) return `Expected exactly 8 columns, got ${schema.columns?.length}`;
      
      return null;
    }
  },
  {
    id: "PERSONAL_FORM",
    prompt: "I have 4 employees: Bhuvana, Srimathi, Shamla, and Niharshana. Every day I need each of them to report their actual numbers for 'New' (target 3), '10DDay' (target 20), '20Days' (target 18), '30DDay' (target 10), '100DDay' (target 10), 'MC' (target 20), 'Family' (target 20), 'Chronic' (target 6). Please build my form.",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (schema.entryMode !== "personal") return `Expected entryMode 'personal', got '${schema.entryMode}'`;
      return null;
    }
  },
  {
    id: "SINGLE_METRIC",
    prompt: "track todays total sales for my bakery",
    expectClarification: false,
    expectedLayout: "list",
    validate: (schema) => {
      const hasCurrency = schema.fields?.some(f => f.type === 'currency' || f.type === 'number');
      if (!hasCurrency) return "Expected currency or number field for total sales";
      return null;
    }
  },
  {
    id: "SMOKE_INVOICE",
    prompt: "invoice form for my store",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (!schema.intelligence?.repeatable?.enabled) return "Expected repeatable rows for invoice";
      return null;
    }
  },
  {
    id: "SMOKE_ATTENDANCE",
    prompt: "daily attendance for 9 staff",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (!schema.intelligence?.entities || schema.intelligence.entities.length !== 9) return "Expected 9 entities in roster";
      return null;
    }
  },
  {
    id: "SMOKE_PETTY_CASH",
    prompt: "petty cash log",
    expectClarification: false,
    expectedLayout: "list",
    validate: (schema) => {
      if (schema.layout_type !== "list") return "Expected list layout for simple petty cash log";
      return null;
    }
  },
  {
    id: "DETAILED_LIST",
    prompt: "Daily closing checklist for a cafe with: lights off, cash counted, doors locked, oven cleaned",
    expectClarification: false,
    expectedLayout: "list",
    validate: (schema) => {
      if (schema.fields?.length < 4) return "Expected at least 4 checklist records";
      const hasBooleanOrText = schema.fields.some(f => f.type === 'boolean' || f.type === 'text');
      if (!hasBooleanOrText) return "Expected boolean or text fields for a checklist";
      return null;
    }
  },
  {
    id: "HINGLISH",
    prompt: "2 staff ka daily target banao",
    expectClarification: 'any', 
  },
  {
    id: "NUMBERS_AS_WORDS",
    prompt: "track daily targets for Ramesh - twenty units and Suresh - fifteen units for evening shift",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      const rameshRow = schema.rows?.find(r => r.label.toLowerCase().includes('ramesh'));
      const sureshRow = schema.rows?.find(r => r.label.toLowerCase().includes('suresh'));
      if (rameshRow?.target !== 20) return `Expected Ramesh target to be 20`;
      if (sureshRow?.target !== 15) return `Expected Suresh target to be 15`;
      return null;
    }
  },
  {
    id: "SLOT_ROSTER",
    prompt: "roster for 5 volunteers on Sunday with specific slot names 1 to 5",
    expectClarification: false,
    expectedLayout: "grid",
  },
  {
    id: "GRID_PRODUCTS",
    prompt: "weekly stock counts for 3 products: milk, bread, eggs",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (schema.rows?.length !== 3) return "Expected 3 rows";
      return null;
    }
  },
  {
    id: "DATE_SANITY",
    prompt: "schedule for next month",
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (schema.rows?.length === 0) return "Expected dates to be populated deterministically!";
      return null;
    }
  },
  {
    id: "SCHEDULE_SCHOOL",
    prompt: "schedule for next month",
    messages: [
      { role: "user", content: "schedule for next month" },
      { role: "assistant", content: "Could you provide a few more details so I can build this correctly?" },
      { role: "user", content: "There are 3 groups - Beginners, Juniors and Middlers. Juniors and Middlers have 2 slots per day. Beginners has 1 slot. And i need slots or shifts for all Sundays in Oct 2026." }
    ],
    expectClarification: false,
    expectedLayout: "grid",
    validate: (schema) => {
      if (schema.rows?.length !== 4) return `Expected 4 date rows, got ${schema.rows?.length}`;
      if (schema.columns?.length !== 5) return `Expected 5 combination columns, got ${schema.columns?.length}`;
      return null;
    }
  },
  {
    id: "SINGLE_METRIC",
    prompt: "track todays total sales for my bakery",
    expectClarification: 'any', 
    expectedLayout: "any",
  }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let authCookie = null;

async function authenticate() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: "chennai2026" })
  });
  if (!res.ok) {
    throw new Error("Failed to authenticate test runner");
  }
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    authCookie = setCookie.split(';')[0];
  }
}

async function runTest(test) {
  process.stdout.write(`  ${colors.cyan}Running ${test.id}...${colors.reset} `);
  
  try {
    const messages = test.messages || [{ role: 'user', content: test.prompt }];
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(authCookie ? { 'Cookie': authCookie } : {})
      },
      body: JSON.stringify({ messages })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    const gotClarification = data.workflowId === null && !!data.message;
    
    if (test.expectClarification === true && !gotClarification) {
      return { pass: false, reason: `Expected clarification question, but got schema (Layout: ${data.ui_schema?.layout_type})` };
    }
    if (test.expectClarification === false && gotClarification) {
      return { pass: false, reason: `Expected schema, but got clarification question: "${data.message}"` };
    }

    if (gotClarification) {
      return { pass: true, detail: "Clarification triggered correctly" };
    }

    if (data.version !== 4) {
      return { pass: false, reason: `Expected schema version 4, got ${data.version}` };
    }

    const schema = data.ui_schema; 
    if (!schema) return { pass: false, reason: "Missing ui_schema in response" };
    if (!['list', 'grid'].includes(schema.layout_type)) {
      return { pass: false, reason: `Invalid layout_type: ${schema.layout_type}` };
    }
    
    if (test.expectedLayout !== 'any' && test.expectedLayout !== schema.layout_type) {
      return { pass: false, reason: `Expected layout '${test.expectedLayout}' but got '${schema.layout_type}'` };
    }

    if (test.validate) {
      const customErr = test.validate(schema);
      if (customErr) return { pass: false, reason: customErr };
    }

    return { pass: true, detail: `Schema OK (${schema.layout_type})` };
  } catch (error) {
    return { pass: false, reason: error.message };
  }
}

async function checkServer() {
  return new Promise((resolve) => {
    http.get(BASE_URL, (res) => {
      resolve(true);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function main() {
  console.log(`\n${colors.bold}=== Autonomous Ops Desk: Prompt Regression Harness ===${colors.reset}`);
  console.log(`Target: ${BASE_URL}\n`);

  const serverUp = await checkServer();
  if (!serverUp) {
    console.error(`${colors.red}Error: Dev server is not running at ${BASE_URL}${colors.reset}`);
    process.exit(1);
  }

  await authenticate();

  let passed = 0;
  let failed = 0;

  let subset = process.env.SUBSET ? process.env.SUBSET.split(",") : null;
  for (const test of corpus) {
    if (subset && !subset.includes(test.id)) continue;
    const result = await runTest(test);
    
    if (result.pass) {
      console.log(`[${colors.green}PASS${colors.reset}] ${result.detail || ''}`);
      passed++;
    } else {
      console.log(`[${colors.red}FAIL${colors.reset}] ${result.reason}`);
      failed++;
    }

    if (test.id !== corpus[corpus.length - 1].id) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n${colors.bold}=== Results ===${colors.reset}`);
  console.log(`${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset} | Total: ${corpus.length}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
