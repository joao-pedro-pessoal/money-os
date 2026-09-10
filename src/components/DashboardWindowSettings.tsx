import { DASHBOARD_WINDOWS, type DashboardWindowPreferences } from "@/lib/dashboard/windows";
import { setDashboardWindowPreferences } from "@/actions/settings";

export default function DashboardWindowSettings({ preferences }: { preferences: DashboardWindowPreferences }) {
  return (
    <SettingBlock>
      <form action={setDashboardWindowPreferences} className="space-y-3">
        {DASHBOARD_WINDOWS.map((window) => (
          <label key={window.id} className="flex items-center justify-between gap-3 text-xs">
            <span>{window.label}</span>
            <select name={`dashboardWindow_${window.id}`} className="input w-auto" defaultValue={preferences[window.id]}>
              <option value="visible">Show open</option>
              <option value="minimized">Show minimized</option>
              <option value="hidden">Hide</option>
            </select>
          </label>
        ))}
        <button type="submit" className="btn">Save dashboard</button>
      </form>
    </SettingBlock>
  );
}

function SettingBlock({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 max-w-xl">{children}</div>;
}
