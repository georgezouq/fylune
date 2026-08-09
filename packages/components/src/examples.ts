export const FYLUNE_EDITOR_MODES = [
  "flowchart",
  "mindmap",
  "formula",
] as const;

export type FyluneEditorMode = (typeof FYLUNE_EDITOR_MODES)[number];

export const DEFAULT_EDITOR_EXAMPLES: Readonly<
  Record<FyluneEditorMode, string>
> = Object.freeze({
  flowchart: `## Product launch

\`\`\`mermaid
flowchart LR
  Brief[Product brief] --> Review{Ready to ship?}
  Review -->|Yes| Launch[Launch]
  Review -->|Not yet| Refine[Refine the story]
  Refine --> Review
\`\`\``,
  mindmap: `## Research map

\`\`\`mermaid
mindmap
  root((Customer insight))
    Needs
      Clear ownership
      Fast feedback
    Friction
      Context switching
      Broken file paths
    Opportunity
      One calm workspace
\`\`\``,
  formula: `## Compounding clarity

Small improvements become meaningful when the feedback loop stays short.

$$
V_n = V_0(1 + r)^n
$$

Where $r$ is the improvement per review cycle.`,
});

export const DEFAULT_EDITOR_MODE_LABELS: Readonly<
  Record<FyluneEditorMode, string>
> = Object.freeze({
  flowchart: "Flowchart",
  mindmap: "Mind map",
  formula: "Formula",
});
