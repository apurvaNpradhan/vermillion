import { createFileRoute } from "@tanstack/react-router";

import { en, screenshots, site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/screens")({
  head: () => pageHead("/screens", `${en.screensLink} | ${site.name}`, en.screensLead),
  component: ScreensPage,
});

function ScreensPage() {
  return (
    <section className="page screens" aria-labelledby="screens-title">
      <h1 id="screens-title">{en.screensTitle}</h1>
      <p className="lede">{en.screensLead}</p>
      <ul className="shots">
        {screenshots.map((shot) => (
          <li key={shot.src}>
            <img src={shot.src} alt={shot.alt} width={540} height={1157} loading="lazy" />
            <p className="meta">{shot.caption}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
