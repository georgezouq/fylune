import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const libraryStyles = readFileSync(
  path.join(process.cwd(), "src/styles.css"),
  "utf8",
);
const designTokens = readFileSync(
  path.join(process.cwd(), "src/design-system/tokens.css"),
  "utf8",
);

describe("library card styles", () => {
  it("keeps folder cards aligned to the document card width", () => {
    expect(libraryStyles).toMatch(
      /\.folder-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(180px,\s*218px\)\);[\s\S]*?gap:\s*28px 24px;/,
    );
    expect(libraryStyles).toMatch(
      /\.row-ordered-masonry\.is-measuring\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(180px,\s*1fr\)\);[\s\S]*?gap:\s*20px;/,
    );
    expect(libraryStyles).toMatch(
      /\.row-ordered-masonry\.is-positioned\s*>\s*\.row-ordered-masonry-item\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset-block-start:\s*0;/,
    );
    expect(libraryStyles).toMatch(
      /\.row-ordered-masonry-item\s*>\s*\.document-card,[\s\S]*?\.row-ordered-masonry-item\s*>\s*\.workspace-file-card\s*\{[\s\S]*?margin:\s*0;/,
    );
    expect(libraryStyles).not.toContain("column-count:");
  });

  it("fans folder previews without shifting the library layout", () => {
    expect(libraryStyles).toMatch(
      /\.folder-card:is\(:hover,\s*:focus-visible\)\s+\.folder-peek\s*\{[\s\S]*?translate3d\(var\(--peek-reveal-x\),\s*var\(--peek-reveal-y\),\s*0\)[\s\S]*?transition-delay:\s*var\(--peek-delay\);/,
    );
    expect(libraryStyles).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.folder-card:is\(:hover,\s*:focus-visible\)\s+\.folder-peek\s*\{[\s\S]*?transition-delay:\s*0ms;[\s\S]*?will-change:\s*auto;/,
    );
    expect(libraryStyles).toMatch(/\.folder-pocket-back\s*\{[\s\S]*?inset:\s*0 4% 4%;[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*var\(--folder-pocket-strong\);/);
    expect(libraryStyles).toMatch(/\.folder-pocket-back path\s*\{[\s\S]*?fill:\s*currentcolor;/);
    expect(libraryStyles).not.toContain(".folder-pocket-back::before");
    expect(libraryStyles).toMatch(/\.folder-pocket-front\s*\{[\s\S]*?inset:\s*40% 2% 0;[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*16px;/);
    expect(libraryStyles).toMatch(
      /\.folder-peek\.is-folder\s*\{[\s\S]*?top:\s*12%;[\s\S]*?width:\s*42%;[\s\S]*?height:\s*46%;[\s\S]*?background:\s*transparent;/,
    );
    expect(libraryStyles).toMatch(
      /\.folder-peek-folder-shell \.folder-pocket-back\s*\{[\s\S]*?display:\s*block;[\s\S]*?inset:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*var\(--folder-sheet\);/,
    );
    expect(libraryStyles).toMatch(
      /\.folder-peek-folder-name\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(libraryStyles).not.toContain(".folder-peek.is-folder .folder-pocket-front");
  });

  it("keeps the folder material green and translucent in both themes", () => {
    expect(designTokens).toContain("--folder-pocket: oklch(0.88 0.055 204 / 0.72)");
    expect(designTokens).toContain("--folder-pocket: oklch(0.39 0.05 205 / 0.72)");
    expect(libraryStyles).toMatch(/\.folder-pocket-front\s*\{[\s\S]*?backdrop-filter:\s*blur\(18px\) saturate\(138%\);/);
  });

  it("preserves real image and document proportions in workspace previews", () => {
    expect(libraryStyles).toMatch(
      /\.folder-peek\.is-document\s*\{[\s\S]*?width:\s*38%;[\s\S]*?height:\s*78%;/,
    );
    expect(libraryStyles).toMatch(
      /\.folder-peek\.is-image img\s*\{[\s\S]*?aspect-ratio:\s*var\(--image-aspect-ratio,\s*auto\);/,
    );
    expect(libraryStyles).toMatch(
      /\.folder-peek\.is-image img,[\s\S]*?\.folder-peek\.is-video video\s*\{[\s\S]*?border-radius:\s*9px;[\s\S]*?box-shadow:\s*0 2px 6px[\s\S]*?object-fit:\s*contain;/,
    );
    expect(libraryStyles).toMatch(
      /\.workspace-file-preview\.image\.has-visual\s*\{[\s\S]*?aspect-ratio:\s*var\(--image-aspect-ratio,\s*4\s*\/\s*3\);/,
    );
    expect(libraryStyles).toMatch(
      /\.workspace-file-preview\.video\.has-visual\s*\{[\s\S]*?aspect-ratio:\s*var\(--video-aspect-ratio,\s*16\s*\/\s*9\);/,
    );
    expect(libraryStyles).toMatch(
      /\.workspace-file-preview:is\(\.image,\s*\.video\)\.has-visual img,[\s\S]*?\.workspace-file-preview:is\(\.image,\s*\.video\)\.has-visual video\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;[\s\S]*?object-fit:\s*contain;/,
    );
  });
});
