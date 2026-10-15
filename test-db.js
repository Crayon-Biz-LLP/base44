const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT * FROM tenants WHERE access_code='chennai2026'").then(res => {
  console.log(res.rows);
  if (res.rows.length === 0) {
    return pool.query("INSERT INTO tenants (name, access_code) VALUES ('Demo Store', 'chennai2026') RETURNING *");
  }
}).then(() => process.exit(0)).catch(console.error);
