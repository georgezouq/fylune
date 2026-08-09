import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const editorStyles = readFileSync(
  path.join(process.cwd(), "src/styles.css"),
  "utf8",
);

describe("editor list styles", () => {
  it("restores visible markers after the global CSS reset", () => {
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content ul \{ list-style-type: disc; \}/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content ol \{ list-style-type: decimal; \}/,
    );
    expect(editorStyles).toContain(".fylune-mdx-content li::marker");
  });

  it("pulls task checkboxes back to the document content edge", () => {
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content li\[role="checkbox"\] \{[\s\S]*margin-inline-start: -1\.7em;[\s\S]*padding-inline-start: 1\.7em;/,
    );
  });

  it("centers task controls on the first line of text", () => {
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content li\[role="checkbox"\]::before \{[\s\S]*top: 0\.25em;/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-content li\[role="checkbox"\]::after \{[\s\S]*top: calc\(0\.25em \+ var\(--spacing-0_5\)\);/,
    );
  });

  it("centers document-sidebar tasks inside their interaction row", () => {
    expect(editorStyles).toMatch(
      /\.document-task-list button \{[^}]*align-items: start;/,
    );
    expect(editorStyles).toMatch(
      /\.document-task-list button \{[^}]*padding: 9px 8px;/,
    );
    expect(editorStyles).toMatch(
      /\.document-task-list button svg \{[^}]*margin-top: 0;/,
    );
  });
});

describe("editor tooltip theme styles", () => {
  it("keeps MDXEditor tooltips readable on the dark formatting surface", () => {
    expect(editorStyles).toContain('.fylune-mdx-editor [role="tooltip"]');
    expect(editorStyles).toMatch(
      /\.fylune-mdx-editor \[role="tooltip"\] \{[\s\S]*background: var\(--formatting-bg\);[\s\S]*color: var\(--formatting-ink\);/,
    );
  });
});

describe("editor placeholder styles", () => {
  it("uses the same muted text token as the insert-content action", () => {
    expect(editorStyles).toMatch(
      /\.fylune-mdx-editor \.fylune-mdx-content:not\(\[contenteditable\]\) \{ color: var\(--muted\); \}/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-editor \.fylune-mdx-content:not\(\[contenteditable\]\) p \{ color: inherit; \}/,
    );
    expect(editorStyles).toMatch(
      /\.insert-button \{[^}]*color: var\(--muted\);/,
    );
  });
});
