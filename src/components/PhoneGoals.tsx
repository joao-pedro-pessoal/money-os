import Link from "next/link";
import { Money } from "./PrivacyContext";
import PhoneIcon from "./PhoneIcon";
import type { TextTranslator } from "@/lib/i18n/text";

/**
 * Goals on a phone (F30): each one says how far it is and what is still
 * missing, instead of what share it holds of all the money set aside. A goal
 * has no date in the app, so there is no monthly amount to suggest; adding
 * money and the priority list stay in the sections below.
 */
export default function PhoneGoals({ uiText, currency, goals }: {
  uiText: TextTranslator;
  currency: string;
  goals: { id: string; name: string; total: number; targetAmount: string | null; unconverted: unknown[] }[];
}) {
  const saved = goals.reduce((sum, goal) => sum + goal.total, 0);
  return (
    <div className="ph-goals">
      {goals.length > 0 && <p className="ph-sub"><Money value={saved} currency={currency} />{uiText(" already set aside")}</p>}
      <a href="#create-bucket" className="ph-new-goal">
        <span><small>{uiText("What are you saving for?")}</small><strong>{uiText("New goal")}</strong></span>
        <span className="ph-new-goal-plus"><PhoneIcon name="plus" size={20} strokeWidth={2.4} /></span>
      </a>
      <ul className="ph-goal-list">
        {goals.map(goal => {
          const target = goal.targetAmount === null ? null : Number(goal.targetAmount);
          const percent = target && target > 0 ? Math.min(100, Math.round((goal.total / target) * 100)) : null;
          const missing = target === null ? null : Math.max(0, Math.round((target - goal.total) * 100) / 100);
          return (
            <li key={goal.id} className="ph-card ph-goal">
              <div className="ph-goal-top">
                <span className="ph-icon-box"><PhoneIcon name="target" size={19} /></span>
                <span className="ph-row-text">
                  <span translate="no" className="ph-row-title">{goal.name}</span>
                  <span className="ph-row-sub"><strong className="ph-strong"><Money value={goal.total} currency={currency} /></strong>{target !== null && <>{uiText(" of ")}<Money value={target} currency={currency} /></>}</span>
                </span>
                <Link href={`/buckets/${goal.id}`} className="ph-pill">{uiText("Open")}</Link>
              </div>
              {percent !== null && <span className="ph-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} data-tone={percent >= 100 ? "done" : "ok"} /></span>}
              <div className="ph-goal-foot">
                {percent === null ? <span>{uiText("No target")}</span> : <>
                  <span className="ph-accent-text">{percent}%</span>
                  <span>{missing === 0 ? uiText("Goal reached") : <><Money value={missing ?? 0} currency={currency} />{uiText(" to go")}</>}</span>
                </>}
              </div>
              {goal.unconverted.length > 0 && <p className="ph-sub ph-warn-text">{uiText("Incomplete total — missing exchange rates.")}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
