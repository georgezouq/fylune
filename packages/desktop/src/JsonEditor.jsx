import { json, jsonParseLinter } from "@codemirror/lang-json";
import { indentUnit } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";

import { fyluneCodeMirrorTheme } from "./codeMirrorTheme.js";
import "./jsonEditor.css";

export function jsonLinesLinter(view) {
  const diagnostics = [];

  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    const line = view.state.doc.line(number);
    if (!line.text.trim()) continue;

    try {
      JSON.parse(line.text);
    } catch (error) {
      diagnostics.push({
        from: line.from,
        to: Math.max(line.from + 1, line.to),
        severity: "error",
        message: error?.message || `Invalid JSON on line ${number}`,
      });
    }
  }

  return diagnostics;
}

export function JsonCodeEditor({
  value = "",
  onChange,
  onBlur,
  onSave,
  readOnly = false,
  jsonLines = false,
  ariaLabel = "JSON editor",
}) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const callbacksRef = useRef({ onBlur, onChange, onSave });
  const initialValueRef = useRef(value);
  const readOnlyRef = useRef(new Compartment());
  const initialReadOnlyRef = useRef(readOnly);
  const syncingRef = useRef(false);
  callbacksRef.current = { onBlur, onChange, onSave };

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const lintSource = jsonLines ? jsonLinesLinter : jsonParseLinter();
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          basicSetup,
          json(),
          indentUnit.of("  "),
          fyluneCodeMirrorTheme,
          linter(lintSource, { delay: 250 }),
          lintGutter(),
          EditorView.contentAttributes.of({
            "aria-label": ariaLabel,
            "aria-multiline": "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !syncingRef.current) {
              callbacksRef.current.onChange?.(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              callbacksRef.current.onBlur?.();
              return false;
            },
          }),
          keymap.of([{
            key: "Mod-s",
            run: () => {
              callbacksRef.current.onSave?.();
              return true;
            },
          }]),
          readOnlyRef.current.of(EditorState.readOnly.of(initialReadOnlyRef.current)),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel, jsonLines]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    syncingRef.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    syncingRef.current = false;
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyRef.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return <div className="json-code-editor" ref={hostRef} />;
}
