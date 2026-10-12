import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SymbolName, { SymbolNamesProvider } from "../SymbolName";

const draw = (node: React.ReactNode) =>
  renderToStaticMarkup(<SymbolNamesProvider names={{ IGLAl_EQ: "Ouro físico" }}>{node}</SymbolNamesProvider>);

describe("a ticker on screen", () => {
  it("shows your name, with the ticker small beside it and in full on hover", () => {
    const html = draw(<SymbolName symbol="IGLAl_EQ" short />);
    expect(html).toContain("Ouro físico");
    expect(html).toContain(">IGLAl<");
    expect(html).toContain('title="IGLAl_EQ"');
    expect(html).toContain('translate="no"');
  });

  it("shows the ticker alone when it has no name, shortened only when asked", () => {
    expect(draw(<SymbolName symbol="PHAGa_EQ" />)).toContain(">PHAGa_EQ<");
    expect(draw(<SymbolName symbol="PHAGa_EQ" short />)).toContain(">PHAGa<");
    expect(draw(<SymbolName symbol={null} />)).toContain("—");
  });
});
