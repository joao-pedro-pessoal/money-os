import { BackupError, createServiceBackup, restoreServiceBackup, verifyServiceBackup } from "./backup/service";

const help=`Money OS service backup (no dotenv loading, no default connection).
  tsx scripts/service-backup.ts create --file <new-file> [--allow-remote-source]
  tsx scripts/service-backup.ts verify --file <file>
  tsx scripts/service-backup.ts restore-local --file <file>
Environment: DATABASE_ADMIN_URL (create), DATABASE_RESTORE_URL (local restore),
BACKUP_PASSPHRASE (20+ characters); PG_TOOLS_DIR optionally selects PostgreSQL clients.
See docs/COPIA_SEGURANCA_SERVICO.md. No schedule or remote destination is configured.`;

export async function main(args:string[]=process.argv.slice(2)) {
  const [command,...rest]=args;
  if(!command||command==="--help"||command==="help"){console.log(help);return;}
  const allowed=new Set(["create","verify","restore-local"]);
  if(!allowed.has(command))throw new BackupError("Unknown command. Use --help.");
  let file:string|undefined,remote=false;
  for(let i=0;i<rest.length;i++) {
    if(rest[i]==="--file"&&!file&&rest[i+1]&&!rest[i+1].startsWith("--")){file=rest[++i];continue;}
    if(rest[i]==="--allow-remote-source"&&command==="create"&&!remote){remote=true;continue;}
    throw new BackupError("Unknown or repeated option. Use --help.");
  }
  if(!file)throw new BackupError("Choose an explicit backup file with --file.");
  const result=command==="create"?await createServiceBackup(file,process.env,remote):command==="verify"?await verifyServiceBackup(file):await restoreServiceBackup(file);
  console.log(JSON.stringify(result));
}

main().catch(error=>{
  console.error(error instanceof BackupError?error.message:"Backup operation failed. No connection details were logged.");process.exitCode=1;
});
