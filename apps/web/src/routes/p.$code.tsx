import { createFileRoute } from "@tanstack/react-router";

import { loadShare } from "../share/load-share.ts";
import { SharePage } from "../share/share-page.tsx";
import { shareHead } from "../share/share-head.ts";

export const Route = createFileRoute("/p/$code")({
  loader: ({ params }) => loadShare({ data: { code: params.code } }),
  head: ({ loaderData, params }) =>
    shareHead(
      `/p/${params.code.toUpperCase()}`,
      loaderData?.status === "found" ? loaderData.snapshot : null,
    ),
  component: ProgramShare,
});

function ProgramShare() {
  const { code } = Route.useParams();
  const result = Route.useLoaderData();
  return <SharePage code={code.toUpperCase()} result={result} />;
}
