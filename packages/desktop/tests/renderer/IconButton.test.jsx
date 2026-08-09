/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "../../src/design-system/IconButton.jsx";

describe("IconButton", () => {
  it("provides one consistent accessible icon action", () => {
    const onClick = vi.fn();
    const ref = createRef();

    render(
      <IconButton ref={ref} label="Close preview" className="preview-close" onClick={onClick}>
        <span aria-hidden="true">×</span>
      </IconButton>,
    );

    const button = screen.getByRole("button", { name: "Close preview" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("title", "Close preview");
    expect(button).toHaveClass("icon-button", "preview-close");
    expect(ref.current).toBe(button);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
