import { describe, expect, it } from "vitest";

import { isLongMarkdown, markdownRuns } from "./markdown";

const text = (markdown: string) =>
  markdownRuns(markdown)
    .map((run) => run.text)
    .join("");

describe("markdownRuns", () => {
  it("styles inline emphasis, code and links", () => {
    const runs = markdownRuns("**Heavy** and *light* with `code` and [site](https://example.com)");
    expect(runs.find((run) => run.text === "Heavy")).toMatchObject({ bold: true });
    expect(runs.find((run) => run.text === "light")).toMatchObject({ italic: true });
    expect(runs.find((run) => run.text === "code")).toMatchObject({ code: true });
    expect(runs.find((run) => run.text === "site")).toMatchObject({ href: "https://example.com" });
  });

  it("refuses links that are not web or mail", () => {
    const runs = markdownRuns("[x](javascript:alert(1)) [y](myapp://open)");
    expect(runs.every((run) => run.href === null)).toBe(true);
  });

  it("makes headings bold and separates blocks by a blank line", () => {
    const runs = markdownRuns("# Plan\n\nFour days a week.");
    expect(runs[0]).toMatchObject({ text: "Plan", bold: true });
    expect(text("# Plan\n\nFour days a week.")).toBe("Plan\n\nFour days a week.");
  });

  it("writes lists as bulleted and numbered lines, nested ones indented", () => {
    expect(text("- Push\n- Pull\n  - Rows")).toBe("• Push\n• Pull\n    • Rows");
    expect(text("1. A\n2. B")).toBe("1. A\n2. B");
  });

  it("keeps characters that look like HTML as they were typed", () => {
    expect(text("5 < 6 & `<b>`")).toBe("5 < 6 & <b>");
  });

  it("is empty for empty input", () => {
    expect(markdownRuns("")).toEqual([]);
    expect(markdownRuns("\n\n")).toEqual([]);
  });
});

describe("isLongMarkdown", () => {
  it("is false for a short note and true past four lines", () => {
    expect(isLongMarkdown(markdownRuns("Short."))).toBe(false);
    expect(isLongMarkdown(markdownRuns("- a\n- b\n- c\n- d\n- e"))).toBe(true);
    expect(isLongMarkdown(markdownRuns("word ".repeat(80)))).toBe(true);
  });
});
