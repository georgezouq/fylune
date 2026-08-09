export const demoProject = {
  id: "project-fylune",
  name: "Fylune Launch",
  path: "~/Documents/Fylune Launch",
  tree: [
    {
      id: "folder-product",
      name: "Product",
      type: "folder",
      expanded: false,
      children: [
        { id: "doc-brief", name: "Product brief.mdx", type: "file" },
        { id: "doc-roadmap", name: "Launch roadmap.md", type: "file" },
        { id: "doc-guidelines", name: "Editing guidelines.md", type: "file" },
        {
          id: "folder-planning",
          name: "Planning",
          type: "folder",
          expanded: false,
          children: [
            { id: "asset-release-timeline", name: "release-timeline.pdf", type: "pdf" },
          ],
        },
      ],
    },
    {
      id: "folder-research",
      name: "Research",
      type: "folder",
      expanded: false,
      children: [
        { id: "doc-interviews", name: "Customer interviews.md", type: "file" },
        { id: "doc-craft", name: "Craft teardown.md", type: "file" },
      ],
    },
    {
      id: "folder-assets",
      name: "Assets",
      type: "folder",
      expanded: false,
      children: [
        { id: "asset-cover", name: "launch-cover.png", type: "image" },
        { id: "asset-plan", name: "Launch budget.xlsx", type: "excel" },
      ],
    },
    { id: "doc-readme", name: "README.md", type: "file" },
  ],
};

export const demoDocuments = [
  {
    id: "doc-brief",
    title: "Product brief",
    path: "Product / Product brief.mdx",
    modified: "2 min ago",
    starred: true,
    kind: "brief",
    description: "A private, local document workspace designed around people who work with AI agents.",
    section: "The document is the interface",
    words: 1284,
  },
  {
    id: "doc-roadmap",
    title: "Launch roadmap",
    path: "Product / Launch roadmap.md",
    modified: "18 min ago",
    starred: false,
    kind: "roadmap",
    description: "A six-week plan from local-file safety to a calm, useful closed alpha.",
    section: "Alpha milestones",
    words: 846,
  },
  {
    id: "doc-interviews",
    title: "Customer interviews",
    path: "Research / Customer interviews.md",
    modified: "Yesterday",
    starred: true,
    kind: "research",
    description: "Patterns from product managers who edit agent-generated project documents every day.",
    section: "What breaks their flow",
    words: 2130,
  },
  {
    id: "doc-craft",
    title: "Craft teardown",
    path: "Research / Craft teardown.md",
    modified: "Yesterday",
    starred: false,
    kind: "teardown",
    description: "Notes on navigation density, document hierarchy, writing focus, and Mac-native material.",
    section: "Patterns worth keeping",
    words: 1116,
  },
  {
    id: "doc-guidelines",
    title: "Editing guidelines",
    path: "Product / Editing guidelines.md",
    modified: "Jul 19",
    starred: false,
    kind: "guidelines",
    description: "Safe editing conventions for ordinary project files and external tools.",
    section: "Keep local files authoritative",
    words: 592,
  },
  {
    id: "doc-readme",
    title: "Project README",
    path: "README.md",
    modified: "Jul 18",
    starred: false,
    kind: "readme",
    description: "How this project is arranged and how other tools can safely work with the same files.",
    section: "Ordinary files, everywhere",
    words: 734,
  },
];

export const demoSnapshots = [
  {
    id: "snapshot-1",
    createdAt: "2026-07-30T10:42:00.000Z",
    source: "before-external-update",
    changes: { added: 2, removed: 1 },
  },
  {
    id: "snapshot-2",
    createdAt: "2026-07-30T09:18:00.000Z",
    source: "before-fylune-save",
    changes: { added: 1, removed: 0 },
  },
  {
    id: "snapshot-3",
    createdAt: "2026-07-29T16:36:00.000Z",
    source: "before-fylune-save",
    changes: { added: 2, removed: 0 },
  },
];

export const externalChanges = [
  {
    id: "change-1",
    section: "Audience",
    current: "Product managers who already use AI agents to draft planning documents.",
    external: "Product managers, researchers, and growth operators who use AI agents inside local project folders.",
  },
  {
    id: "change-2",
    section: "First release",
    current: "The first release focuses on calm editing and automatic image paths.",
    external: "The first release focuses on safe editing, automatic image paths, and reviewable external changes.",
  },
  {
    id: "change-3",
    section: "Success signal",
    current: "People choose Fylune for weekly planning documents.",
    external: "People keep project documents open in Fylune while AI agents work on the same ordinary files.",
  },
];

