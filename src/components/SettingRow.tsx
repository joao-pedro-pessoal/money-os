/**
 * One setting: what it is on the left, the control on the right.
 *
 * The old page put the explanation *under* every control, so you read the
 * label, changed the thing, then discovered what it meant. Label and
 * explanation belong together, before the control.
 */
export default function SettingRow({
  title,
  description,
  children,
  stacked = false,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** For controls too wide to sit beside the text, like a table. */
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="p-4 border-b border-[var(--border)] last:border-b-0">
        <div className="text-sm font-medium">{title}</div>
        {description && <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">{description}</p>}
        <div className="mt-3">{children}</div>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-[var(--border)] last:border-b-0 flex items-start justify-between gap-6 flex-wrap">
      <div className="min-w-0 basis-full sm:basis-56 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description && <p className="text-xs text-[var(--muted)] mt-1">{description}</p>}
      </div>
      <div className="min-w-0 max-w-full w-full sm:w-auto">{children}</div>
    </div>
  );
}
