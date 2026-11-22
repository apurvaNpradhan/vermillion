import { Link } from "@tanstack/react-router";

import { en, photo, site } from "../content/en.ts";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <nav aria-label={en.footer}>
          <Link to="/screens">{en.screensLink}</Link>
          <Link to="/privacy">{en.privacyLink}</Link>
          <Link to="/terms">{en.termsLink}</Link>
          <Link to="/delete-account">{en.deletionLink}</Link>
          <a href={site.githubUrl} rel="noreferrer">
            {en.github}
          </a>
        </nav>
        <p>
          {site.name}. {site.tagline}{" "}
          <a href={photo.sourceUrl} rel="noreferrer">
            {photo.credit}
          </a>
        </p>
      </div>
    </footer>
  );
}
