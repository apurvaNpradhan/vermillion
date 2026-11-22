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
          <a href="/licenses/react-bits.txt">{en.licensesLink}</a>
        </nav>
        <div className="footer-notes">
          <p>
            {site.name}. {site.tagline} {site.subtitle}
          </p>
          <p>
            <a href={photo.sourceUrl} rel="noreferrer">
              {photo.work}
            </a>
            . {photo.byline}{" "}
            <a href={photo.licenseUrl} rel="license noreferrer">
              {photo.license}
            </a>
            , {photo.changes}
          </p>
        </div>
      </div>
    </footer>
  );
}
