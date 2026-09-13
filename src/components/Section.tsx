import PanelFrame from './PanelFrame';

export default function Section({ title, summary, defaultOpen = false, essential = false, children, persistKey, className }: {
  title: string; summary?: React.ReactNode; defaultOpen?: boolean;
  /** Open on a phone too; see PanelFrame. */
  essential?: boolean; children: React.ReactNode;
  persistKey?: string; className?: string;
}) {
  return <PanelFrame title={title} summary={summary} defaultOpen={defaultOpen} essential={essential}
    persistKey={persistKey ?? title} className={`card p-4 ${className ?? ''}`}>
    <div className="pt-3">{children}</div>
  </PanelFrame>;
}
