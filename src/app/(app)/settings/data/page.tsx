import BackupPanel from "@/components/BackupPanel";
import SettingRow from "@/components/SettingRow";
import { restoreBackup } from "@/actions/export";
import Link from "next/link";

async function restoreBackupAction(formData: FormData) {
  "use server";
  await restoreBackup(formData);
}

export default async function SettingsDataPage() {
  return (
    <>
      <div className="card">
        <SettingRow
          title="Backup and restore"
          description="You should never be locked into this app to reach your own data. The export is plain JSON and CSV — readable in a spreadsheet, restorable here."
          stacked
        >
          <BackupPanel restoreAction={restoreBackupAction} />
        </SettingRow>
      </div>

      <Link href="/import" className="card p-4 block hover:opacity-90 transition-opacity">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Import a bank statement</div>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">
              Bring transactions in from a CSV, with a preview of every row and an undo afterwards.
            </p>
          </div>
          <span className="text-[var(--accent)] text-sm whitespace-nowrap">Open →</span>
        </div>
      </Link>
    </>
  );
}
