import { createFileRoute } from "@tanstack/react-router";

import { deleteAccount } from "../content/legal.ts";
import { site } from "../content/site.ts";

export const Route = createFileRoute("/delete-account")({
  head: () => ({ meta: [{ title: `Delete your account | ${site.name}` }] }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <article className="page narrow prose">
      <h1>{deleteAccount.title}</h1>
      <p className="lede">{deleteAccount.intro}</p>
      <h2>In the app</h2>
      <ol>
        {deleteAccount.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h2>What is deleted</h2>
      <ul>
        {deleteAccount.whatIsDeleted.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>What remains for a short time</h2>
      <ul>
        {deleteAccount.whatRemains.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{deleteAccount.fallbackTitle}</h2>
      <p>
        {deleteAccount.fallback}{" "}
        <a href={`mailto:${site.supportEmail}?subject=Delete%20my%20account`}>Email support</a>.
      </p>
    </article>
  );
}
