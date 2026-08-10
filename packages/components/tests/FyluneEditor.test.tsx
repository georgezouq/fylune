import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EDITOR_EXAMPLES,
  FyluneDocument,
  FyluneEditor,
  type FyluneEditorMode,
} from "../src";

const mermaidMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, source: string) => ({
    svg: `<svg data-source="${source.replaceAll('"', "&quot;")}"></svg>`,
  })),
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidMocks.initialize,
    render: mermaidMocks.render,
  },
}));

describe("FyluneEditor", () => {
  beforeEach(() => {
    mermaidMocks.initialize.mockClear();
    mermaidMocks.render.mockClear();
  });

  it("edits an uncontrolled Markdown draft and updates the preview", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FyluneEditor defaultValue="## First draft" onChange={onChange} />,
    );

    const source = screen.getByRole("textbox", { name: "Markdown source" });
    await user.clear(source);
    await user.type(source, "## Revised draft");

    expect(source).toHaveValue("## Revised draft");
    expect(
      await screen.findByRole("heading", { name: "Revised draft" }),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(
      "## Revised draft",
      "flowchart",
    );
  });

  it("keeps a controlled value under the host application's control", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<FyluneEditor value="Host value" onChange={onChange} />);

    const source = screen.getByRole("textbox", { name: "Markdown source" });
    await user.type(source, " changed");

    expect(source).toHaveValue("Host value");
    expect(onChange).toHaveBeenCalled();
  });

  it("supports arrow-key mode navigation and preserves per-mode drafts", async () => {
    const user = userEvent.setup();
    const changes: FyluneEditorMode[] = [];
    render(<FyluneEditor onModeChange={(nextMode) => changes.push(nextMode)} />);

    const flowchartTab = screen.getByRole("tab", { name: "Flowchart" });
    flowchartTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Mind map" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Markdown source" })).toHaveValue(
      DEFAULT_EDITOR_EXAMPLES.mindmap,
    );
    expect(changes).toEqual(["mindmap"]);
  });

  it("renders Mermaid in strict mode", async () => {
    render(<FyluneEditor />);

    await waitFor(() => expect(mermaidMocks.render).toHaveBeenCalled());
    expect(mermaidMocks.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        startOnLoad: false,
        suppressErrorRendering: true,
      }),
    );
    expect(
      await screen.findByRole("img", { name: "Flowchart preview" }),
    ).toBeInTheDocument();
  });

  it("renders formulas without executing raw HTML or MDX", async () => {
    render(
      <FyluneEditor
        defaultMode="formula"
        defaultValue={`<script>window.pwned = true</script>

<DangerousComponent />

$$
E = mc^2
$$`}
      />,
    );

    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(document.querySelector("dangerouscomponent")).not.toBeInTheDocument();
    expect(document.querySelector(".katex")).toBeInTheDocument();
  });

  it("never fetches Markdown images in the preview", () => {
    render(
      <FyluneEditor defaultValue="![Private launch chart](https://example.com/private.png)" />,
    );

    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Private launch chart" }),
    ).toBeInTheDocument();
  });

  it("renders a read-only shared document with only explicitly resolved assets", () => {
    const resolveAssetUrl = vi.fn((source: string) =>
      source === "./assets/chart.png" ? "blob:fylune-chart" : null
    );

    render(
      <FyluneDocument
        markdown={"# Launch plan\n\n![Chart](./assets/chart.png)\n\n![Remote](https://example.com/private.png)"}
        resolveAssetUrl={resolveAssetUrl}
      />,
    );

    expect(screen.getByRole("heading", { name: "Launch plan" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Chart" })).toHaveAttribute(
      "src",
      "blob:fylune-chart",
    );
    expect(screen.getByRole("img", { name: "Remote" })).not.toHaveAttribute("src");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("allows every diagram status and accessible label to be localized", async () => {
    render(
      <FyluneEditor
        defaultMode="mindmap"
        labels={{
          safety: "受限预览",
          diagramLoading: "正在渲染图表…",
          diagramErrorTitle: "请检查图表源码。",
          diagramErrorFallback: "图表无法渲染。",
          diagramPreviewLabel: "{mode}可交互预览",
          imageBlocked: "图片预览已阻止",
          modeLabels: {
            flowchart: "流程图",
            mindmap: "思维导图",
            formula: "公式",
          },
        }}
      />,
    );

    expect(screen.getByText("受限预览")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "思维导图" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("正在渲染图表…")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "思维导图可交互预览" }),
    ).toBeInTheDocument();
  });

  it("uses localized recovery copy when a diagram is invalid", async () => {
    mermaidMocks.render.mockRejectedValueOnce(new Error("第 2 行语法无效"));

    render(
      <FyluneEditor
        labels={{
          diagramErrorTitle: "请检查图表源码。",
          diagramErrorFallback: "图表无法渲染。",
        }}
      />,
    );

    expect(
      await screen.findByText("请检查图表源码。"),
    ).toBeInTheDocument();
    expect(screen.getByText("第 2 行语法无效")).toBeInTheDocument();
  });
});
