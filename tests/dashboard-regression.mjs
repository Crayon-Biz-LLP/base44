import http from 'http';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DELAY_MS = 6000; 

const colors = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', bold: '\x1b[1m'
};

const corpus = [
  {
    id: "TREND_QUERY",
    prompt: "Show me a trend of sales for the last 7 days",
    expectEmpty: false,
    validate: (spec, workflowIds) => {
      const trend = spec.widgets.find(w => w.type === 'trend');
      if (!trend) return "Expected a trend widget";
      if (trend.dateRange !== 'last7') return `Expected dateRange last7, got ${trend.dateRange}`;
      if (!workflowIds.includes(trend.workflowId)) return "workflowId not in valid tenant workflows";
      return null;
    }
  },
  {
    id: "COMPARE_QUERY",
    prompt: "Compare Ramesh vs Suresh achievement",
    expectEmpty: false,
    validate: (spec, workflowIds) => {
      const compare = spec.widgets.find(w => w.type === 'compare' || w.type === 'table');
      if (!compare) return "Expected a compare or table widget";
      if (compare.entity !== 'staff') return "Expected grouping by staff";
      return null;
    }
  },
  {
    id: "SUMMARY_QUERY",
    prompt: "Give me today's summary",
    expectEmpty: false,
    validate: (spec) => {
      if (spec.widgets.length === 0) return "Expected at least one widget";
      const allToday = spec.widgets.every(w => w.dateRange === 'today');
      if (!allToday) return "Expected dateRange today";
      return null;
    }
  },
  {
    id: "VAGUE_OVERVIEW",
    prompt: "show me everything",
    expectEmpty: false,
    validate: (spec) => {
      if (spec.widgets.length < 2) return "Expected default overview with multiple widgets";
      return null;
    }
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
    const res = await fetch(`${BASE_URL}/api/dashboard/generate`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(authCookie ? { 'Cookie': authCookie } : {})
      },
      body: JSON.stringify({ prompt: test.prompt })
    });
    const data = await res.json();
    
    if (data.empty) {
      if (test.expectEmpty) return { pass: true, detail: "Empty as expected" };
      return { pass: false, reason: "Returned empty (no workflows found for tenant). Seed DB first." };
    }
    
    if (test.expectEmpty) return { pass: false, reason: "Expected empty, got spec" };
    
    if (test.validate) {
      const customErr = test.validate(data.spec, data.workflowIds);
      if (customErr) return { pass: false, reason: customErr };
    }
    return { pass: true, detail: `Spec OK (${data.spec.widgets.length} widgets)` };
  } catch (error) {
    return { pass: false, reason: error.message };
  }
}

async function main() {
  console.log(`\n${colors.bold}=== Dashboard Spec Regression Harness ===${colors.reset}`);
  
  try {
    const serverCheck = await fetch(`${BASE_URL}/api/cron/digest`);
  } catch (e) {
    console.error(`${colors.red}Error: Dev server is not running at ${BASE_URL}${colors.reset}`);
    process.exit(1);
  }

  await authenticate();

  let passed = 0, failed = 0;

  for (const test of corpus) {
    const result = await runTest(test);
    if (result.pass) {
      console.log(`[${colors.green}PASS${colors.reset}] ${result.detail || ''}`);
      passed++;
    } else {
      console.log(`[${colors.red}FAIL${colors.reset}] ${result.reason}`);
      failed++;
    }
    if (test.id !== corpus[corpus.length - 1].id) await sleep(DELAY_MS);
  }

  console.log(`\n${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
