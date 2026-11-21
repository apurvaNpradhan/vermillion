import { en } from "../content/en.ts";
import type { LegalDocument } from "../content/legal.ts";

export function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <article className="page narrow prose">
      <h1>{document.title}</h1>
      <p className="meta">{en.lastUpdated(document.updated)}</p>
      <p className="lede">{document.intro}</p>
      {document.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.items ? (
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}
