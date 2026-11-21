import { createFileRoute } from "@tanstack/react-router";

import { deleteAccount } from "../content/legal.ts";
import { en, site } from "../content/en.ts";
import { pageHead } from "../page-head.ts";

export const Route = createFileRoute("/delete-account")({
  head: () =>
    pageHead("/delete-account", `${deleteAccount.title} | ${site.name}`, deleteAccount.intro),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <article className="page narrow prose">
      <h1>{deleteAccount.title}</h1>
      <p className="lede">{deleteAccount.intro}</p>
      <h2>{en.deletionSteps}</h2>
      <ol>
        {deleteAccount.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h2>{en.deletionScope}</h2>
      <ul>
        {deleteAccount.whatIsDeleted.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{en.deletionRetention}</h2>
      <ul>
        {deleteAccount.whatRemains.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{deleteAccount.fallbackTitle}</h2>
      <p>
        {deleteAccount.fallback}{" "}
        <a href={`mailto:${site.supportEmail}?subject=Delete%20my%20account`}>{en.emailSupport}</a>.
      </p>
    </article>
  );
}
