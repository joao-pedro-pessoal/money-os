/** Real pg_dump -> encrypted file -> pg_restore. Synthetic, loopback-only, opt-in. */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { connectionSettings, createServiceBackup, restoreServiceBackup, verifyServiceBackup } from "./backup/service";

const quote=(name:string)=>'"'+name.replace(/"/g,'""')+'"';
async function connect(url:string){const client=new Client({connectionString:url,connectionTimeoutMillis:5000});await client.connect();return client;}
async function fingerprint(client:Client) {
  const tables=(await client.query<{schema:string;name:string}>(`select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_' order by 1,2`)).rows;
  const data:Record<string,{rows:number;sha256:string}>={};
  for(const table of tables) {
    const rows=(await client.query(`select to_jsonb(t)::text as row from ${quote(table.schema)}.${quote(table.name)} t order by to_jsonb(t)::text`)).rows;
    data[table.schema+'.'+table.name]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
  }
  const policies=(await client.query(`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies order by 1,2,3`)).rows;
  const rls=(await client.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by 1`)).rows;
  const sequences=(await client.query(`select schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value from pg_sequences where schemaname !~ '^pg_' order by 1,2`)).rows;
  return {data,policies,rls,sequences};
}

async function main() {
  if(process.argv[2]!=="--local"||!process.argv[3])throw new Error("Use --local <private evidence directory> with BACKUP_REHEARSAL_ADMIN_URL pointing at an expendable local PostgreSQL server.");
  const adminUrl=process.env.BACKUP_REHEARSAL_ADMIN_URL;
  connectionSettings(adminUrl); // rejects every remote URL before opening a socket
  const directory=resolve(process.argv[3]);await mkdir(directory,{recursive:true});
  const nonce=randomBytes(6).toString('hex'),sourceName='moneyos_c7_source_'+nonce,targetName='moneyos_c7_target_'+nonce,role='moneyos_c7_app_'+nonce;
  const admin=await connect(adminUrl!);let source:Client|undefined,target:Client|undefined,pool:Pool|undefined;
  const report:{checks:string[];[key:string]:unknown}={checks:[]};const pass=(message:string)=>{report.checks.push(message);console.log('PASS '+message);};
  try {
    await admin.query(`create database ${quote(sourceName)} template template0`);await admin.query(`create database ${quote(targetName)} template template0`);
    const sourceUrl=new URL(adminUrl!);sourceUrl.pathname='/'+sourceName;const targetUrl=new URL(adminUrl!);targetUrl.pathname='/'+targetName;
    source=await connect(sourceUrl.toString());target=await connect(targetUrl.toString());
    pool=new Pool({connectionString:sourceUrl.toString(),max:1});await migrate(drizzle(pool),{migrationsFolder:resolve('drizzle')});await pool.end();pool=undefined;
    await source.query("delete from users");await source.query("insert into users(id,email,password_hash,password_kind,recovery_hash) values ('backup-a','a@example.test','synthetic-only','keyed','synthetic-recovery'),('backup-b','b@example.test','synthetic-only','keyed','synthetic-recovery')");
    await admin.query(`create role ${quote(role)} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    const grant=async(client:Client)=>{await client.query(`grant usage on schema public to ${quote(role)};grant select,insert,update,delete on all tables in schema public to ${quote(role)};grant usage,select on all sequences in schema public to ${quote(role)}`);};
    await grant(source);await source.query(`set role ${quote(role)}`);
    for(const user of ['backup-a','backup-b']) {
      await source.query("select set_config('app.user_id',$1,false)",[user]);
      await source.query("insert into accounts(id,name,institution,account_type,balance,currency) values ($1,'Everyday','Synthetic','bank',1234.56,'EUR'),($2,'Savings','Synthetic','bank',789.01,'USD')",[user+'-eur',user+'-usd']);
      await source.query("insert into buckets(id,name,target_amount) values($1,'Trip',500)",[user+'-goal']);
      await source.query("insert into bucket_allocations(id,bucket_id,account_id,amount) values($1,$2,$3,100)",[user+'-allocation',user+'-goal',user+'-eur']);
      await source.query("insert into transactions(id,date,amount,account_id,type,description) values($1,'2026-10-30T12:00:00Z',-20,$2,'expense','Synthetic purchase')",[user+'-transaction',user+'-eur']);
      await source.query("insert into budgets(id,name,limit_amount) values($1,'Everyday',200)",[user+'-budget']);
      await source.query("insert into audit_log(id,entity_type,entity_id,action,details) values($1,'manual_request',$2,'balance:set','sha256:synthetic-receipt')",[user+'-receipt',user+'-eur']);
    }
    await source.query('reset role');
    // Include a shared table too: whole-service backups are not scoped by app.user_id.
    await source.query("insert into request_limits(id,action,origin) values('synthetic-limit','synthetic','synthetic-hash')");
    const original=await fingerprint(source);report.tables=Object.keys(original.data).length;report.policies=original.policies.length;
    assert(original.policies.length>40);assert.equal(original.data['public.accounts'].rows,4);assert(original.data['drizzle.__drizzle_migrations'].rows>60);pass('real migrations, two people, shared state and RLS seeded in local PostgreSQL');
    const environment={...process.env,DATABASE_ADMIN_URL:sourceUrl.toString(),DATABASE_RESTORE_URL:targetUrl.toString(),BACKUP_PASSPHRASE:randomBytes(32).toString('base64url')};
    const restrictedUrl=new URL(sourceUrl);restrictedUrl.username=role;restrictedUrl.password='synthetic';
    await source.query(`grant usage on schema drizzle to ${quote(role)};grant select on all tables in schema drizzle to ${quote(role)}`);
    await assert.rejects(createServiceBackup(join(directory,'restricted.moneyos.enc'),{...environment,DATABASE_ADMIN_URL:restrictedUrl.toString()}),/not completed/);
    assert(!(await readdir(directory)).some(name=>name.startsWith('restricted.moneyos.enc')));pass('limited app role cannot produce a partial whole-service backup');
    const file=join(directory,'synthetic-service.moneyos.enc');const metadata=await createServiceBackup(file,environment);report.backup=metadata;pass('whole database copied with pg_dump and authenticated encryption');
    assert.deepEqual(await verifyServiceBackup(file,environment),metadata);pass('ciphertext checksum and AES-GCM authentication verified');
    await assert.rejects(verifyServiceBackup(file,{...environment,BACKUP_PASSPHRASE:'Wrong synthetic passphrase for this test'}),/integrity/);pass('wrong passphrase refused');
    const corrupt=join(directory,'corrupt.moneyos.enc'),bytes=await readFile(file);bytes[Math.floor(bytes.length/2)]^=1;await writeFile(corrupt,bytes);await writeFile(corrupt+'.sha256',createHash('sha256').update(bytes).digest('hex')+'\n');
    await assert.rejects(restoreServiceBackup(corrupt,environment),/integrity/);pass('tampering refused before restore even with a recomputed public checksum');
    assert.equal((await target.query("select count(*) as n from information_schema.tables where table_schema='public'")).rows[0].n,'0');
    await restoreServiceBackup(file,environment);pass('actual pg_restore into an empty local database completed');
    assert.deepEqual(await fingerprint(target),original);pass('every application/migration table, rows, policies, RLS flags and sequences match');
    await assert.rejects(restoreServiceBackup(file,environment),/not empty/);assert.deepEqual(await fingerprint(target),original);pass('nonempty target refused without changing any restored data');
    await grant(target);await target.query(`set role ${quote(role)}`);
    assert.equal((await target.query('select rolbypassrls or rolsuper as bypass from pg_roles where rolname=current_user')).rows[0].bypass,false);
    for(const user of ['backup-a','backup-b']) {
      await target.query("select set_config('app.user_id',$1,false)",[user]);
      const accountRows:{id:string;user_id:string;balance:string;currency:string}[]=(await target.query('select id,user_id,balance,currency from accounts order by id')).rows;assert.equal(accountRows.length,2);assert(accountRows.every(row=>row.user_id===user));
      const other=user==='backup-a'?'backup-b':'backup-a';assert.equal((await target.query('select * from accounts where id=$1',[other+'-eur'])).rowCount,0);
      assert.equal((await target.query('update accounts set balance=0 where id=$1',[other+'-eur'])).rowCount,0);
      await assert.rejects(target.query("insert into accounts(id,user_id,name,institution,account_type,balance) values($1,$2,'Forged','Synthetic','bank',0)",[user+'-forged',other]),error=>(error as {code:string}).code==='42501');
    }
    await target.query('reset role');assert.deepEqual(await fingerprint(target),original);pass('restored app role cannot bypass RLS or read/write another person');
    await assert.rejects(createServiceBackup(file,environment));assert.deepEqual(await verifyServiceBackup(file,environment),metadata);pass('existing backup file is never overwritten');
    report.result='PASS';await writeFile(join(directory,'result.json'),JSON.stringify(report,null,2)+'\n');
  } finally {
    await pool?.end();await source?.end();await target?.end();
    // Keep restored synthetic databases until the local test server is stopped for inspection.
    await admin.end();
  }
}
main().catch(()=>{console.error('Local rehearsal failed. Connection details were not logged.');process.exitCode=1;});
