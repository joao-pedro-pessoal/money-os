import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { balanceChoices, balanceDirection } from "@/lib/money/balanceChoices";
import AccountBalanceFields from "../AccountBalanceFields";
vi.mock("@/components/useText", () => ({ useText: () => (source: string) => source }));

describe("C6 shared balance choices", () => {
  it.each([
    [1000,"1000","same"],[1000,"1000,00","same"],[1000,"1000.01","up"],[1000,"999,99","down"],
    [0,"0","same"],[0,"-0.01","down"],[-100,"-50","up"],[-100,"-150","down"],
    [1000,"","same"],[1000,"-","same"],[1000,"1,000.50","same"],[1000,"1e3","same"],
    [1000,"12.345","same"],[1000," 1000.01 ","up"],
  ] as const)("reads %s → %s as %s using the manual parser",(balance,typed,direction)=>{
    expect(balanceDirection(balance,typed)).toBe(direction);
  });
  it("only offers money in on a rise and money out on a fall",()=>{
    expect(balanceChoices("up").map(choice=>choice.value)).toEqual(["correction","income","interest","deposit"]);
    expect(balanceChoices("down").map(choice=>choice.value)).toEqual(["correction","expense","withdrawal"]);
    expect(balanceChoices("same")).toHaveLength(6);
  });
  it.each(["1001","999"])("renders the same safe fields for balance %s",value=>{
    const html=renderToStaticMarkup(<AccountBalanceFields account={{id:"synthetic",balance:1000,currency:"USD"}} value={value} onChange={()=>{}}/>);
    expect(html).toContain('name="accountId" value="synthetic"');expect(html).toContain('(USD)');expect(html).toContain('value="correction" selected=""');
    expect(html).toContain(value==="1001"?'value="income"':'value="expense"');
    expect(html).not.toContain(value==="1001"?'value="expense"':'value="income"');
  });
});
