import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { transactionDescription, transactionTypeLabel, subscriptionCountText } from "../systemText";
import { translateText, type TextTranslator } from "../text";
import pt from "../full/pt.json";
import { LanguageProvider } from "@/components/LanguageContext";
import TransactionList from "@/components/TransactionList";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/transactions" }));
const t: TextTranslator = (source,values) => translateText(pt,source,values);

describe("C5 system copy, separate from personal records", () => {
  it.each(["Expense", "Income", "Deposit", "Withdrawal", "Interest"])("translates the exact %s reconciliation description without changing the record", type => {
    const source=`${type} (reconciliation)`;
    const record=Object.freeze({description:source});
    expect(transactionDescription(source,t)).not.toBe(source);
    expect(transactionDescription(source)).toBe(source);
    expect(record.description).toBe(source);
  });
  it.each(["Expense", "Expense (reconciliation) from my bank", " Expense (reconciliation)", "expense (reconciliation)", "My Income", "Interest (reconciliation) ", "__proto__"])("preserves personal text %s verbatim", source => {
    const translate=vi.fn(t);expect(transactionDescription(source,translate)).toBe(source);expect(translate).not.toHaveBeenCalled();
  });
  it("handles absent descriptions and unknown types without inventing one", () => {
    expect(transactionDescription(null,t)).toBe("");expect(transactionDescription(undefined,t)).toBe("");
    expect(transactionTypeLabel("new_type",t)).toBe("new_type");expect(transactionTypeLabel("__proto__",t)).toBe("__proto__");
  });
  it.each([0,1,2])("uses a complete subscription phrase for count %i in both languages", count => {
    expect(subscriptionCountText(count,false)).toBe(`${count} cancelled subscription${count===1?"":"s"}`);
    expect(subscriptionCountText(count,false,t)).toBe(`${count} subscri${count===1?"ção cancelada":"ções canceladas"}`);
    expect(subscriptionCountText(count,true,t)).toBe(`${count} subscri${count===1?"ção ativa":"ções ativas"}`);
  });
  it("renders translated system descriptions and currency copy, while keeping personal names and notes", () => {
    const html=renderToStaticMarkup(<LanguageProvider language="pt" catalog={pt}><TransactionList currency="EUR" approximate unconverted={[]} deleteAction={async()=>{}} rows={[
      {id:"one",date:"2026-10-01",type:"expense",amount:-20,currency:"USD",accountName:"Income",categoryName:"Interest",description:"Expense (reconciliation)",merchant:null},
      {id:"two",date:"2026-10-01",type:"income",amount:30,currency:"EUR",accountName:"Income",categoryName:null,description:"My Income",merchant:null},
    ]}/></LanguageProvider>);
    expect(html).toContain("Despesa (reconciliação)");expect(html).not.toContain("Expense (reconciliation)");
    expect(html).toContain("Os montantes registados noutra moeda");expect(html).not.toContain("Amounts recorded in another currency");
    expect(html).toContain("My Income");expect(html).toContain('translate="no">Income');expect(html).toContain('translate="no">Interest');
  });
});
