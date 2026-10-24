import { Pool, PoolClient } from "pg";
const g = globalThis as unknown as { pool?: Pool };
export const pool = g.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === "1" ? { rejectUnauthorized: false } : undefined, max: 8 });
if (process.env.NODE_ENV !== "production") g.pool = pool;
export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> { const r = await pool.query(sql, params); return r.rows as T[]; }
export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | null> { const r = await q<T>(sql, params); return r[0] ?? null; }
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query("begin"); const r = await fn(c); await c.query("commit"); return r; }
  catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}
