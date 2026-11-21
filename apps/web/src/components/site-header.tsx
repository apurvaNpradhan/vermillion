import { Link } from "@tanstack/react-router";

import { en, site } from "../content/en.ts";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label={en.homeLink}>
        <img src="/icons/icon-192.png" alt="" width={32} height={32} />
        <span>{site.name}</span>
      </Link>
    </header>
  );
}
