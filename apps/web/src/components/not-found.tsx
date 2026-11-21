import { Link } from "@tanstack/react-router";

import { en } from "../content/en.ts";

export function NotFound() {
  return (
    <section className="page narrow">
      <h1>{en.notFoundTitle}</h1>
      <p className="lede">{en.notFoundBody}</p>
      <p>
        <Link to="/" className="button">
          {en.backHome}
        </Link>
      </p>
    </section>
  );
}
