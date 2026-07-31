"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

const NAV_ITEMS = [
  { href: "/", label: "Overview", glyph: "○" },
  { href: "/contradictions", label: "Signals", glyph: "◈" },
  { href: "/ledger", label: "Ledger", glyph: "▤" },
  { href: "/evals", label: "Evals", glyph: "✓" },
  { href: "/sandbox", label: "Sandbox", glyph: "▷" },
  { href: "/architecture", label: "Architecture", glyph: "◫" },
] as const;

/**
 * Product shell: left sidebar on wide viewports, collapsing to a top bar
 * under ~720px (see .app-shell media query in globals.css). Replaces the
 * bare TabNav — same nav destinations, plus Architecture (new), plus a
 * named product and a static single-workspace label so a first-time
 * reviewer has context before they read a single table.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <Link href="/" style={{ textDecoration: "none" }}>
            <Wordmark />
          </Link>
          <div className="app-sidebar__workspace">Tamarind Games</div>
        </div>

        <nav className="app-sidebar__nav" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="app-sidebar__nav-item"
                data-active={active ? "true" : undefined}
              >
                <span className="app-sidebar__nav-glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="app-sidebar__footer">
          <p>replay mode · no live key needed</p>
          <Link href="/deck" className="app-sidebar__footer-link">
            View deck →
          </Link>
        </div>
      </aside>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
