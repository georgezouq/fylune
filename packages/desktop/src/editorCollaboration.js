import {
  codeBlockEditorDescriptors$,
  defaultCodeBlockLanguage$,
  directiveDescriptors$,
  importMarkdownToLexical,
  importVisitors$,
  jsxComponentDescriptors$,
  markdown$,
  markdownProcessingError$,
  mdastExtensions$,
  muteChange$,
  realmPlugin,
  rootEditor$,
  syntaxExtensions$,
} from "@mdxeditor/editor";
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  HISTORIC_TAG,
} from "lexical";

const CONTEXT_CHARS = 36;

function topLevelNode(node) {
  let current = node;
  while (current?.getParent?.() && current.getParent().getKey() !== "root") {
    current = current.getParent();
  }
  return current?.getKey?.() === "root" ? null : current;
}

function textOffsetWithin(block, point) {
  if (!block) return 0;
  const textNodes = block.getAllTextNodes();
  if (point.type === "text") {
    let offset = 0;
    for (const node of textNodes) {
      if (node.getKey() === point.key) return offset + Math.min(point.offset, node.getTextContentSize());
      offset += node.getTextContentSize();
    }
    return offset;
  }
  const pointNode = point.getNode();
  const children = pointNode.getChildren?.() ?? [];
  return children.slice(0, point.offset).reduce((total, child) => total + child.getTextContentSize(), 0);
}

function capturePoint(point, blocks) {
  const block = topLevelNode(point.getNode());
  const blockIndex = block ? blocks.findIndex((candidate) => candidate.getKey() === block.getKey()) : 0;
  const text = block?.getTextContent?.() ?? "";
  const offset = Math.min(text.length, textOffsetWithin(block, point));
  return {
    blockIndex: Math.max(0, blockIndex),
    text,
    offset,
    before: text.slice(Math.max(0, offset - CONTEXT_CHARS), offset),
    after: text.slice(offset, offset + CONTEXT_CHARS),
    previous: blocks[blockIndex - 1]?.getTextContent?.() ?? null,
    next: blocks[blockIndex + 1]?.getTextContent?.() ?? null,
  };
}

function captureSelection() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const blocks = $getRoot().getChildren();
  return {
    anchor: capturePoint(selection.anchor, blocks),
    focus: capturePoint(selection.focus, blocks),
  };
}

function findBlock(marker, blocks) {
  let best = null;
  blocks.forEach((block, index) => {
    const text = block.getTextContent();
    let score = -Math.abs(index - marker.blockIndex);
    if (text === marker.text) score += 1_000;
    if (marker.previous && blocks[index - 1]?.getTextContent() === marker.previous) score += 80;
    if (marker.next && blocks[index + 1]?.getTextContent() === marker.next) score += 80;
    if (marker.before && text.includes(marker.before)) score += 160;
    if (marker.after && text.includes(marker.after)) score += 160;
    if (!best || score > best.score) best = { block, score };
  });
  return best?.block ?? blocks[Math.min(marker.blockIndex, Math.max(0, blocks.length - 1))] ?? null;
}

function restoredOffset(marker, text) {
  if (marker.before) {
    const beforeIndex = text.indexOf(marker.before);
    if (beforeIndex >= 0) return beforeIndex + marker.before.length;
  }
  if (marker.after) {
    const afterIndex = text.indexOf(marker.after);
    if (afterIndex >= 0) return afterIndex;
  }
  return Math.min(marker.offset, text.length);
}

function restorePoint(point, marker, blocks) {
  const block = findBlock(marker, blocks);
  if (!block) {
    point.set("root", 0, "element");
    return;
  }
  const text = block.getTextContent();
  let remaining = restoredOffset(marker, text);
  const textNodes = block.getAllTextNodes();
  for (const node of textNodes) {
    const size = node.getTextContentSize();
    if (remaining <= size) {
      point.set(node.getKey(), remaining, "text");
      return;
    }
    remaining -= size;
  }
  point.set(block.getKey(), block.getChildrenSize?.() ?? 0, "element");
}

function restoreSelection(marker) {
  if (!marker) return;
  const blocks = $getRoot().getChildren();
  const selection = $createRangeSelection();
  restorePoint(selection.anchor, marker.anchor, blocks);
  restorePoint(selection.focus, marker.focus, blocks);
  $setSelection(selection);
}

function importMarkdown(realm, markdown) {
  importMarkdownToLexical({
    root: $getRoot(),
    visitors: realm.getValue(importVisitors$),
    mdastExtensions: realm.getValue(mdastExtensions$),
    markdown,
    syntaxExtensions: realm.getValue(syntaxExtensions$),
    jsxComponentDescriptors: realm.getValue(jsxComponentDescriptors$),
    directiveDescriptors: realm.getValue(directiveDescriptors$),
    codeBlockEditorDescriptors: realm.getValue(codeBlockEditorDescriptors$),
    defaultCodeBlockLanguage: realm.getValue(defaultCodeBlockLanguage$),
  });
}

/**
 * Applies a reconciled external version as a Lexical transaction.
 *
 * `MDXEditor.setMarkdown()` clears the root and focuses the editor, which
 * resets selection and becomes an ordinary undo step. This adapter captures a
 * semantic selection marker, imports the merged Markdown under HISTORIC_TAG,
 * restores the nearest matching block, and mutes the normal local-save signal.
 */
export const editorCollaborationPlugin = realmPlugin({
  postInit(realm, params) {
    const controllerRef = params?.controllerRef;
    if (!controllerRef) return;
    controllerRef.current = {
      isComposing() {
        return Boolean(realm.getValue(rootEditor$)?.isComposing());
      },
      apply(markdown, { highlight = false } = {}) {
        const editor = realm.getValue(rootEditor$);
        if (!editor || editor.isComposing()) return false;
        const previousState = editor.getEditorState();
        let changedKeys = [];
        realm.pub(muteChange$, true);
        try {
          editor.update(() => {
            const selection = captureSelection();
            const previousBlocks = $getRoot().getChildren().map((block) => block.getTextContent());
            $getRoot().clear();
            importMarkdown(realm, markdown);
            if (highlight) {
              changedKeys = $getRoot().getChildren()
                .filter((block, index) => block.getTextContent() !== previousBlocks[index])
                .map((block) => block.getKey());
            }
            restoreSelection(selection);
          }, {
            tag: HISTORIC_TAG,
            onUpdate: () => {
              realm.pub(markdown$, markdown);
              realm.pub(markdownProcessingError$, null);
              realm.pub(muteChange$, false);
              if (changedKeys.length) {
                window.requestAnimationFrame(() => {
                  for (const key of changedKeys) editor.getElementByKey(key)?.classList.add("fylune-external-change");
                  window.setTimeout(() => {
                    for (const key of changedKeys) editor.getElementByKey(key)?.classList.remove("fylune-external-change");
                  }, 3_000);
                });
              }
            },
          });
          return true;
        } catch (error) {
          editor.setEditorState(previousState, { tag: HISTORIC_TAG });
          realm.pub(muteChange$, false);
          throw error;
        }
      },
    };
  },
  update(_realm, params) {
    if (params?.controllerRef?.current) return;
  },
});
