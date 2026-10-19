import { describe, expect, it } from "vitest";

import { highlightQuote } from "./case-law";

describe("highlightQuote", () => {
  it("splits law text around an exact quote", () => {
    expect(highlightQuote("No faction may undermine a rival.", "undermine a rival")).toEqual([
      { text: "No faction may ", highlighted: false },
      { text: "undermine a rival", highlighted: true },
      { text: ".", highlighted: false },
    ]);
  });

  it("returns plain text when the quote is absent", () => {
    expect(highlightQuote("A frozen law text.", "not present")).toEqual([
      { text: "A frozen law text.", highlighted: false },
    ]);
  });

  it("keeps the whole law as plain text when no quote is supplied", () => {
    expect(highlightQuote("A frozen law text.", "")).toEqual([
      { text: "A frozen law text.", highlighted: false },
    ]);
  });
});
