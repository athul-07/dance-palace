import { readFile, readdir } from "node:fs/promises";
import { createHash } from 'node:crypto';
import { atomic, close } from "./db.js";
import { config } from './config.js';
export async function migrate() {
  const directory = new URL('./migrations/', import.meta.url);
  const files = (await readdir(directory)).filter(f=>/^\d+.*\.sql$/.test(f)).sort();
  await atomic(async q=>{
    if(config.databaseUrl) await q('SELECT pg_advisory_xact_lock(14793012)');
    await q('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    for(const name of files) {
      const sql = await readFile(new URL(name,directory),'utf8');
      const checksum = createHash('sha256').update(sql.replaceAll('\r\n','\n')).digest('hex');
      const old = (await q('SELECT checksum FROM schema_migrations WHERE name=$1',[name])).rows[0];
      if(old) {if(old.checksum!==checksum) throw new Error(`Applied migration ${name} was changed. Add a new migration instead.`);continue;}
      for(const statement of sql.split(';').filter(s=>s.trim())) await q(statement);
      await q('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
    }
  });
}
if (process.argv[1]?.endsWith("migrate.js")) {
  try{await migrate();console.log('Database migrations complete.');}finally{await close();}
}
