/* eslint-disable no-unused-vars -- JSX runtime usage is not detected by the base config */
import { createRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { codeBlockPlugin, MDXEditor } from "@mdxeditor/editor";
import { afterEach, describe, expect, it, vi } from "vitest";

import { specialCodeBlockEditorDescriptors, specialMarkdownPlugin } from "../../src/SpecialMarkdown.jsx";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 320 180"><text>Rendered diagram</text></svg>' })),
  },
}));

afterEach(() => cleanup());

describe("special Markdown", () => {
  it("renders Mermaid mind maps visually and preserves editable fenced source", async () => {
    const { default: mermaid } = await import("mermaid");
    const user = userEvent.setup();
    const editorRef = createRef();
    render(
      <MDXEditor
        ref={editorRef}
        markdown={"```mermaid\nmindmap\n  root((Launch))\n    Research\n```"}
        plugins={[codeBlockPlugin({ codeBlockEditorDescriptors: specialCodeBlockEditorDescriptors })]}
      />,
    );

    expect(await screen.findByRole("img", { name: "Mind map preview" })).toBeInTheDocument();
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: "strict" }));
    await user.click(screen.getByRole("button", { name: "Edit diagram source" }));
    const source = screen.getByRole("textbox", { name: "Mind map source" });
    fireEvent.change(source, { target: { value: "mindmap\n  root((Plan))\n    Build\n    Test" } });
    await user.click(screen.getByRole("button", { name: "Preview diagram" }));

    await waitFor(() => expect(editorRef.current.getMarkdown()).toContain("root((Plan))"));
    expect(editorRef.current.getMarkdown()).toContain("```mermaid");
  });

  it("renders standard inline and block math and saves edits as math syntax", async () => {
    const user = userEvent.setup();
    const editorRef = createRef();
    render(
      <MDXEditor
        ref={editorRef}
        markdown={"Inline $x^2$ stays in the sentence.\n\n$$\nE = mc^2\n$$"}
        plugins={[specialMarkdownPlugin()]}
      />,
    );

    await waitFor(() => expect(document.querySelector('.formula-rendered[aria-label="x^2"]')).toBeInTheDocument());
    expect(document.querySelector('.formula-rendered[aria-label="E = mc^2"]')).toBeInTheDocument();

    await user.click(screen.getByLabelText("Edit inline formula"));
    const source = screen.getByLabelText("Inline formula source");
    fireEvent.change(source, { target: { value: "y^3" } });
    fireEvent.keyDown(source, { key: "Enter" });

    await waitFor(() => expect(editorRef.current.getMarkdown()).toContain("$y^3$"));
    expect(editorRef.current.getMarkdown()).toContain("$$\nE = mc^2\n$$");
  });

  it("keeps invalid Mermaid source editable and explains the error in place", async () => {
    const { default: mermaid } = await import("mermaid");
    mermaid.render.mockRejectedValueOnce(new Error("Parse error on line 2"));
    render(
      <MDXEditor
        markdown={"```mermaid\nflowchart LR\n  A[\n```"}
        plugins={[codeBlockPlugin({ codeBlockEditorDescriptors: specialCodeBlockEditorDescriptors })]}
      />,
    );

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Diagram syntax needs attention");
    expect(error).toHaveTextContent("Parse error on line 2");
    expect(screen.getByRole("button", { name: "Edit diagram source" })).toBeInTheDocument();
  });
});
