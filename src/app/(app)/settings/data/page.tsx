import { textForRequest } from "@/actions/pageLanguage";
import BackupPanel from "@/components/BackupPanel";
import SettingRow from "@/components/SettingRow";
import { transferLimits } from "@/actions/transferConfig";
import Link from "next/link";

export default async function SettingsDataPage() {
  const uiText = await textForRequest();
  const limits = transferLimits();
  return (
    <>
      <div className="card">
        <SettingRow
          title={uiText("Backup and restore")}
          description={uiText("You should never be locked into this app to reach your own data. The export is plain JSON and CSV — readable in a spreadsheet, restorable here.")}
          stacked
        >
          <BackupPanel maxBytes={limits.backupBytes} maxRows={limits.backupRows} />
        </SettingRow>
      </div>

      <Link href="/import" className="card p-4 block hover:opacity-90 transition-opacity">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">{uiText("Import a bank statement")}</div>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-xl">{uiText("Bring transactions in from a CSV, with a preview of every row and an undo afterwards.")}</p>
          </div>
          <span className="text-[var(--accent)] text-sm whitespace-nowrap">{uiText("Open →")}</span>
        </div>
      </Link>
    </>
  );
}
