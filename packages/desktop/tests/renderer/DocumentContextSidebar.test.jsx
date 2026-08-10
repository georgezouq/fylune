/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DocumentContextSidebar, parseDocumentContext } from "../../src/DocumentContextSidebar.jsx";

describe("document context sidebar", () => {
  it("extracts headings, tasks, and supported attachments without reading fenced code", () => {
    const source = `# Launch plan

## Before launch

- [ ] Verify the release
- [x] Record the demo

![Cover](./assets/cover.png)
[Walkthrough](./assets/demo.mp4)
[Launch brief](./assets/brief.pdf)

\`\`\`md
## Not a heading
- [ ] Not a task
\`\`\`
`;

    expect(parseDocumentContext(source)).toEqual({
      headings: [
        { id: "heading-0", level: 1, text: "Launch plan", line: 0 },
        { id: "heading-2", level: 2, text: "Before launch", line: 2 },
      ],
      tasks: [
        { id: "task-4", completed: false, text: "Verify the release", line: 4 },
        { id: "task-5", completed: true, text: "Record the demo", line: 5 },
      ],
      attachments: [
        { id: "attachment-7-0", type: "image", text: "Cover", reference: "./assets/cover.png", line: 7 },
        { id: "attachment-8-1", type: "video", text: "Walkthrough", reference: "./assets/demo.mp4", line: 8 },
        { id: "attachment-9-2", type: "pdf", text: "Launch brief", reference: "./assets/brief.pdf", line: 9 },
      ],
    });
  });

  it("switches views and routes a selected document item back to the editor", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onNavigate = vi.fn();
    const source = "# Launch plan\n\n## Review\n\n- [ ] Check copy\n\n![Cover](./cover.png)";
    const { rerender } = render(
      <DocumentContextSidebar
        activeDocument={{ id: "launch", title: "Launch plan", path: "launch-plan.md" }}
        source={source}
        view="outline"
        onView={onView}
        onNavigate={onNavigate}
        filesPanel={<div>Project tree</div>}
      />,
    );

    const tabs = screen.getByRole("tablist", { name: "Document sidebar views" });
    expect(within(tabs).getByRole("tab", { name: "Table of contents" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ type: "heading", text: "Review" }));

    await user.click(within(tabs).getByRole("tab", { name: "Tasks" }));
    expect(onView).toHaveBeenCalledWith("tasks");

    rerender(
      <DocumentContextSidebar
        activeDocument={{ id: "launch", title: "Launch plan", path: "launch-plan.md" }}
        source={source}
        view="attachments"
        onView={onView}
        onNavigate={onNavigate}
        filesPanel={<div>Project tree</div>}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Cover/ }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ type: "attachment", assetType: "image", reference: "./cover.png" }));
  });

  it("keeps document tools hidden for non-Markdown files", () => {
    render(
      <DocumentContextSidebar
        activeDocument={{ id: "config", title: "Config", path: "config.json" }}
        source={'{"enabled":true}'}
        view="outline"
        onView={vi.fn()}
        onNavigate={vi.fn()}
        filesPanel={<div>Project tree</div>}
      />,
    );

    expect(screen.queryByRole("tablist", { name: "Document sidebar views" })).not.toBeInTheDocument();
    expect(screen.getByText("Project tree")).toBeInTheDocument();
  });
});
