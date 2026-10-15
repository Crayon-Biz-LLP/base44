require('dotenv').config({ path: '.env.local' });
const { migrateCubeToNative } = require('./.next/server/app/submit/[id]/page.js'); // Not easily exported.

// Instead, I will write a simple test script using fetch
fetch('http://127.0.0.1:3000/api/workflow/5920c7c5-6e58-4e40-80e2-1266ed2187aa')
  .then(res => res.json())
  .then(data => {
    console.log(JSON.stringify(data.workflow.config.schema, null, 2));
  }).catch(console.error);
