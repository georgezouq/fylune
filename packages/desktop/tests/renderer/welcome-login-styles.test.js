import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  path.join(process.cwd(), "src/styles.css"),
  "utf8",
).replaceAll("\r\n", "\n");

describe("welcome login loading styles", () => {
  it("keeps the loading spinner and label centered", () => {
    expect(styles).toMatch(
      /\.primary-button,[\s\S]*?\.secondary-button,[\s\S]*?\.text-button \{[\s\S]*?justify-content: center;/,
    );
    expect(styles).toMatch(/\.welcome-login-actions \{[\s\S]*?display: flex;[\s\S]*?gap: 9px;/);
    expect(styles).toMatch(/\.welcome-login-primary,[\s\S]*?\.welcome-login-skip \{[\s\S]*?flex: 1;/);
  });
});
