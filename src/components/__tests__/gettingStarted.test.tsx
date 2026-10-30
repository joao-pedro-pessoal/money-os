import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { gettingStartedProgress } from "@/lib/ui/gettingStarted";
import GetStarted from "../GetStarted";
vi.mock("@/components/useText",()=>({useText:()=> (text:string)=>text}));

const combinations=[0,1].flatMap(accounts=>[0,1].flatMap(transactions=>[0,1].flatMap(budgets=>[0,1].map(goals=>({accounts,transactions,budgets,goals})))));
describe("C3 getting started from owned records",()=>{
  it.each(combinations)("derives progress from $accounts accounts, $transactions movements, $budgets budgets and $goals goals",counts=>{
    const value=gettingStartedProgress(Object.freeze(counts));
    expect(value.account).toBe(counts.accounts>0);expect(value.transaction).toBe(counts.transactions>0);
    expect(value.plan).toBe(counts.budgets>0||counts.goals>0);
    expect(value.complete).toBe(Boolean(counts.accounts&&counts.transactions&&(counts.budgets||counts.goals)));
  });
  it("does not infer a real movement from a goal, budget or forecast",()=>{
    expect(gettingStartedProgress({accounts:1,transactions:0,budgets:2,goals:3})).toEqual({account:true,transaction:false,plan:true,complete:false});
  });
  it("shows all three steps to an empty account and disables entry until an active account exists",()=>{
    const html=renderToStaticMarkup(<GetStarted userId="synthetic" counts={{accounts:0,transactions:0,budgets:0,goals:0}} canRecord={false}/>);
    expect(html).toContain('data-get-started');expect(html.match(/data-setup-step=/g)).toHaveLength(3);expect(html).toContain('disabled=""');
    expect(html).toContain("Record your first transaction");expect(html).toContain("Create a budget");expect(html).toContain("Create a goal");
  });
  it("marks existing steps and offers entry for an active account",()=>{
    const html=renderToStaticMarkup(<GetStarted userId="synthetic" counts={{accounts:1,transactions:1,budgets:0,goals:0}} canRecord/>);
    expect(html.match(/data-complete="true"/g)).toHaveLength(2);expect(html).not.toContain('disabled=""');
  });
  it("draws nothing after all three steps are complete",()=>{
    expect(renderToStaticMarkup(<GetStarted userId="synthetic" counts={{accounts:1,transactions:1,budgets:0,goals:1}} canRecord/>)).toBe("");
  });
});
