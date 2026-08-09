import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorStyles = readFileSync(
  path.join(process.cwd(), "src/styles.css"),
  "utf8",
);

describe("editor table styles", () => {
  it("moves MDXEditor control columns outside the document content edge", () => {
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content table\[class\*="tableEditor"\] \{[\s\S]*--fylune-table-control-gutter: 2rem;[\s\S]*width: calc\(100% \+ 4rem\) !important;[\s\S]*margin-inline-start: calc\(-1 \* var\(--fylune-table-control-gutter\)\);/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content \[class\*="tableToolsColumn"\] \{[\s\S]*width: var\(--fylune-table-control-gutter\);/,
    );
  });

  it("keeps table cells calm while preserving clear hover and keyboard states", () => {
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content table\[class\*="tableEditor"\] > tbody > tr > :not\(\[data-tool-cell="true"\]\) \{[\s\S]*border-color: var\(--border-soft\);[\s\S]*vertical-align: top;/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content table\[class\*="tableEditor"\] \[data-tool-cell="true"\] button:focus-visible \{[\s\S]*outline: 1px solid var\(--focus\);/,
    );
  });
});
