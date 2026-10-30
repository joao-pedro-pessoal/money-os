import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connectionSettings, createServiceBackup, postgresCommand, restoreServiceBackup, verifyServiceBackup } from "../../../scripts/backup/service";
const guards=vi.hoisted(()=>({spawn:vi.fn(()=>{throw new Error("unexpected subprocess");}),client:vi.fn(()=>{throw new Error("unexpected database");})}));
vi.mock("node:child_process",()=>({spawn:guards.spawn}));
vi.mock("pg",()=>({Client:guards.client}));

const secret="Synthetic offline backup passphrase 2026";
let directory:string,file:string;
beforeEach(async()=>{vi.clearAllMocks();directory=await mkdtemp(join(tmpdir(),"moneyos-backup-test-"));file=join(directory,"synthetic.enc");});
afterEach(async()=>{expect(directory.startsWith(join(tmpdir(),"moneyos-backup-test-"))).toBe(true);await rm(directory,{recursive:true,force:true});});
async function fixture(payload=Buffer.from("PGDMPsynthetic archive bytes")) {
  const salt=randomBytes(16),iv=randomBytes(12),header=Buffer.concat([Buffer.from("MONEYOS-BACKUP-1\n"),salt,iv]);
  const cipher=createCipheriv("aes-256-gcm",scryptSync(secret,salt,32),iv);cipher.setAAD(header);
  const bytes=Buffer.concat([header,cipher.update(payload),cipher.final(),cipher.getAuthTag()]);
  await writeFile(file,bytes);await checksum();
}
async function checksum(){const bytes=await readFile(file);await writeFile(file+".sha256",createHash("sha256").update(bytes).digest("hex")+"\n");}

describe("C7 service backup boundaries and integrity",()=>{
  it.each([undefined,"not a url","https://example.test/db","postgresql://admin@127.0.0.1/db?password=secret"])("refuses malformed connection configuration without echoing it",value=>{
    expect(()=>connectionSettings(value)).toThrow();
  });
  it.each(["localhost","127.0.0.1","[::1]"])("accepts explicit local host %s",host=>{
    expect(connectionSettings(`postgresql://admin:synthetic@${host}:54339/moneyos_c7`).local).toBe(true);
  });
  it("blocks a remote source and every remote restore before a subprocess or database",async()=>{
    const remote="postgresql://private-user:do-not-print@example.test/production";
    await expect(createServiceBackup(file,{DATABASE_ADMIN_URL:remote,BACKUP_PASSPHRASE:secret})).rejects.toThrow("Remote database access is disabled");
    await expect(restoreServiceBackup(file,{DATABASE_RESTORE_URL:remote,BACKUP_PASSPHRASE:secret})).rejects.toThrow("Remote database access is disabled");
    expect(guards.spawn).not.toHaveBeenCalled();expect(guards.client).not.toHaveBeenCalled();
  });
  it("requires the explicit source opt-in and rejects a pooled endpoint",()=>{
    expect(connectionSettings("postgresql://admin:synthetic@example.test/database",true).local).toBe(false);
    expect(()=>connectionSettings("postgresql://admin:synthetic@example-pooler.test/database",true)).toThrow("pooled endpoint");
  });
  it("puts credentials in the child environment, never argv, and strips unrelated app secrets",()=>{
    const variables=connectionSettings("postgresql://admin:synthetic-password@127.0.0.1:54339/moneyos_c7?sslmode=disable").variables;
    const command=postgresCommand("pg_dump",["--format=custom"],{PATH:process.env.PATH,DATABASE_ADMIN_URL:"private-url",APP_SECRET:"private-app",ENCRYPTION_KEY:"private-key",BACKUP_PASSPHRASE:secret,PGSERVICE:"old-service",PGHOST:"old-host"},variables);
    expect(command.args.join(" ")).not.toMatch(/synthetic-password|private/);expect(command.env.PGPASSWORD).toBe("synthetic-password");
    for(const key of ["APP_SECRET","ENCRYPTION_KEY","DATABASE_ADMIN_URL","BACKUP_PASSPHRASE","PGSERVICE"])expect(command.env[key]).toBeUndefined();
    expect(command.env.PGHOST).toBe("127.0.0.1");
  });
  it("forwards only the required PG environment to optional WSL clients",()=>{
    const command=postgresCommand("pg_restore",["--list"],{PG_TOOLS_WSL_DISTRO:"Ubuntu",PG_TOOLS_DIR:"/synthetic/bin",WSLENV:"APP_SECRET",APP_SECRET:"private"},{PGPASSWORD:"synthetic"});
    expect(command.args).toEqual(["--distribution","Ubuntu","--exec","/synthetic/bin/pg_restore","--list"]);
    expect(command.env.WSLENV).toBe("PGPASSWORD");expect(command.env.APP_SECRET).toBeUndefined();
  });
  it("verifies an authenticated archive without a database or PostgreSQL subprocess",async()=>{
    await fixture();const result=await verifyServiceBackup(file,{BACKUP_PASSPHRASE:secret});
    expect(result.archiveBytes).toBe(Buffer.byteLength("PGDMPsynthetic archive bytes"));expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(guards.spawn).not.toHaveBeenCalled();expect(guards.client).not.toHaveBeenCalled();
  });
  it("refuses a wrong key without leaking it",async()=>{
    await fixture();await expect(verifyServiceBackup(file,{BACKUP_PASSPHRASE:"A different synthetic passphrase 2026"})).rejects.toThrow("integrity or passphrase");
  });
  it("detects ciphertext corruption even if someone recomputes the public checksum",async()=>{
    await fixture();const bytes=await readFile(file);bytes[50]^=1;await writeFile(file,bytes);await checksum();
    await expect(restoreServiceBackup(file,{DATABASE_RESTORE_URL:"postgresql://admin:synthetic@127.0.0.1:54339/moneyos_c7",BACKUP_PASSPHRASE:secret})).rejects.toThrow("integrity or passphrase");
    expect(guards.spawn).not.toHaveBeenCalled();expect(guards.client).not.toHaveBeenCalled();
  });
  it("requires the checksum and the custom PostgreSQL archive signature",async()=>{
    await fixture();await rm(file+".sha256");await expect(verifyServiceBackup(file,{BACKUP_PASSPHRASE:secret})).rejects.toThrow("integrity");
    await fixture(Buffer.from("Not a PostgreSQL custom archive"));await expect(verifyServiceBackup(file,{BACKUP_PASSPHRASE:secret})).rejects.toThrow("integrity");
  });
  it("refuses an absent or short passphrase before starting any database tool",async()=>{
    for(const value of [undefined,"too short"])await expect(createServiceBackup(file,{DATABASE_ADMIN_URL:"postgresql://admin:synthetic@127.0.0.1/db",BACKUP_PASSPHRASE:value})).rejects.toThrow("20 characters");
    expect(guards.spawn).not.toHaveBeenCalled();
  });
});
