import { describe, expect, it } from "vitest";

import {
  mergeDocumentVersions,
  resolveDocumentMerge,
  segmentMarkdown,
  waitForDocumentQuiet,
} from "../src/index.js";

describe("mergeDocumentVersions", () => {
  it("fast-forwards when the editor has no local changes", () => {
    const result = mergeDocumentVersions({ base: "# Plan\n\nOld\n", local: "# Plan\n\nOld\n", disk: "# Plan\n\nNew\n" });
    expect(result).toMatchObject({ status: "fast_forward", content: "# Plan\n\nNew\n", conflicts: [] });
  });

  it("merges non-overlapping semantic blocks without formatting untouched source", () => {
    const base = "---\ntitle: Plan\nowner: Sam\n---\n# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n";
    const local = "---\ntitle: Updated plan\nowner: Sam\n---\n# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n";
    const disk = "---\ntitle: Plan\nowner: Sam\n---\n# Plan\n\nFirst paragraph.\n\nSecond paragraph from an agent.\n";
    const result = mergeDocumentVersions({ base, local, disk });
    expect(result.status).toBe("merged");
    expect(result.content).toBe("---\ntitle: Updated plan\nowner: Sam\n---\n# Plan\n\nFirst paragraph.\n\nSecond paragraph from an agent.\n");
  });

  it("keeps overlapping edits local and reviewable", () => {
    const base = "# Plan\n\nOriginal paragraph.\n";
    const result = mergeDocumentVersions({
      base,
      local: "# Plan\n\nLocal paragraph.\n",
      disk: "# Plan\n\nAgent paragraph.\n",
    });
    expect(result.status).toBe("review");
    expect(result.conflicts).toHaveLength(1);
    expect(resolveDocumentMerge(result, { [result.conflicts[0].id]: "local" })).toBe("# Plan\n\nLocal paragraph.\n");
    expect(resolveDocumentMerge(result, { [result.conflicts[0].id]: "disk" })).toBe("# Plan\n\nAgent paragraph.\n");
  });

  it("merges disjoint character ranges in the same paragraph", () => {
    const base = "# Plan\n\nThe quick brown fox is ready.\n";
    const result = mergeDocumentVersions({
      base,
      local: "# Plan\n\nThe very quick brown fox is ready.\n",
      disk: "# Plan\n\nThe quick brown fox is finally ready.\n",
    });
    expect(result).toMatchObject({
      status: "merged",
      content: "# Plan\n\nThe very quick brown fox is finally ready.\n",
    });
  });

  it("merges different frontmatter fields and table rows", () => {
    const base = "---\ntitle: Plan\nowner: Sam\n---\n| Name | State |\n| --- | --- |\n| One | Draft |\n| Two | Draft |\n";
    const result = mergeDocumentVersions({
      base,
      local: "---\ntitle: Launch plan\nowner: Sam\n---\n| Name | State |\n| --- | --- |\n| One | Ready |\n| Two | Draft |\n",
      disk: "---\ntitle: Plan\nowner: Lee\n---\n| Name | State |\n| --- | --- |\n| One | Draft |\n| Two | Ready |\n",
    });
    expect(result).toMatchObject({ status: "merged" });
    expect(result.content).toContain("title: Launch plan");
    expect(result.content).toContain("owner: Lee");
    expect(result.content).toContain("| One | Ready |");
    expect(result.content).toContain("| Two | Ready |");
  });

  it("keeps concurrent list insertions in a stable order", () => {
    const base = "# Plan\n\n- Existing\n";
    const result = mergeDocumentVersions({
      base,
      local: "# Plan\n\n- Existing\n- Local task\n",
      disk: "# Plan\n\n- Existing\n- Agent task\n",
    });
    expect(result).toMatchObject({ status: "merged" });
    expect(result.content).toContain("- Local task\n- Agent task\n");
  });

  it("merges separate attributes on built-in MDX components", () => {
    const base = '<Decision status="Draft" owner="Sam">\nKeep local files.\n</Decision>\n';
    const result = mergeDocumentVersions({
      base,
      local: '<Decision status="Accepted" owner="Sam">\nKeep local files.\n</Decision>\n',
      disk: '<Decision status="Draft" owner="Lee">\nKeep local files.\n</Decision>\n',
    });
    expect(result).toMatchObject({
      status: "merged",
      content: '<Decision status="Accepted" owner="Lee">\nKeep local files.\n</Decision>\n',
    });
  });

  it("protects removal of frontmatter", () => {
    const base = "---\ntitle: Plan\n---\n# Plan\n";
    expect(mergeDocumentVersions({
      base,
      local: "# Plan\n",
      disk: `${base}\nAgent note.\n`,
    })).toMatchObject({ status: "protected", reason: "frontmatter_removed" });
  });

  it("protects unknown MDX instead of guessing", () => {
    const base = "# Report\n\n<CustomPanel mode={state.mode} />\n";
    const result = mergeDocumentVersions({
      base,
      local: `${base}\nLocal note.\n`,
      disk: base.replace("state.mode", "agent.mode"),
    });
    expect(result).toMatchObject({ status: "protected", reason: "unsupported_mdx" });
  });

  it("preserves untouched custom MDX while merging ordinary blocks around it", () => {
    const base = "# Report\n\n<CustomPanel mode={state.mode} />\n\nFirst.\n\nSecond.\n";
    const result = mergeDocumentVersions({
      base,
      local: base.replace("First.", "First from Fylune."),
      disk: base.replace("Second.", "Second from an Agent."),
    });
    expect(result).toMatchObject({ status: "merged" });
    expect(result.content).toContain("<CustomPanel mode={state.mode} />");
    expect(result.content).toContain("First from Fylune.");
    expect(result.content).toContain("Second from an Agent.");
  });

  it("protects an unclosed fenced block", () => {
    const base = "# Report\n\nSafe.\n";
    const result = mergeDocumentVersions({
      base,
      local: `${base}\nLocal.\n`,
      disk: `${base}\n\`\`\`js\nconst broken = true;\n`,
    });
    expect(result).toMatchObject({ status: "protected", reason: "parse_failed" });
  });

  it("protects large deletions", () => {
    const paragraphs = Array.from({ length: 60 }, (_, index) => `Paragraph ${index} ${"x".repeat(40)}.\n\n`).join("");
    const base = `# Long\n\n${paragraphs}`;
    const result = mergeDocumentVersions({
      base,
      local: "# Long\n\nShort replacement.\n",
      disk: `${base}\nAgent note.\n`,
    });
    expect(result).toMatchObject({ status: "protected", reason: "large_deletion" });
  });

  it("protects a destructive rewrite even in a short document", () => {
    const base = "# Plan\n\nOne.\n\nTwo.\n\nThree.\n\nFour.\n";
    const result = mergeDocumentVersions({
      base,
      local: "# Plan\n\nOne.\n",
      disk: `${base}\nAgent note.\n`,
    });
    expect(result).toMatchObject({ status: "protected", reason: "large_deletion" });
  });

  it("preserves every non-overlapping deletion and edit", () => {
    const base = "# Plan\n\nAlpha.\n\nBeta.\n\nGamma.\n\nDelta.\n";
    const result = mergeDocumentVersions({
      base,
      local: "# Plan\n\nAlpha.\n\nGamma.\n\nDelta.\n",
      disk: "# Plan\n\nAlpha.\n\nBeta.\n\nGamma updated.\n\nDelta.\n",
    });
    expect(result).toMatchObject({
      status: "merged",
      content: "# Plan\n\nAlpha.\n\nGamma updated.\n\nDelta.\n",
    });
  });

  it("preserves randomized disjoint edits deterministically", () => {
    let seed = 0xF11E;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0x1_0000_0000;
    };

    for (let run = 0; run < 80; run += 1) {
      const paragraphs = Array.from(
        { length: 12 },
        (_, index) => `Paragraph ${index} has stable source ${Math.floor(random() * 10_000)}.`,
      );
      const localIndex = Math.floor(random() * 6);
      const diskIndex = 6 + Math.floor(random() * 6);
      const base = `# Generated ${run}\n\n${paragraphs.join("\n\n")}\n`;
      const localMarker = ` Local edit ${run}.`;
      const diskMarker = ` Agent edit ${run}.`;
      const local = base.replace(
        paragraphs[localIndex],
        `${paragraphs[localIndex]}${localMarker}`,
      );
      const disk = base.replace(
        paragraphs[diskIndex],
        `${paragraphs[diskIndex]}${diskMarker}`,
      );

      const first = mergeDocumentVersions({ base, local, disk });
      const repeated = mergeDocumentVersions({ base, local, disk });
      expect(first.status).toBe("merged");
      expect(first.content).toContain(localMarker);
      expect(first.content).toContain(diskMarker);
      expect(repeated).toEqual(first);
    }
  });
});

