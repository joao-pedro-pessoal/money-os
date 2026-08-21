import SettingsTabs from "@/components/SettingsTabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-lg font-semibold">Settings</h1>
      <SettingsTabs />
      <div className="space-y-6">{children}</div>
    </div>
  );
}
