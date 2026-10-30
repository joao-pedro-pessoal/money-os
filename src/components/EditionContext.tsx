"use client";

import { createContext, useContext, type ReactNode } from "react";
import { INVESTMENTS_ENABLED } from "@/lib/release/edition";

const EditionContext = createContext(INVESTMENTS_ENABLED);

/** Presentation only. Every protected operation separately checks the server session. */
export function EditionProvider({ investmentsEnabled, children }: { investmentsEnabled: boolean; children: ReactNode }) {
  return <EditionContext.Provider value={investmentsEnabled}>{children}</EditionContext.Provider>;
}

export function useInvestments(): boolean {
  return useContext(EditionContext);
}
