import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { messagesFor } from "@/lib/i18n/messages";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, replace() {} }) }));
vi.mock("../useText", () => ({ useText: () => (text: string) => text }));
vi.mock("../LanguageContext", () => ({ useLanguage: () => ({ m: messagesFor("en"), language: "en" }) }));
vi.mock("../GoogleMethods", () => ({ default: () => null }));
vi.mock("../GoogleButton", () => ({ default: ({ purpose }: { purpose: string }) => <button>{`Confirm Google: ${purpose}`}</button> }));
vi.mock("@/actions/auth", () => ({ deleteAccount: vi.fn(), replaceRecoveryCode: vi.fn() }));
import AccountSettings from "../AccountSettings";
describe("passwordless account recovery controls", () => {
  it("offers a new Google confirmation before recovery-code replacement", () => {
    const html = renderToStaticMarkup(<AccountSettings email="a@example.test" canDelete google={{ enabled: true, hasPassword: false, linked: true, email: "a@example.test", confirmation: null }} />);
    expect(html).toContain("Confirm Google: recovery-code");
    expect(html).not.toContain('type="password"');
  });
  it("shows the operation and cancel controls after its specific proof, without a password field", () => {
    const html = renderToStaticMarkup(<AccountSettings email="a@example.test" canDelete google={{ enabled: true, hasPassword: false, linked: true, email: "a@example.test", confirmation: "recovery-code" }} />);
    expect(html).toContain(messagesFor("en").account.makeCode);
    expect(html).toContain(messagesFor("en").account.cancel);
    expect(html).not.toContain("Confirm Google: recovery-code");
    expect(html).not.toContain('type="password"');
  });
});
