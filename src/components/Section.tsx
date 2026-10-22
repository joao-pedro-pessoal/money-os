import PanelFrame from './PanelFrame';

export default function Section({ title, summary, defaultOpen = false, essential = false, children, persistKey, className, contentClassName, preferenceVersion }: {
  title: string; summary?: React.ReactNode; defaultOpen?: boolean;
  /** Open on a phone too; see PanelFrame. */
  essential?: boolean; children: React.ReactNode;
  persistKey?: string; className?: string; preferenceVersion?: string;
  /** Spacing between the children goes here, not in `className` — see PanelFrame. */
  contentClassName?: string;
}) {
  return <PanelFrame title={title} summary={summary} defaultOpen={defaultOpen} essential={essential} preferenceVersion={preferenceVersion}
    persistKey={persistKey ?? title} className={`card p-4 ${className ?? ''}`}>
    <div className={`pt-3 ${contentClassName ?? ''}`}>{children}</div>
  </PanelFrame>;
}
