import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLATFORM_SETUP, PLATFORM_LABELS } from "@/lib/connectors/constants";
import { translateText } from "../text";
import pt from "../full/pt.json";
import ConnectionForm from "@/components/ConnectionForm";

vi.mock("@/components/useText", () => ({ useText: () => (source: string) => translateText(pt, source) }));

describe("Portuguese connection instructions", () => {
  it("translates every platform step, warning and field hint", () => {
    for (const config of Object.values(PLATFORM_SETUP)) {
      for (const source of [...config.steps, config.help, config.identifierHint, config.identifierLabel, config.warning].filter(Boolean) as string[]) {
        expect(translateText(pt, source), source).not.toBe(source);
      }
    }
  });
  it("renders supplied instructions in Portuguese at the display boundary", () => {
    const html = renderToStaticMarkup(<ConnectionForm action={async () => {}} accounts={[]} newAccountValue="new" setup={PLATFORM_SETUP} labels={PLATFORM_LABELS} bybitRegions={[]} secretsAvailable={false} />);
    expect(html).toContain("Não precisas de instalar nem configurar nada.");
    expect(html).toContain("Endereço da carteira");
    expect(html).not.toContain("Nothing to install");
  });
});
