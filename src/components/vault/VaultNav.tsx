"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavFrame, { navLinkClass } from "../NavFrame";
import { useNav } from "../NavContext";

const PAGES = [
  { href: "/vault", label: "Dashboard" },
  { href: "/vault/accounts", label: "Accounts", group: "Money" },
  { href: "/vault/cash-flow", label: "Cash Flow", group: "Money" },
];

/**
 * The vault's side menu: the owner's frame, the vault's own pages.
 *
 * Only what a vault holds — what you have, your accounts, what you recorded —
 * because everything else on the owner's menu reads the owner's database, which
 * nobody signed into a vault may reach. Devices and the lock sit apart at the
 * bottom, where the owner's Settings and Log out are.
 */
export default function VaultNav({ email, onLock }: { email?: string; onLock: () => void }) {
  const pathname = usePathname();
  const { setOpen } = useNav();
  const close = () => setOpen(false);
  const active = (href: string) => (href === "/vault" ? pathname === "/vault" : pathname.startsWith(href));
  const link = (href: string, label: string) => (
    <Link href={href} className={navLinkClass(active(href))} aria-current={active(href) ? "page" : undefined} onClick={close}>
      {label}
    </Link>
  );

  return (
    <NavFrame onClose={close} label="Vault">
      <div className="mb-5 px-3 text-xs text-[var(--muted)] break-words">
        Your vault{email ? <span className="block text-[var(--foreground)]">{email}</span> : null}
      </div>

      <div className="space-y-5 flex-1">
        <ul className="space-y-0.5">
          <li>{link(PAGES[0].href, PAGES[0].label)}</li>
        </ul>
        <div>
          <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">Money</div>
          <ul className="space-y-0.5">
            {PAGES.filter((page) => page.group === "Money").map((page) => (
              <li key={page.href}>{link(page.href, page.label)}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="pt-4 mt-4 border-t border-[var(--border)] space-y-1">
        {link("/vault/devices", "Devices")}
        <button
          type="button"
          onClick={() => {
            close();
            onLock();
          }}
          className="w-full min-h-11 rounded-lg px-3 py-2 text-left text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Lock and sign out
        </button>
      </div>
    </NavFrame>
  );
}
