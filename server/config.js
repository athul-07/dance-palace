import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const databaseUrl = env.DATABASE_URL || '';
  const jwtSecret = env.JWT_SECRET || (production ? '' : randomBytes(48).toString('hex'));
  const publicOrigin = env.PUBLIC_ORIGIN || '';
  if (production) {
    if (!databaseUrl) throw new Error('Production requires DATABASE_URL: use the PostgreSQL connection string from Supabase Database > Connect, not SUPABASE_URL or an API key.');
    if (jwtSecret.length < 32 || /replace|example|change.?me/i.test(jwtSecret)) throw new Error('Set a unique JWT_SECRET of at least 32 characters.');
    let url;
    try { url = new URL(publicOrigin); } catch { throw new Error('PUBLIC_ORIGIN must be your HTTPS origin.'); }
    if (url.protocol !== 'https:' || url.origin !== publicOrigin || url.username || url.password) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash or path.');
    if (env.COOKIE_SECURE === 'false') throw new Error('Production session cookies must be secure.');
    if (env.SEED_DEMO === 'true') throw new Error('Demo seeding is disabled in production.');
  }
  if (databaseUrl) {
    const u = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(u.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
    if (production && ['disable','no-verify','prefer','allow'].includes(u.searchParams.get('sslmode'))) throw new Error('Use DATABASE_SSL=disable only for a private database network; insecure URL SSL modes are not allowed.');
  }
  const sslMode = env.DATABASE_SSL || 'verify';
  if (!['verify','disable'].includes(sslMode)) throw new Error('DATABASE_SSL must be verify or disable.');
  const proxy = env.TRUST_PROXY || '0';
  if (!/^\d+$/.test(proxy) || Number(proxy) > 5) throw new Error('TRUST_PROXY must be an explicit hop count from 0 to 5.');
  return {production,databaseUrl,jwtSecret,publicOrigin,secureCookies:production || env.COOKIE_SECURE === 'true',trustProxy:Number(proxy),seedDemo:!production && env.SEED_DEMO === 'true',bootstrapUsername:env.BOOTSTRAP_ADMIN_USERNAME || 'admin',bootstrapPassword:env.BOOTSTRAP_ADMIN_PASSWORD || (production?'':'admin123'),sslMode,sslCaFile:env.DATABASE_SSL_CA_FILE,port:Number(env.PORT)||3001,host:env.HOST || '0.0.0.0'};
}
export function poolOptions(config) {
  const url = new URL(config.databaseUrl);
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  return {connectionString:url.toString(),max:10,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:120000,application_name:'dance-palace',ssl:config.sslMode === 'disable'?false:{rejectUnauthorized:true,...(config.sslCaFile?{ca:readFileSync(config.sslCaFile,'utf8')}:{})}};
}
export const config = readConfig();
