import { DASHBOARD_WINDOWS, type DashboardWindowPreferences } from "@/lib/dashboard/windows";
import { setDashboardWindowPreferences } from "@/actions/settings";
import { words } from "@/actions/language";

export default async function DashboardWindowSettings({ preferences }: { preferences: DashboardWindowPreferences }) {
  const w = (await words()).settings;
  return (
    <SettingBlock>
      <form action={setDashboardWindowPreferences} className="space-y-3">
        {DASHBOARD_WINDOWS.map((window) => (
          <label key={window.id} className="flex items-center justify-between gap-3 text-xs">
            <span>{w.windows[window.id] ?? window.label}</span>
            <select name={`dashboardWindow_${window.id}`} className="input w-auto" defaultValue={preferences[window.id]}>
              <option value="visible">{w.windowShowOpen}</option>
              <option value="minimized">{w.windowShowMinimized}</option>
              <option value="hidden">{w.windowHide}</option>
            </select>
          </label>
        ))}
        <button type="submit" className="btn">{w.saveDashboard}</button>
      </form>
    </SettingBlock>
  );
}

function SettingBlock({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 max-w-xl">{children}</div>;
}
