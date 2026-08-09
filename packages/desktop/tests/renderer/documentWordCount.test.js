import { describe, expect, it } from "vitest";

import { countDocumentWords } from "../../src/documentWordCount.js";

describe("document word count", () => {
  it("counts CJK characters and spaced-language words together", () => {
    const markdown = [
      "## 这是一个标题",
      "",
      "这是另一个标题",
      "",
      "你好呀",
      "",
      "1233",
      "",
      "- [ ] 你好呀",
    ].join("\n");

    expect(countDocumentWords(markdown)).toBe(20);
    expect(countDocumentWords("Local files stay useful when AI joins the team.")).toBe(9);
    expect(countDocumentWords("你好呀 Fylune")).toBe(4);
  });

  it("ignores Markdown structure, metadata, and link destinations", () => {
    const markdown = [
      "---",
      "owner: Fylune",
      "---",
      "",
      "# Product notes",
      "",
      "- [ ] Review the [launch brief](https://fylune.com/docs/launch)",
      "- ![Launch cover](./assets/launch-cover.png)",
    ].join("\n");

    expect(countDocumentWords(markdown)).toBe(8);
  });
});
