import { describe, expect, it } from "vitest";

import {
  workspaceRelativePath,
  workspaceResourceMarkdown,
} from "../../src/documentResourceDrop.js";

describe("document resource drops", () => {
  it("builds an encoded relative path from the open document", () => {
    expect(
      workspaceRelativePath(
        "docs/notes/brief.mdx",
        "assets/launch cover.png",
      ),
    ).toBe("../../assets/launch%20cover.png");
  });

  it("inserts workspace images as portable Markdown image references", () => {
    expect(
      workspaceResourceMarkdown(
        {
          label: "Launch cover",
          path: "Assets/launch-cover.png",
          type: "image",
        },
        "Product/Product brief.mdx",
      ),
    ).toBe("![Launch cover](../Assets/launch-cover.png)");
  });

  it("inserts other workspace files as links in the same directory", () => {
    expect(
      workspaceResourceMarkdown(
        {
          label: "Research] final.pdf",
          path: "docs/Research final.pdf",
          type: "file",
        },
        "docs/brief.mdx",
      ),
    ).toBe("[Research\\] final.pdf](./Research%20final.pdf)");
  });

  it("recognizes image extensions even when the tree type is generic", () => {
    expect(
      workspaceResourceMarkdown(
        {
          label: "diagram.webp",
          path: "docs/diagram.webp",
          type: "file",
        },
        "docs/brief.mdx",
      ),
    ).toBe("![diagram.webp](./diagram.webp)");
  });
});
