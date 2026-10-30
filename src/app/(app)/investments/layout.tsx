import { currentInvestments } from "@/actions/releaseEdition";
import PageTabs from "@/components/PageTabs";
import { investmentTabs } from "@/lib/navigation";

/**
 * One sidebar entry, six screens. Holdings, analysis, playlists, watchlist,
 * open positions and connections are all "the investing side" — listing each
 * separately is what made the sidebar unreadable.
 */
export default async function InvestmentsLayout({ children }: { children: React.ReactNode }) {
  const investmentsEnabled = await currentInvestments();
  return (
    <div className="space-y-6">
      <PageTabs tabs={investmentTabs(investmentsEnabled)} />
      {children}
    </div>
  );
}
