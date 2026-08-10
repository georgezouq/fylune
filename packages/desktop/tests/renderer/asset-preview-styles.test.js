import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const styles = fs.readFileSync(path.resolve(currentDirectory, "../../src/styles.css"), "utf8");

describe("image preview viewport styles", () => {
  it("keeps scrolling inside a fixed image viewport", () => {
    expect(styles).toMatch(/\.asset-preview-content\.image\s*\{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.image-preview-stage\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
  });

  it("uses native pan cursors and disables image drag ghosts", () => {
    expect(styles).toContain(".image-preview-stage.is-pannable { cursor: grab; }");
    expect(styles).toContain(".image-preview-stage.is-dragging { cursor: grabbing; }");
    expect(styles).toMatch(/\.image-preview-stage img\s*\{[^}]*pointer-events:\s*none;/s);
  });
});
