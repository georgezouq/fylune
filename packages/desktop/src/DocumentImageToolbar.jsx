/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isImageNode } from "@mdxeditor/editor";
import { Check, FolderOpen, Trash } from "@phosphor-icons/react";
import { $createNodeSelection, $getNodeByKey, $getSelection, $isNodeSelection, $setSelection } from "lexical";
import { useDismissibleLayer } from "./useDismissibleLayer.js";

export function ImageReferenceToolbar({ source, onApply, onChoose, onDelete, toolbarRef, visible = true }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(source);
  const [committed, setCommitted] = useState(source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(source);
    setCommitted(source);
    setError("");
  }, [source]);

  const apply = useCallback(async (value = draft) => {
    const next = value.trim();
    if (!next) {
      setError(t("image.pathRequired"));
      return false;
    }
    try {
      await onApply(next);
      setDraft(next);
      setCommitted(next);
      setError("");
      return true;
    } catch (nextError) {
      setError(nextError?.message || t("image.updateFailed"));
      return false;
    }
  }, [draft, onApply, t]);

  async function chooseReplacement() {
    setBusy(true);
    setError("");
    try {
      const nextSource = await onChoose();
      if (nextSource) await apply(nextSource);
    } catch (nextError) {
      setError(nextError?.message || t("image.chooseFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={toolbarRef}
      className={`fylune-image-toolbar-wrap${visible ? " is-open" : ""}`}
      aria-hidden={!visible}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="fylune-image-toolbar" role="toolbar" aria-label={t("image.options")}>
        <label className="image-reference-field">
          <span className="visually-hidden">{t("image.reference")}</span>
          <input
            value={draft}
            aria-label={t("image.reference")}
            title={draft}
            spellCheck="false"
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            onBlur={() => {
              if (draft.trim() && draft.trim() !== committed) void apply();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void apply();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setDraft(committed);
                setError("");
              }
            }}
          />
        </label>
        <button
          className="image-reference-apply"
          type="button"
          aria-label={t("image.update")}
          title={t("image.update")}
          disabled={busy || !draft.trim() || draft.trim() === committed}
          onClick={() => void apply()}
        >
          <Check />
        </button>
        <span className="image-toolbar-divider" aria-hidden="true" />
        <button className="image-reselect-button" type="button" disabled={busy} onClick={() => void chooseReplacement()}>
          <FolderOpen />
          <span>{busy ? t("image.adding") : t("image.choose")}</span>
        </button>
        <button className="image-delete-button" type="button" aria-label={t("image.delete")} title={t("image.delete")} disabled={busy} onClick={onDelete}>
          <Trash />
        </button>
      </div>
      {error ? <span className="image-reference-error" role="status">{error}</span> : null}
    </div>
  );
}

export function DocumentImageToolbar({ nodeKey, imageSource, initialImagePath, onChooseImage }) {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const toolbarRef = useRef(null);
  const source = editor.getEditorState().read(() => {
    const node = $getNodeByKey(nodeKey);
    return $isImageNode(node) ? node.getSrc() : initialImagePath || imageSource;
  });
  const [open, setOpen] = useState(() => editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isNodeSelection(selection) && selection.getNodes().some((node) => node.getKey() === nodeKey);
  }));

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    const selected = editorState.read(() => {
      const selection = $getSelection();
      return $isNodeSelection(selection) && selection.getNodes().some((node) => node.getKey() === nodeKey);
    });
    if (selected) setOpen(true);
  }), [editor, nodeKey]);

  useDismissibleLayer({
    open,
    onDismiss: () => setOpen(false),
    insideRefs: [toolbarRef],
    isEventInside: (event) => {
      const imageElement = editor.getElementByKey(nodeKey);
      const insideToolbar = event.composedPath?.().some((element) => (
        element === toolbarRef.current || element?.classList?.contains?.("fylune-image-toolbar-wrap")
      ));
      return Boolean(imageElement?.contains(event.target) || insideToolbar);
    },
  });

  const applySource = useCallback((nextSource) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!$isImageNode(node)) throw new Error(t("image.missing"));
      node.setSrc(nextSource);
      const selection = $createNodeSelection();
      selection.add(nodeKey);
      $setSelection(selection);
    });
  }, [editor, nodeKey, t]);

  const chooseImage = useCallback(async () => {
    const result = await onChooseImage();
    return result?.markdownUrl || result?.path || null;
  }, [onChooseImage]);

  const deleteImage = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isImageNode(node)) node.remove();
    });
  }, [editor, nodeKey]);

  return <ImageReferenceToolbar toolbarRef={toolbarRef} visible={open} source={source} onApply={applySource} onChoose={chooseImage} onDelete={deleteImage} />;
}
