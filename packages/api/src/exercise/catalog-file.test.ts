import { describe, expect, it } from "vitest";

import { CatalogValidationError, parseCatalog } from "./catalog-file";
import { bundledCatalogText } from "./operations/bundled-catalog";

const rows = () => JSON.parse(bundledCatalogText());

describe("the committed catalog file", () => {
  it("passes validation and has 455 exercises", () => {
    expect(parseCatalog(bundledCatalogText())).toHaveLength(455);
  });
});

describe("catalog validation", () => {
  const refused = (mutate: (list: ReturnType<typeof rows>) => void) => {
    const list = rows();
    mutate(list);
    return expect(() => parseCatalog(JSON.stringify(list))).toThrow(CatalogValidationError);
  };

  it("refuses an unknown slug", () => {
    refused((list) => (list[0].equipment = "cable"));
    refused((list) => (list[0].primary_muscle = "wings"));
    refused((list) => (list[0].exercise_type = "telepathy"));
  });

  it("refuses duplicate ids and titles", () => {
    refused((list) => (list[1].id = list[0].id));
    refused((list) => (list[1].title = list[0].title));
  });

  it("refuses a secondary muscle equal to the primary one", () => {
    refused((list) => (list[0].secondary_muscles = [list[0].primary_muscle]));
  });

  it("refuses a media key that is a URL, an unknown field or a missing field", () => {
    refused((list) => (list[0].video_key = "https://example.com/a.mp4"));
    refused((list) => (list[0].extra = 1));
    refused((list) => delete list[0].title);
  });

  it("refuses text that is not a JSON list", () => {
    expect(() => parseCatalog("{")).toThrow(CatalogValidationError);
    expect(() => parseCatalog("[]")).toThrow(CatalogValidationError);
  });
});
