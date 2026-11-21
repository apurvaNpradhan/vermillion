import { Link } from "@tanstack/react-router";

import { site } from "../content/site.ts";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Footer">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/delete-account">Delete account</Link>
        <a href={site.githubUrl} rel="noreferrer">
          GitHub
        </a>
      </nav>
      <p>
        {site.name}. {site.tagline}
      </p>
    </footer>
  );
}
