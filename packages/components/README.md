# `@fylune/components`

Reusable client-side editor surfaces for Fylune products. The package keeps the
source as ordinary Markdown and previews a deliberately limited syntax surface:
GFM, strict Mermaid diagrams, and untrusted KaTeX formulas. It does not execute
MDX, raw HTML, JavaScript, remote imports, or remote images.

## Use

```tsx
import { FyluneEditor } from "@fylune/components";
import "@fylune/components/styles.css";

export function DiagramTool() {
  return (
    <FyluneEditor
      defaultMode="flowchart"
      onChange={(markdown, mode) => {
        console.log({ markdown, mode });
      }}
    />
  );
}
```

Use `value` plus `onChange` for a controlled editor, or `defaultValue` for an
uncontrolled editor. `mode` and `onModeChange` follow the same pattern. In
uncontrolled mode, Flowchart, Mind map, and Formula each retain their own draft.

The default `theme="inherit"` follows the host `color-scheme`, a parent
`data-theme="light|dark"`, or a `.light` / `.dark` class. Set `theme` explicitly
when the editor should remain pinned to one appearance.

## Commands

```sh
pnpm --filter @fylune/components test
pnpm --filter @fylune/components typecheck
pnpm --filter @fylune/components build
```
