/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentCardPreview, parseDocumentPreview } from "../../src/DocumentCardPreview.jsx";

describe("document card preview", () => {
  it("renders real Markdown structure while omitting frontmatter and executable MDX", () => {
    const source = `---
title: Private metadata
---
import Dangerous from "./Dangerous.jsx"

# Launch plan

The ordinary file stays the source of truth.

## First release

- Open a local folder
- Review external edits

<Dangerous />`;

    const blocks = parseDocumentPreview(source);
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Launch plan" },
      { type: "paragraph", text: "The ordinary file stays the source of truth." },
      { type: "heading", level: 2, text: "First release" },
      { type: "list", ordered: false, items: ["Open a local folder", "Review external edits"] },
    ]);

    render(<DocumentCardPreview source={source} status="ready" />);
    expect(screen.getByText("Launch plan")).toBeInTheDocument();
    expect(screen.getByText("The ordinary file stays the source of truth.")).toBeInTheDocument();
    expect(screen.queryByText(/Dangerous/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Private metadata/)).not.toBeInTheDocument();
  });

  it("shows an honest empty state instead of invented preview copy", () => {
    render(<DocumentCardPreview source={"\n\n"} status="ready" />);
    expect(screen.getByText("Empty document")).toBeInTheDocument();
  });

  it("renders standalone Markdown images through the document asset resolver", () => {
    const resolveImage = (source) => `fylune://preview/${source}`;
    const source = "# Field notes\n\n![Foreign butterflies](../assets/Foreign%20butterflies.jpg)\n\nA short caption.";

    expect(parseDocumentPreview(source)).toContainEqual({
      type: "image",
      alt: "Foreign butterflies",
      src: "../assets/Foreign%20butterflies.jpg",
    });
    const { container } = render(
      <DocumentCardPreview source={source} status="ready" resolveImage={resolveImage} />,
    );
    expect(container.querySelector(".document-card-preview-image")).toHaveAttribute(
      "src",
      "fylune://preview/../assets/Foreign%20butterflies.jpg",
    );
    expect(container.querySelector(".document-card-preview-image")).toHaveAttribute(
      "alt",
      "Foreign butterflies",
    );
    expect(screen.queryByText(/Image: Foreign butterflies/)).not.toBeInTheDocument();
  });
});
