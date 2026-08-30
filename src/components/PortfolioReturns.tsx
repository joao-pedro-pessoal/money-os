import { asPercent } from "@/lib/portfolio/returns";
import { fmt } from "@/lib/format";
import type { TwrResult, ReturnCoverage } from "@/lib/portfolio/returns";

/**
 * The two measures that answer "how is the investing going".
 *
 * Profit against cost, which is what the app showed before, stops being a
 * return the moment money moves in or out: deposit 500 € and the portfolio is
 * larger without anything having performed.
 *
 * Both figures are shown side by side and neither is called "the" return,
 * because they answer different questions and disagreeing is the normal case.
 * When they diverge, the gap is the story: it is what your timing did.
 */

function Figure({
  label,
  question,
  value,
  suffix,
  withheld,
  note,
}: {
  label: string;
  question: string;
  value: number | null;
  suffix?: string;
  withheld: string | null;
  note?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-sm font-medium">{label}</div>
      <div className="text-[10px] text-[var(--muted)] mb-3">{question}</div>

      {withheld ? (
        <>
          {/*
            A missing figure is stated as missing, with the reason. Showing a
            dash alone reads as zero, and zero is a measurement.
          */}
          <div className="text-lg font-semibold text-[var(--muted)]">Not measurable yet</div>
          <p className="text-[11px] text-[var(--muted)] mt-2">{withheld}</p>
        </>
      ) : (
        <>
          <div
            className="text-2xl font-semibold"
            style={{ color: (value ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}
          >
            {value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`}
            {suffix && <span className="text-xs font-normal text-[var(--muted)] ml-1">{suffix}</span>}
          </div>
          {note && <p className="text-[11px] text-[var(--muted)] mt-2">{note}</p>}
        </>
      )}
    </div>
  );
}

export default function PortfolioReturns({
  timeWeighted,
  moneyWeighted,
  withheld,
  coverage,
  netContributed,
  currentValue,
  currency,
}: {
  timeWeighted: TwrResult | null;
  moneyWeighted: number | null;
  withheld: { timeWeighted: string | null; moneyWeighted: string | null };
  coverage: ReturnCoverage;
  netContributed: number;
  currentValue: number;
  currency: string;
}) {
  const twrPercent = timeWeighted ? asPercent(timeWeighted.totalReturn) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Figure
          label="Time-weighted return"
          question="Were the choices good? Deposits and withdrawals are taken out."
          value={twrPercent}
          withheld={withheld.timeWeighted}
          note={
            timeWeighted
              ? `Measured ${timeWeighted.from} to ${timeWeighted.to}${
                  timeWeighted.annualised !== null
                    ? `, ${asPercent(timeWeighted.annualised)}% a year`
                    : ". Too short a window to annualise — three good weeks would read as several hundred percent a year."
                }`
              : undefined
          }
        />

        <Figure
          label="Money-weighted return"
          question="How did the money actually do? Timing of deposits included."
          value={asPercent(moneyWeighted)}
          suffix="a year"
          withheld={withheld.moneyWeighted}
          note={
            moneyWeighted !== null
              ? `Against ${fmt(netContributed, currency)} put in and ${fmt(
                  currentValue,
                  currency
                )} held. This is the figure a spreadsheet's XIRR gives.`
              : undefined
          }
        />
      </div>

      {/*
        The gap between the value history and the flow history is a real fact
        about this account, not an error. Stating it is what stops someone
        reading a three-week window as a lifetime record.
      */}
      {coverage.flowsBeforeHistory > 0 && coverage.historyStarts && (
        <p className="text-[11px] text-[var(--muted)]">
          {coverage.flowsBeforeHistory} deposit
          {coverage.flowsBeforeHistory === 1 ? "" : "s"} or withdrawal
          {coverage.flowsBeforeHistory === 1 ? "" : "s"} happened before{" "}
          {coverage.historyStarts}, which is as far back as the portfolio&apos;s value is
          recorded. Anything earlier than that is genuinely unmeasured rather than
          zero.
        </p>
      )}
    </div>
  );
}
