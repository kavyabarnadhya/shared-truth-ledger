"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/contradictions", label: "Contradictions" },
  { href: "/ledger", label: "Ledger" },
  { href: "/evals", label: "Evals" },
  { href: "/sandbox", label: "Sandbox" },
] as const;

export function TabNav() {
  const pathname = usePathname();
  return (
    <nav className="tab-nav" aria-label="Main">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="tab-nav__link"
          data-active={pathname?.startsWith(tab.href) ? "true" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
