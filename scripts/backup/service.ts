/** Operational tools only. Never imports the app client or loads dotenv. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createWriteStream } from "node:fs";
import { appendFile, link, open, readFile, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { join, posix } from "node:path";
import { spawn } from "node:child_process";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Client } from "pg";

type Environment = Record<string,string|undefined>;
const MAGIC = Buffer.from("MONEYOS-BACKUP-1\n");
const HEADER_SIZE = MAGIC.length + 16 + 12;
const TAG_SIZE = 16;
export class BackupError extends Error {}

export function connectionSettings(value: string | undefined, allowRemote = false) {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new BackupError("A PostgreSQL connection URL is required in the environment."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.hostname || url.hash) throw new BackupError("Invalid PostgreSQL connection configuration.");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!local && !allowRemote) throw new BackupError("Remote database access is disabled. No connection was made.");
  if (url.hostname.includes("-pooler.")) throw new BackupError("Use the direct admin connection, not the pooled endpoint.");
  let database: string, user: string, password: string;
  try { database=decodeURIComponent(url.pathname.slice(1));user=decodeURIComponent(url.username);password=decodeURIComponent(url.password); }
  catch { throw new BackupError("Invalid PostgreSQL connection configuration."); }
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/.test(database)) throw new BackupError("The database name must be a simple PostgreSQL database name.");
  const variables: Environment = { PGHOST: url.hostname.replace(/^\[|\]$/g,""), PGPORT: url.port || "5432", PGDATABASE: database, PGUSER: user, PGPASSWORD: password, PGCONNECT_TIMEOUT: "10", PGAPPNAME: "moneyos-service-backup" };
  const options: Record<string,string> = { sslmode:"PGSSLMODE",sslrootcert:"PGSSLROOTCERT",sslcert:"PGSSLCERT",sslkey:"PGSSLKEY",channel_binding:"PGCHANNELBINDING" };
  for (const [key,setting] of url.searchParams) {
    if (!Object.hasOwn(options,key)) throw new BackupError("Unsupported PostgreSQL URL option. Use a direct connection URL.");
    variables[options[key]]=setting;
  }
  return { variables, database, local };
}

function passphrase(environment: Environment) {
  const value=environment.BACKUP_PASSPHRASE;
  if (!value || value.trim().length<20) throw new BackupError("BACKUP_PASSPHRASE must contain at least 20 characters.");
  return value;
}
function sink(onChunk: (chunk: Buffer)=>void = ()=>{}) {
  return new Writable({write(chunk:Buffer,_encoding,done){try{onChunk(chunk);done();}catch(error){done(error as Error);}}});
}
async function removeOwnPartial(path: string) { await unlink(path).catch(()=>{}); }

export function postgresCommand(tool: "pg_dump"|"pg_restore", args: string[], environment: Environment, variables: Environment = {}) {
  const childEnv={...environment};
  for (const key of Object.keys(childEnv)) if (/^PG/.test(key) || ["DATABASE_URL","DATABASE_ADMIN_URL","DATABASE_RESTORE_URL","BACKUP_PASSPHRASE","APP_SECRET","ENCRYPTION_KEY"].includes(key)) delete childEnv[key];
  Object.assign(childEnv,variables);
  const distro=environment.PG_TOOLS_WSL_DISTRO;
  const directory=environment.PG_TOOLS_DIR;
  if (distro && !/^[A-Za-z0-9_.-]+$/.test(distro)) throw new BackupError("Invalid local WSL distribution name.");
  const executable=directory ? distro?posix.join(directory,tool):join(directory,tool+(process.platform==="win32"?".exe":"")) : tool;
  if (distro) {
    if (environment.PG_TOOLS_LIB_DIR) childEnv.LD_LIBRARY_PATH=environment.PG_TOOLS_LIB_DIR;
    childEnv.WSLENV=[...Object.keys(variables),...(childEnv.LD_LIBRARY_PATH?["LD_LIBRARY_PATH"]:[])].join(":");
  }
  return { executable:distro?"wsl.exe":executable, args:distro?["--distribution",distro,"--exec",executable,...args]:args, env:childEnv };
}
function startTool(tool:"pg_dump"|"pg_restore",args:string[],environment:Environment,variables:Environment={}) {
  const command=postgresCommand(tool,args,environment,variables);
  const child=spawn(command.executable,command.args,{env:{NODE_ENV:"production",...command.env},windowsHide:true,stdio:["pipe","pipe","pipe"],shell:false});
  let stderrBytes=0;
  child.stderr.on("data",(chunk:Buffer)=>{stderrBytes+=chunk.length;});
  const done=new Promise<void>((resolve,reject)=>{
    child.once("error",()=>reject(new BackupError("Could not start PostgreSQL tools. Check the configured client installation.")));
    child.once("close",code=>code===0&&stderrBytes===0?resolve():reject(new BackupError("PostgreSQL tool reported an error or warning. Check client version, connection and privileges; details were not logged.")));
  });
  // Attach immediately: a spawn failure must not become an unhandled rejection.
  void done.catch(()=>{});
  return {child,done};
}

async function verifiedArchive(path:string,environment:Environment) {
  const secret=passphrase(environment);
  let file:FileHandle|undefined;
  try {
    const checksum=await readFile(path+".sha256","utf8");
    if (!/^[a-f0-9]{64}\n?$/.test(checksum)) throw new Error("checksum");
    file=await open(path,"r");const size=(await file.stat()).size;
    if (size<HEADER_SIZE+TAG_SIZE+5) throw new Error("size");
    const hash=createHash("sha256");await pipeline(file.createReadStream({start:0,end:size-1,autoClose:false}),sink(chunk=>{hash.update(chunk);}));
    if (hash.digest("hex")!==checksum.trim()) throw new Error("checksum");
    const header=Buffer.alloc(HEADER_SIZE),tag=Buffer.alloc(TAG_SIZE);
    await file.read(header,0,HEADER_SIZE,0);await file.read(tag,0,TAG_SIZE,size-TAG_SIZE);
    if (!header.subarray(0,MAGIC.length).equals(MAGIC)) throw new Error("version");
    const salt=header.subarray(MAGIC.length,MAGIC.length+16),iv=header.subarray(MAGIC.length+16);
    const key=scryptSync(secret,salt,32);
    const decrypt=()=>{const decipher=createDecipheriv("aes-256-gcm",key,iv);decipher.setAAD(header);decipher.setAuthTag(tag);return decipher;};
    const source=()=>file!.createReadStream({start:HEADER_SIZE,end:size-TAG_SIZE-1,autoClose:false});
    let signature=Buffer.alloc(0),plainBytes=0;
    await pipeline(source(),decrypt(),sink(chunk=>{plainBytes+=chunk.length;if(signature.length<5)signature=Buffer.concat([signature,chunk]).subarray(0,5);}));
    if (signature.toString("ascii")!=="PGDMP") throw new Error("format");
    const checked=file;
    return {source,decrypt,close:()=>checked.close(),size,plainBytes,sha256:checksum.trim()};
  } catch(error) {
    await file?.close();
    if (error instanceof BackupError) throw error;
    throw new BackupError("Backup integrity or passphrase verification failed. No database was changed.");
  }
}

export async function createServiceBackup(path:string,environment:Environment=process.env,allowRemote=false) {
  const {variables}=connectionSettings(environment.DATABASE_ADMIN_URL,allowRemote);
  const secret=passphrase(environment);
  const temporary=path+".partial-"+randomBytes(8).toString("hex");
  let published=false,checksumPublished=false;
  try {
    const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([MAGIC,salt,iv]);
    await writeFile(temporary,header,{flag:"wx",mode:0o600});
    const cipher=createCipheriv("aes-256-gcm",scryptSync(secret,salt,32),iv);cipher.setAAD(header);
    const {child,done}=startTool("pg_dump",["--format=custom","--no-owner","--no-acl","--no-password","--lock-wait-timeout=10s"],environment,variables);
    child.stdin.end();
    const writing=pipeline(child.stdout,cipher,createWriteStream(temporary,{flags:"a",mode:0o600}));
    try {await Promise.all([writing,done]);}
    catch {child.kill();await Promise.allSettled([writing,done]);throw new BackupError("Backup was not completed. Check PostgreSQL tools, direct admin privileges and connectivity.");}
    await appendFile(temporary,cipher.getAuthTag());
    const file=await open(temporary,"r");const hash=createHash("sha256");
    try {await pipeline(file.createReadStream({autoClose:false}),sink(chunk=>{hash.update(chunk);}));}finally{await file.close();}
    const checksum=hash.digest("hex");
    await link(temporary,path);published=true;
    await writeFile(path+".sha256",checksum+"\n",{flag:"wx",mode:0o600});checksumPublished=true;
    await removeOwnPartial(temporary);
    return await verifyServiceBackup(path,environment);
  } catch(error) {
    await removeOwnPartial(temporary);
    if(published)await removeOwnPartial(path);
    if(checksumPublished)await removeOwnPartial(path+".sha256");
    if(error instanceof BackupError)throw error;
    throw new BackupError("Could not create the backup files. Use a new filename in an existing private directory.");
  }
}

export async function verifyServiceBackup(path:string,environment:Environment=process.env) {
  const archive=await verifiedArchive(path,environment);
  try {return {format:"moneyos-service-backup-v1",encryptedBytes:archive.size,archiveBytes:archive.plainBytes,sha256:archive.sha256};}
  finally{await archive.close();}
}

export async function restoreServiceBackup(path:string,environment:Environment=process.env) {
  // Restore is deliberately local-only, even if a remote source was allowed for creation.
  const {variables,database}=connectionSettings(environment.DATABASE_RESTORE_URL);
  const archive=await verifiedArchive(path,environment);
  try {
    const listing=startTool("pg_restore",["--list"],environment);
    try {await Promise.all([pipeline(archive.source(),archive.decrypt(),listing.child.stdin),pipeline(listing.child.stdout,sink()),listing.done]);}
    catch {listing.child.kill();await listing.done.catch(()=>{});throw new BackupError("The verified file is not a readable PostgreSQL archive. No database was changed.");}
    const check=new Client({connectionString:environment.DATABASE_RESTORE_URL,connectionTimeoutMillis:10_000});
    try {
      await check.connect();
      const result=await check.query<{empty:boolean}>(`SELECT NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
        UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
        UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
        UNION ALL SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema') AND nspname !~ '^pg_'
      ) AS empty`);
      if(!result.rows[0]?.empty)throw new BackupError("Restore target is not empty. Nothing was overwritten.");
    }catch(error){if(error instanceof BackupError)throw error;throw new BackupError("Could not check the local restore target. No restore was started.");}
    finally{await check.end();}
    const restore=startTool("pg_restore",["--dbname="+database,"--single-transaction","--exit-on-error","--no-owner","--no-acl","--no-password"],environment,variables);
    try {await Promise.all([pipeline(archive.source(),archive.decrypt(),restore.child.stdin),pipeline(restore.child.stdout,sink()),restore.done]);}
    catch {restore.child.kill();await restore.done.catch(()=>{});throw new BackupError("Restore failed. The single restore transaction was rolled back; inspect the local target before retrying.");}
    return {restored:true,format:"moneyos-service-backup-v1"};
  } finally{await archive.close();}
}
