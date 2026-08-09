import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const styles = fs.readFileSync(path.resolve(currentDirectory, "../../src/styles.css"), "utf8");
const tokens = fs.readFileSync(path.resolve(currentDirectory, "../../src/design-system/tokens.css"), "utf8");

describe("office preview styles", () => {
  it("lets the workbook, document, and deck fill the preview panel", () => {
    expect(styles).toMatch(
      /\.asset-preview-content\.word,\s*\.asset-preview-content\.excel,\s*\.asset-preview-content\.powerpoint\s*\{[^}]*align-items:\s*stretch;[^}]*overflow:\s*hidden;/s,
    );
  });

  it("pins the workbook headers outside the scrolling body", () => {
    expect(styles).toMatch(/\.sheet-frame\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\);/s);
    expect(styles).toMatch(/\.sheet-column-headers\s*\{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.sheet-row-headers\s*\{[^}]*overflow:\s*hidden;/s);
    expect(styles).toMatch(/\.sheet-viewport\s*\{[^}]*overflow:\s*auto;/s);
  });

  it("marks an edited cell by shape as well as by colour", () => {
    expect(styles).toContain(".sheet-cell.is-edited { background: var(--document-paper-accent); }");
    expect(styles).toMatch(/\.sheet-cell\.is-edited::after\s*\{[^}]*border-top:\s*6px solid var\(--primary-strong\);/s);
  });

  it("renders imported document content on paper in both appearances", () => {
    // A Word page, a slide, and a workbook grid carry colours their author chose
    // against white, so they share one surface that stays light in dark mode.
    for (const token of ["--document-paper", "--document-paper-ink", "--document-paper-line"]) {
      expect(tokens, token).toMatch(new RegExp(`:root\\[data-theme="dark"\\][\\s\\S]*${token}:`));
    }
    expect(styles).toMatch(/\.sheet-frame\s*\{[^}]*background:\s*var\(--document-paper\);/s);
    expect(styles).toMatch(/\.sheet-cell\s*\{[^}]*color:\s*var\(--document-paper-ink\);/s);
    expect(styles).toMatch(/\.slide-canvas\s*\{[^}]*background:\s*var\(--document-paper\);/s);
  });

  it("gives the selected cell a visible ring and the grid a focus outline", () => {
    expect(styles).toMatch(/\.sheet-cell\.is-cursor\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--focus\);/s);
    expect(styles).toContain(".sheet-viewport:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }");
  });

  it("keeps Word pages on the shared paper token rather than raw white", () => {
    expect(styles).toMatch(/\.word-preview-pages \.fylune-docx-wrapper > section\s*\{[^}]*background:\s*var\(--document-paper\);/s);
    expect(styles).toMatch(/\.word-preview-pages\s*\{[^}]*scale:\s*var\(--word-zoom, 1\);/s);
  });

  it("recesses the slide stage so a deck reads as a projection surface", () => {
    expect(styles).toMatch(/\.slide-preview\s*\{[^}]*grid-template-columns:\s*178px minmax\(0, 1fr\);/s);
    expect(styles).toMatch(/\.slide-thumb\.is-current \.slide-thumb-frame\s*\{[^}]*border-color:\s*var\(--primary-strong\);/s);
  });

  it("uses the danger and warning tokens for the workbook's spoken states", () => {
    expect(styles).toContain(".sheet-conflict-note { background: var(--danger-soft); color: var(--ink); }");
    expect(styles).toContain(".sheet-fidelity-note { background: var(--warning-soft); color: var(--ink); }");
  });

  it("drops transitions when the system asks for reduced motion", () => {
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.slide-thumb \{ transition: none; \}/s);
  });
});
