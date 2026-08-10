# Fylune desktop design system

The desktop design system contains primitives that are reused across distinct
product surfaces. Business-specific components stay beside their feature.

## Tokens

`tokens.css` is the source of truth for desktop semantic colors, typography,
control radii, and interaction timing. Components consume semantic roles such
as `--surface`, `--ink`, `--primary`, and `--danger`; they do not introduce new
hard-coded theme colors.

Light and dark values live under the same semantic names. New tokens should be
added only when at least three uses share the same intent.

## IconButton

Use `IconButton` for compact actions represented by a single Phosphor icon. It
always provides `type="button"`, an accessible name, and matching native hover
text. Pass a localized `label`; use `className` only for contextual sizing or
state.

```jsx
import { IconButton } from "./design-system/index.js";

<IconButton label={t("common.close")} onClick={onClose}>
  <X />
</IconButton>
```
