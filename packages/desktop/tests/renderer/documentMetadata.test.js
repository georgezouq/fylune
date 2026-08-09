import { describe, expect, it } from "vitest";

import {
  documentIconFromSource,
  serializeDocumentFrontmatter,
  splitDocumentFrontmatter,
  updateDocumentIconFrontmatter,
} from "../../electron/lib/document-metadata.mjs";

describe("document metadata", () => {
  it("reads a document icon while keeping frontmatter out of the editable body", () => {
    const source = `---\nstatus: draft\nicon: "🚀"\nowner: Product\n---\n\n# Launch plan\n\nBody.\n`;

    expect(documentIconFromSource(source)).toBe("🚀");
    expect(splitDocumentFrontmatter(source)).toEqual({
      frontmatter: 'status: draft\nicon: "🚀"\nowner: Product',
      content: "\n# Launch plan\n\nBody.\n",
    });
  });

  it("adds, changes, and removes only the icon field", () => {
    const metadata = "status: draft\nowner: Product";
    const withIcon = updateDocumentIconFrontmatter(metadata, "💡");

    expect(withIcon).toBe('status: draft\nowner: Product\nicon: "💡"');
    expect(updateDocumentIconFrontmatter(withIcon, "🎯")).toBe('status: draft\nowner: Product\nicon: "🎯"');
    expect(updateDocumentIconFrontmatter(withIcon, null)).toBe(metadata);
    expect(serializeDocumentFrontmatter("", "🌿")).toBe('---\nicon: "🌿"\n---\n\n');
    expect(serializeDocumentFrontmatter("", null)).toBe("");
  });
});
