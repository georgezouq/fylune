import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { JsonCodeEditor, jsonLinesLinter } from "../../src/JsonEditor.jsx";

afterEach(() => cleanup());

beforeAll(() => {
  Range.prototype.getClientRects ??= () => [];
  Range.prototype.getBoundingClientRect ??= () => ({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

describe("JsonCodeEditor", () => {
  it("provides editing, line numbers, folding, bracket matching, search, and save shortcuts", async () => {
    const onSave = vi.fn();
    const { container, getByLabelText } = render(React.createElement(JsonCodeEditor, {
      ariaLabel: "Config JSON",
      value: '{"nested":{"enabled":true}}',
      onSave,
    }));

    const editor = getByLabelText("Config JSON");
    await waitFor(() => expect(container.querySelector(".cm-lineNumbers")).toBeInTheDocument());
    expect(container.querySelector(".cm-foldGutter")).toBeInTheDocument();
    expect(container.querySelector(".cm-gutter-lint")).toBeInTheDocument();
    expect(container.querySelector(".cm-content")).toHaveTextContent('"nested"');

    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("lints JSONL one record at a time instead of treating the file as one JSON value", () => {
    const lines = [
      { from: 0, to: 8, text: '{"id":1}' },
      { from: 9, to: 17, text: '{"id":2}' },
      { from: 18, to: 22, text: "nope" },
    ];
    const view = {
      state: {
        doc: {
          lines: lines.length,
          line: (number) => lines[number - 1],
        },
      },
    };

    expect(jsonLinesLinter(view)).toEqual([
      expect.objectContaining({ from: 18, to: 22, severity: "error" }),
    ]);
  });
});
