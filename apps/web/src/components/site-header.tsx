import { Link } from "@tanstack/react-router";

import { en, site } from "../content/en.ts";
import { Mark } from "./mark.tsx";

export function SiteHeader() {
  return (
    <header className="site-header wrap">
      <Link to="/" className="lockup" aria-label={en.homeLink}>
        <Mark size={22} ember={false} />
        <span>{site.name}</span>
      </Link>
      <nav aria-label={en.primaryNav}>
        <Link to="/screens" className="nav-link keep">
          {en.screensLink}
        </Link>
        <Link to="/privacy" className="nav-link">
          {en.privacyLink}
        </Link>
        <a href={site.githubUrl} rel="noreferrer" className="nav-link">
          {en.github}
        </a>
        <a href={site.latestReleaseUrl} rel="noreferrer" className="button">
          {en.download}
        </a>
      </nav>
    </header>
  );
}
