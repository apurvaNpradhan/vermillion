import { Link } from "@tanstack/react-router";

export function NotFound() {
  return (
    <section className="page narrow">
      <h1>Page not found</h1>
      <p className="lede">That page does not exist, or it moved.</p>
      <p>
        <Link to="/" className="button">
          Back to the home page
        </Link>
      </p>
    </section>
  );
}
