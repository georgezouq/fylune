/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { ContentSurface } from "../../src/ContentSurface.jsx";

it("owns one shared frame, header, and panel for every content preview", () => {
  render(
    <ContentSurface.Root className="example-surface" label="Example resource">
      <ContentSurface.Header className="example-header">Resource header</ContentSurface.Header>
      <ContentSurface.Panel className="example-panel">Resource preview</ContentSurface.Panel>
    </ContentSurface.Root>,
  );

  const surface = screen.getByRole("region", { name: "Example resource" });
  expect(surface).toHaveClass("content-surface", "example-surface");
  expect(surface.querySelector(":scope > header")).toHaveClass("content-toolbar", "content-surface-header", "example-header");
  expect(surface.querySelector(":scope > main")).toHaveClass("content-surface-panel", "example-panel");
});
