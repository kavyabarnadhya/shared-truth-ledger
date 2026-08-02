"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

const NAV_ITEMS = [
  { href: "/", label: "Overview", glyph: "○" },
  { href: "/contradictions", label: "Signals", glyph: "◈" },
  { href: "/ledger", label: "Ledger", glyph: "▤" },
  { href: "/evals", label: "Evals", glyph: "✓" },
  { href: "/sandbox", label: "Try it", glyph: "▷" },
  { href: "/architecture", label: "Architecture", glyph: "◫" },
  { href: "/settings", label: "Settings", glyph: "⚙" },
] as const;

/**
 * Product shell: left sidebar on wide viewports, collapsing to a top bar
 * under ~720px (see .app-shell media query in globals.css). Carries the
 * signed-in demo user and connected-sources line — honestly labelled as
 * demo, never implying real auth or a live connection. The engineering
 * layer lives in each page's own ReviewerNote plus the Architecture page,
 * both reachable from the nav — no separate site-wide banner needed.
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

        <div className="app-sidebar__user">
          <div className="app-sidebar__user-name">Meera Iyer</div>
          <div className="claim-state-label">Product Manager · demo sign-in, not real auth</div>
          <div className="app-sidebar__sources">
            <span className="app-sidebar__source-chip">Slack ✓</span>
            <span className="app-sidebar__source-chip">Gmail ✓</span>
          </div>
          <div className="claim-state-label">read through an MCP-style tool layer</div>
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
          <p>Demo data · runs without an API key</p>
          <Link href="/deck" className="app-sidebar__footer-link">
            View deck →
          </Link>
          <Link href="/process" className="app-sidebar__footer-link">
            How this was built →
          </Link>
        </div>
      </aside>
      <div className="app-shell__content">{children}</div>
    </div>
  );
}
