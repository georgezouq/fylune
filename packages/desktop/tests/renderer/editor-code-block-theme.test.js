import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, waitFor } from "@testing-library/react";
import { codeBlockPlugin, codeMirrorPlugin, MDXEditor } from "@mdxeditor/editor";
import React from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { fyluneCodeMirrorTheme } from "../../src/codeMirrorTheme.js";

const source = readFileSync(
  path.join(process.cwd(), "src/codeMirrorTheme.js"),
  "utf8",
);
const editorStyles = readFileSync(
  path.join(process.cwd(), "src/styles.css"),
  "utf8",
);
const appSource = readFileSync(
  path.join(process.cwd(), "src/App.jsx"),
  "utf8",
);

beforeAll(() => {
  Range.prototype.getClientRects ??= () => [];
  Range.prototype.getBoundingClientRect ??= () => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => cleanup());

describe("editor code block theme", () => {
  it("renders an editable fenced block with the themed CodeMirror extension", async () => {
    const { container } = render(React.createElement(MDXEditor, {
      markdown: "```js\nconst release = true;\n```",
      plugins: [
        codeBlockPlugin({ defaultCodeBlockLanguage: "text" }),
        codeMirrorPlugin({
          codeBlockLanguages: { text: "Plain text", js: "JavaScript" },
          codeMirrorExtensions: [fyluneCodeMirrorTheme],
        }),
      ],
    }));

    await waitFor(() => expect(container.querySelector(".cm-editor")).toBeInTheDocument());
    expect(container.querySelector(".cm-content")).toHaveTextContent("const release = true;");
    expect(container.querySelector('[aria-label="Language"]')).toHaveTextContent("JavaScript");
  });

  it("gives the embedded CodeMirror editor the Fylune semantic theme", () => {
    expect(source).toContain('backgroundColor: "transparent"');
    expect(source).toContain('color: "var(--ink)"');
    expect(source).toContain('backgroundColor: "var(--surface-elevated)"');
    expect(source).toContain('backgroundColor: "var(--selection)"');
    expect(source).toContain('caretColor: "var(--primary-strong)"');
    expect(source).toContain("syntaxHighlighting(syntaxTheme)");
  });

  it("highlights an active line only while its CodeMirror editor is focused", () => {
    expect(source).toMatch(
      /"\.cm-activeLine, \.cm-activeLineGutter": \{\s*backgroundColor: "transparent"/,
    );
    expect(source).toContain(
      '"&.cm-focused .cm-activeLine, &.cm-focused .cm-activeLineGutter"',
    );
  });

  it("registers the theme at the highest CodeMirror precedence", () => {
    expect(source).toContain("Prec.highest");
    expect(appSource).toContain("codeMirrorExtensions: [fyluneCodeMirrorTheme]");
  });

  it("themes the code block shell, controls, and language menu", () => {
    expect(editorStyles).toMatch(
      /\.fylune-mdx-editor \[class\*="_codeMirrorWrapper_"\] \{[\s\S]*background: var\(--surface\);/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-editor \[class\*="_codeMirrorToolbar_"\] \{[\s\S]*background: var\(--surface-elevated\);[\s\S]*color: var\(--muted\);/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-editor \[class\*="_codeMirrorToolbar_"\]:has\(:disabled\) \{\s*display: none;/,
    );
    expect(editorStyles).toMatch(
      /\.fylune-mdx-editor \.mdxeditor-select-content \{[\s\S]*background: var\(--surface-elevated\);[\s\S]*color: var\(--ink\);/,
    );
  });
});
