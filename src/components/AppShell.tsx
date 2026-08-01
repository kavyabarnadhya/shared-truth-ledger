"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "./Wordmark";
import { ReviewerBanner } from "./ReviewerNote";

const NAV_ITEMS = [
  { href: "/", label: "Overview", glyph: "○" },
  { href: "/contradictions", label: "Signals", glyph: "◈" },
  { href: "/ledger", label: "Ledger", glyph: "▤" },
  { href: "/evals", label: "Evals", glyph: "✓" },
  { href: "/sandbox", label: "Try it", glyph: "▷" },
  { href: "/architecture", label: "Architecture", glyph: "◫" },
] as const;

/**
 * Product shell: left sidebar on wide viewports, collapsing to a top bar
 * under ~720px (see .app-shell media query in globals.css). Carries the
 * signed-in demo user and connected-sources line — honestly labelled as
 * demo, never implying real auth or a live connection — plus the
 * persistent, dismissible reviewer banner that frames the rest of the app
 * as a product with an engineering layer available on request, not the
 * other way round.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [bannerDismissed, setBannerDismissed] = useState(false);

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
        </div>
      </aside>
      <div className="app-shell__content">
        {!bannerDismissed && <ReviewerBanner onDismiss={() => setBannerDismissed(true)} />}
        {children}
      </div>
    </div>
  );
}