describe("segmentMarkdown", () => {
  it("keeps fenced code atomic", () => {
    expect(segmentMarkdown("# Title\n\n```js\nconst value = 1;\n```\n\nAfter\n")).toEqual([
      "# Title\n",
      "\n",
      "```js\nconst value = 1;\n```\n",
      "\n",
      "After\n",
    ]);
  });

  it("merges a 2MB document without allocating a quadratic diff table", () => {
    const paragraphs = Array.from(
      { length: 24_000 },
      (_, index) => `Paragraph ${index}: ${"local-first ".repeat(6)}\n\n`,
    );
    const base = `# Large\n\n${paragraphs.join("")}`;
    const local = base.replace("Paragraph 100:", "Paragraph 100 updated locally:");
    const disk = base.replace("Paragraph 23000:", "Paragraph 23000 updated externally:");
    const startedAt = performance.now();
    const result = mergeDocumentVersions({ base, local, disk });
    expect(result.status).toBe("merged");
    expect(result.content).toContain("updated locally");
    expect(result.content).toContain("updated externally");
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});

describe("waitForDocumentQuiet", () => {
  it("waits for an 800ms stable hash after a save storm", async () => {
    const hashes = ["a", "b", "c", "c", "c"];
    let clock = 0;
    const result = await waitForDocumentQuiet(
      async () => ({ hash: hashes.shift() ?? "c", content: "latest" }),
      {
        quietMs: 800,
        maxMs: 2_000,
        pollMs: 400,
        now: () => clock,
        wait: async (milliseconds) => { clock += milliseconds; },
      },
    );
    expect(result).toMatchObject({ quiet: true, latest: { hash: "c", content: "latest" } });
    expect(clock).toBe(1_600);
  });

  it("reports a continuously changing file without returning stale content", async () => {
    let clock = 0;
    let generation = 0;
    const result = await waitForDocumentQuiet(
      async () => ({ hash: `h-${generation += 1}`, content: `v-${generation}` }),
      {
        quietMs: 800,
        maxMs: 1_000,
        pollMs: 200,
        now: () => clock,
        wait: async (milliseconds) => { clock += milliseconds; },
      },
    );
    expect(result.quiet).toBe(false);
    expect(result.latest.hash).toBe("h-6");
  });
});
