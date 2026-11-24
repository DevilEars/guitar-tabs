// Applies every supabase/migrations/*.sql to an in-process Postgres (PGlite) with stand-ins for Supabase's
// auth schema and roles, then checks Row Level Security. Not a substitute for testing on a real project.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
// Minimal stand-ins for Supabase's auth schema/roles.
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
`);
const dir = 'supabase/migrations';
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8'));
const as = async (uid, sql, params = []) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const out = [];
const t = (name, ok) => { out.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
await as(A, `insert into public.tabs (id, title, tuning, content) values ('aaaaaaaa-0000-4000-8000-000000000001', 'A tab', '{64,59,55,50,45,40}', 'e|-0-|')`);
t('A can insert own row (user_id defaults to auth.uid())', (await as(A, 'select user_id from public.tabs')).rows[0]?.user_id === A);
t('B cannot see A rows', (await as(B, 'select * from public.tabs')).rows.length === 0);
let err = null; try { await as(B, `insert into public.tabs (id, user_id) values ('bbbbbbbb-0000-4000-8000-000000000001', '${A}')`); } catch (e) { err = e.message; }
t('B cannot insert a row owned by A', !!err && /row-level security/.test(err));
t('B update of A row affects 0 rows', (await as(B, `update public.tabs set title='hacked'`)).affectedRows === 0);
t('B delete of A row affects 0 rows', (await as(B, `delete from public.tabs`)).affectedRows === 0);
err = null; try { await as(A, `update public.tabs set user_id='${B}'`); } catch (e) { err = e.message; }
t('A cannot hand a row to B', !!err);
err = null; try { await as(null, 'select * from public.tabs'); } catch (e) { err = e.message; }
t('anon has no access', !!err && /permission denied/.test(err));
await as(A, `insert into public.tabs (id, title, updated_at, deleted_at) values ('aaaaaaaa-0000-4000-8000-000000000001','A v2', now(), now()) on conflict (id) do update set title = excluded.title, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`);
const row = (await as(A, 'select title, deleted_at from public.tabs')).rows[0];
t('upsert on conflict(id) incl. soft delete works for owner', row.title === 'A v2' && row.deleted_at !== null);
err = null; try { await as(A, `insert into public.tabs (id, tempo) values ('aaaaaaaa-0000-4000-8000-000000000002', 1000)`); } catch (e) { err = e.message; }
t('check constraint on tempo', !!err);
console.log(`${out.filter(Boolean).length}/${out.length} passed`);
process.exit(out.every(Boolean) ? 0 : 1);
