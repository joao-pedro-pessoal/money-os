/** A build-time product edition, shared by the server and browser. No secrets. */
export type ProductEdition = "full" | "money";

export function productEdition(value: string | undefined): ProductEdition {
  if (!value || value === "full") return "full";
  if (value === "money") return "money";
  throw new Error("APP_EDITION must be full or money.");
}

// next.config.ts derives this public value from APP_EDITION at build time.
export const INVESTMENTS_ENABLED = process.env.NEXT_PUBLIC_PRODUCT_EDITION !== "money";

const LATER_PATHS = ["/investments", "/positions", "/connections", "/settings/names", "/statistics", "/library", "/api/sync"];

export function availablePath(path: string, edition: ProductEdition = INVESTMENTS_ENABLED ? "full" : "money"): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return edition === "full" || !LATER_PATHS.some(root => pathname === root || pathname.startsWith(root + "/"));
}

export function availableLinks<T extends { href: string }>(links: T[]): T[] {
  return links.filter(link => availablePath(link.href));
}

/** Also checked by mutations: hiding a page alone does not disable its actions. */
export function requireInvestments(): void {
  if (!INVESTMENTS_ENABLED) throw new Error("Investments are not available in this version.");
}
