const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("UPDATE tenants SET staff_pin = '1234' WHERE access_code = 'chennai2026' RETURNING *")
  .then(res => {
    console.log("Updated tenant:", res.rows[0]);
    process.exit(0);
  })
  .catch(console.error);
