import PageTabs from "@/components/PageTabs";
import { INVESTMENT_TABS } from "@/lib/navigation";

/**
 * One sidebar entry, six screens. Holdings, analysis, playlists, watchlist,
 * open positions and connections are all "the investing side" — listing each
 * separately is what made the sidebar unreadable.
 */
export default function InvestmentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageTabs tabs={INVESTMENT_TABS} />
      {children}
    </div>
  );
}
