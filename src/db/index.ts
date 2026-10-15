import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

// Transactional driver (A6): the WebSocket Pool (unlike neon-http) runs real
// multi-statement transactions — activation's deactivate+activate is atomic.
// Node's native WebSocket client is used (stable since Node 22; this repo runs
// Node 24), so no polyfill package is needed.
neonConfig.webSocketConstructor = globalThis.WebSocket;

// This expects DATABASE_URL in your .env.local file
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });
