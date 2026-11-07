import { expect, it } from "vitest";

import { checkPrerequisites, describeProblems } from "./prerequisites";

// The scaffold of seam 3: later waves add headless @powersync/node round trips next
// to this file. Until then it proves the stack is reachable, or says what to start.
it("has Postgres, PowerSync and the API running", async () => {
  const problems = await checkPrerequisites();
  expect(problems, describeProblems(problems)).toEqual([]);
});