export const demoDocumentBody = {
  kicker: "Local-first document workspace",
  title: "Product brief",
  intro:
    "Fylune is a private document workspace for people who build products with AI. It gives ordinary local files the calm writing experience they deserve, while every agent and tool continues to work with the same project.",
  audience:
    "Product managers, researchers, and growth operators use Fylune to read and refine AI-generated work without opening an IDE or managing Markdown syntax.",
  principle:
    "The local file is always the source of truth. Accounts are optional and never required for opening or editing a project.",
};

export const demoMarkdown = `# Product brief

Fylune is a private document workspace for people who build products with AI. It gives ordinary local files the calm writing experience they deserve, while every agent and tool continues to work with the same project.

## Who it is for

Product managers, researchers, and growth operators use Fylune to read and refine AI-generated work without opening an IDE or managing Markdown syntax.

## Product principle

The local file is always the source of truth. Accounts are optional and never required for opening or editing a project.

### First release

- Open a real project folder and understand its structure.
- Edit Markdown and MDX in a calm document surface.
- Import images without managing relative paths.
- Review external changes before they overwrite current work.
`;

/**
 * A small workbook for the demo project, in the same shape the main process produces
 * from a real `.xlsx`. It exists so the demo workspace shows what a spreadsheet looks
 * like in Fylune without a project folder on disk.
 */
export const demoWorkbook = {
  path: "Assets/Launch budget.xlsx",
  hash: "0".repeat(64),
  mtimeMs: 0,
  size: 18432,
  repaired: false,
  styles: [
    { bold: true, size: 13, color: "#1f4e79", background: "#ddebf7", align: "left" },
    { bold: true, align: "left" },
    { align: "right" },
    { align: "left" },
    { bold: true, align: "right", borders: { top: "1px solid #b0b0b0" } },
    { bold: true, align: "left", borders: { top: "1px solid #b0b0b0" } },
  ],
  sheets: [
    {
      id: 1,
      name: "Budget",
      hidden: false,
      rowCount: 7,
      columnCount: 3,
      columnWidths: [188, 118, 104],
      rowHeights: [30, 24, 22, 22, 22, 22, 24],
      defaultColumnWidth: 64,
      defaultRowHeight: 20,
      frozen: { rows: 2, columns: 1 },
      merges: [[1, 1, 1, 3]],
      cells: {
        "1,1": { text: "Launch budget", input: "Launch budget", kind: "string", style: 0 },
        "2,1": { text: "Workstream", input: "Workstream", kind: "string", style: 1 },
        "2,2": { text: "Owner", input: "Owner", kind: "string", style: 1 },
        "2,3": { text: "Spend", input: "Spend", kind: "string", style: 1 },
        "3,1": { text: "Preview surfaces", input: "Preview surfaces", kind: "string", style: 3 },
        "3,2": { text: "Platform", input: "Platform", kind: "string", style: 3 },
        "3,3": { text: "$42,000", input: "42000", kind: "number", style: 2, numFmt: '"$"#,##0' },
        "4,1": { text: "Design QA", input: "Design QA", kind: "string", style: 3 },
        "4,2": { text: "Design", input: "Design", kind: "string", style: 3 },
        "4,3": { text: "$11,500", input: "11500", kind: "number", style: 2, numFmt: '"$"#,##0' },
        "5,1": { text: "Beta support", input: "Beta support", kind: "string", style: 3 },
        "5,2": { text: "Growth", input: "Growth", kind: "string", style: 3 },
        "5,3": { text: "$8,250", input: "8250", kind: "number", style: 2, numFmt: '"$"#,##0' },
        "6,1": { text: "Total", input: "Total", kind: "string", style: 5 },
        "6,3": { text: "$61,750", input: "=SUM(C3:C5)", kind: "formula", formula: "SUM(C3:C5)", style: 4, numFmt: '"$"#,##0' },
      },
      truncated: false,
    },
    {
      id: 2,
      name: "Notes",
      hidden: false,
      rowCount: 2,
      columnCount: 1,
      columnWidths: [340],
      rowHeights: [22, 22],
      defaultColumnWidth: 64,
      defaultRowHeight: 20,
      frozen: null,
      merges: [],
      cells: {
        "1,1": { text: "Figures are indicative until the vendor quotes land.", input: "Figures are indicative until the vendor quotes land.", kind: "string" },
      },
      truncated: false,
    },
  ],
};
