import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorStyles = readFileSync(
  path.join(process.cwd(), "src/styles.css"),
  "utf8",
);

describe("external review panel styles", () => {
  it("keeps long review content in an independent scroll region", () => {
    expect(editorStyles).toMatch(
      /\.review-panel-body \{[\s\S]*min-height: 0;[\s\S]*flex: 1 1 auto;[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior: contain;/,
    );
    expect(editorStyles).toMatch(
      /\.review-panel footer \{[\s\S]*flex: 0 0 auto;/,
    );
  });
});
