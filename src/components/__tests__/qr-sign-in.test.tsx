import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "../LanguageContext";
import QrSignIn from "../QrSignIn";
import LoginScreen from "../LoginScreen";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/actions/qrSignIn", () => ({}));
vi.mock("@/actions/auth", () => ({}));

describe("QR entry and approval screens", () => {
  it.each(["en", "pt"] as const)("offers the QR entry point and approval warning in %s", (language) => {
    const login = renderToStaticMarkup(<LanguageProvider language={language}><LoginScreen signUps={false} destination="/transactions?quick=expense" /></LanguageProvider>);
    expect(login).toContain("/login/qr?next=%2Ftransactions%3Fquick%3Dexpense");
    const request = renderToStaticMarkup(<LanguageProvider language={language}><QrSignIn /></LanguageProvider>);
    expect(request).toContain(language === "pt" ? "Mostrar novo QR" : "Show new QR");
    const approval = renderToStaticMarkup(<LanguageProvider language={language}><QrSignIn approve /></LanguageProvider>);
    expect(approval).toContain(language === "pt" ? "Nunca aproves um QR enviado por outra pessoa" : "Never approve a QR someone sent you");
    // Rendering/visiting alone offers no approval without a scanned capability.
    expect(approval).not.toContain("<form");
  });
});
