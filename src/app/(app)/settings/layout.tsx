import SettingsTabs from "@/components/SettingsTabs";
import { currentLanguage, words } from "@/actions/language";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const language = await currentLanguage();
  const w = (await words()).settings;
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 translate="no" lang={language} className="text-lg font-semibold">{w.title}</h1>
      <SettingsTabs />
      <div className="space-y-6">{children}</div>
    </div>
  );
}
