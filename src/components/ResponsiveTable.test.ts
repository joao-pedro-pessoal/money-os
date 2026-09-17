import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResponsiveTable from "./ResponsiveTable";

function render(headers: string[], rows: ReturnType<typeof h>[]) {
  return renderToStaticMarkup(h(ResponsiveTable, { className: "data-table", id: "test-table" },
    h("thead", null, h("tr", null, ...headers.map(label => h("th", { key: label }, label)))),
    h("tbody", null, h(Fragment, null, ...rows))));
}

describe("responsive financial tables", () => {
  it("pairs each amount with its rendered heading after columns are reordered", () => {
    const markup = render(["Name", "Account", "Unrealized P&L", "At risk"], [
      h("tr", { key: "position" }, h("td", null, "ETF"), h("td", null, "Broker"), h("td", null, "no cost basis"), h("td", null, "25.00 USD")),
    ]);
    expect(markup).toContain('data-phone-records="true"');
    expect(markup).toContain('data-label="Unrealized P&amp;L">no cost basis');
    expect(markup).toContain('data-label="At risk">25.00 USD');
    expect(markup).toContain('id="test-table"');
    expect(markup.match(/25\.00 USD/g)).toHaveLength(1);
  });

  it("keeps group totals aligned after a spanning group label", () => {
    const markup = render(["Name", "Type", "Value", "P&L"], [
      h("tr", { key: "group" }, h("td", { colSpan: 2 }, "ETFs"), h("td", null, "100 EUR"), h("td", null, "-5 EUR")),
    ]);
    expect(markup).toContain('colSpan="2" data-wide-cell="true">ETFs');
    expect(markup).toContain('data-label="Value">100 EUR');
    expect(markup).toContain('data-label="P&amp;L">-5 EUR');
  });

  it("retains existing cell labels, links and action controls", () => {
    const markup = render(["Date", "Account", "Amount", ""], [
      h("tr", { key: "entry" }, h("td", null, "2026-09-14"), h("td", null, h("a", { href: "/accounts/cash" }, "Cash")), h("td", { "data-label": "Amount (USD)" }, "0 USD"), h("td", null, h("button", { type: "button" }, "Edit"))),
    ]);
    expect(markup).toContain('data-label="Amount (USD)">0 USD');
    expect(markup).toContain('data-label="Actions" data-wide-cell="true"><button type="button">Edit');
    expect(markup).toContain('href="/accounts/cash"');
  });

  it("keeps a small table compact without duplicating its content", () => {
    const markup = render(["Date", "Description", "Amount"], [h("tr", { key: "a" }, h("td", null, "Today"), h("td", null, "Purchase"), h("td", null, "-12 EUR"))]);
    expect(markup).not.toContain('data-phone-records');
    expect(markup.match(/-12 EUR/g)).toHaveLength(1);
  });
});
