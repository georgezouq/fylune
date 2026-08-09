/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { ImageReferenceToolbar } from "../../src/DocumentImageToolbar.jsx";

it("edits an image reference and replaces it from the selected-image toolbar", async () => {
  const user = userEvent.setup();
  const onApply = vi.fn().mockResolvedValue(undefined);
  const onChoose = vi.fn().mockResolvedValue("../assets/replacement.png");
  const onDelete = vi.fn();
  render(
    <ImageReferenceToolbar
      source="./images/missing.png"
      onApply={onApply}
      onChoose={onChoose}
      onDelete={onDelete}
    />,
  );

  const address = screen.getByRole("textbox", { name: "Image reference address" });
  expect(address).toHaveValue("./images/missing.png");
  await user.clear(address);
  await user.type(address, "../images/restored.png{Enter}");
  expect(onApply).toHaveBeenCalledWith("../images/restored.png");

  await user.click(screen.getByRole("button", { name: "Choose image" }));
  await waitFor(() => expect(onChoose).toHaveBeenCalledWith());
  await waitFor(() => expect(onApply).toHaveBeenLastCalledWith("../assets/replacement.png"));
  expect(address).toHaveValue("../assets/replacement.png");

  await user.click(screen.getByRole("button", { name: "Delete image" }));
  expect(onDelete).toHaveBeenCalledOnce();
});
