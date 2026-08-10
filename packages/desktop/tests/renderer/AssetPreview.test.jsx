/* eslint-disable no-unused-vars -- JSX references are not marked as usage by the base config */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { AssetPreview } from "../../src/AssetPreview.jsx";

it("reveals the current resource from the shared file-details menu", async () => {
  const user = userEvent.setup();
  const onReveal = vi.fn();
  render(
    <AssetPreview
      item={{ id: "asset-cover", title: "launch-cover.png", path: "Assets/launch-cover.png", type: "image", size: 103424 }}
      src="data:image/png;base64,iVBORw0KGgo="
      onBack={vi.fn()}
      onReveal={onReveal}
    />,
  );

  const preview = screen.getByRole("region", { name: "Previewing launch-cover.png" });
  expect(preview.querySelector(":scope > .preview-toolbar")).toBeInTheDocument();
  expect(preview.querySelector(":scope > .asset-preview-content")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "More preview options" }));
  const details = screen.getByRole("dialog", { name: "File details for launch-cover.png" });
  expect(within(details).getByText("101 KB")).toBeInTheDocument();

  await user.click(within(details).getByRole("button", { name: "Show in folder" }));
  expect(onReveal).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog", { name: "File details for launch-cover.png" })).not.toBeInTheDocument();
});

it("zooms, resets, and enters and exits fullscreen from the image toolbar", async () => {
  const user = userEvent.setup();
  render(
    <AssetPreview
      item={{ id: "asset-cover", title: "launch-cover.png", path: "Assets/launch-cover.png", type: "image", size: 103424 }}
      src="data:image/png;base64,iVBORw0KGgo="
      onBack={vi.fn()}
      onReveal={vi.fn()}
    />,
  );

  const preview = screen.getByRole("region", { name: "Previewing launch-cover.png" });
  const stage = screen.getByTestId("image-preview");
  const image = screen.getByRole("img", { name: "launch-cover.png" });
  Object.defineProperties(stage, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
    scrollWidth: { configurable: true, value: 800 },
    scrollHeight: { configurable: true, value: 600 },
  });
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 1600 },
    naturalHeight: { configurable: true, value: 1200 },
  });
  fireEvent(window, new Event("resize"));
  fireEvent.load(image);

  expect(stage).toHaveAttribute("data-zoom", "100");
  await waitFor(() => expect(image).toHaveStyle({ width: "800px", height: "600px" }));

  await user.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(stage).toHaveAttribute("data-zoom", "110");
  expect(image).toHaveStyle({ width: "880px", height: "660px" });

  await user.click(screen.getByRole("button", { name: "Fit to window" }));
  expect(stage).toHaveAttribute("data-zoom", "100");
  expect(image).toHaveStyle({ width: "800px", height: "600px" });

  const requestFullscreen = vi.fn(async () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: preview });
    fireEvent(document, new Event("fullscreenchange"));
  });
  const exitFullscreen = vi.fn(async () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    fireEvent(document, new Event("fullscreenchange"));
  });
  Object.defineProperty(preview, "requestFullscreen", { configurable: true, value: requestFullscreen });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });

  await user.click(screen.getByRole("button", { name: "Enter fullscreen" }));
  expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Exit fullscreen" })).toHaveAttribute("aria-pressed", "true"));

  await user.click(screen.getByRole("button", { name: "Exit fullscreen" }));
  expect(exitFullscreen).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.getByRole("button", { name: "Enter fullscreen" })).toHaveAttribute("aria-pressed", "false"));
});

it("zooms around the pointer while preserving ordinary wheel scrolling", () => {
  render(
    <AssetPreview
      item={{ id: "asset-cover", title: "launch-cover.png", path: "Assets/launch-cover.png", type: "image", size: 103424 }}
      src="data:image/png;base64,iVBORw0KGgo="
      onBack={vi.fn()}
      onReveal={vi.fn()}
    />,
  );

  const stage = screen.getByTestId("image-preview");
  Object.defineProperties(stage, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
    scrollWidth: { configurable: true, value: 800 },
    scrollHeight: { configurable: true, value: 600 },
  });
  stage.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600, right: 900, bottom: 650, x: 100, y: 50, toJSON: () => {} });

  const ordinaryWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
  expect(fireEvent(stage, ordinaryWheel)).toBe(true);
  expect(stage).toHaveAttribute("data-zoom", "100");

  const zoomWheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 500,
    clientY: 350,
    ctrlKey: true,
    deltaY: -100,
  });
  expect(fireEvent(stage, zoomWheel)).toBe(false);
  expect(stage).toHaveAttribute("data-zoom", "116.2");
  expect(screen.getByRole("button", { name: "Fit to window" })).toHaveTextContent("116%");
});

it("pans an enlarged image by dragging the preview surface", () => {
  render(
    <AssetPreview
      item={{ id: "asset-cover", title: "launch-cover.png", path: "Assets/launch-cover.png", type: "image", size: 103424 }}
      src="data:image/png;base64,iVBORw0KGgo="
      onBack={vi.fn()}
      onReveal={vi.fn()}
    />,
  );

  const stage = screen.getByTestId("image-preview");
  Object.defineProperties(stage, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
    scrollWidth: { configurable: true, value: 1600 },
    scrollHeight: { configurable: true, value: 1200 },
  });
  stage.scrollLeft = 120;
  stage.scrollTop = 80;
  stage.setPointerCapture = vi.fn();
  stage.releasePointerCapture = vi.fn();

  fireEvent.pointerDown(stage, { button: 0, clientX: 300, clientY: 260, pointerId: 7 });
  fireEvent.pointerMove(stage, { clientX: 230, clientY: 200, pointerId: 7 });
  expect(stage.scrollLeft).toBe(190);
  expect(stage.scrollTop).toBe(140);
  expect(stage).toHaveClass("is-dragging");

  fireEvent.pointerUp(stage, { pointerId: 7 });
  expect(stage).not.toHaveClass("is-dragging");
  expect(stage.setPointerCapture).toHaveBeenCalledWith(7);
  expect(stage.releasePointerCapture).toHaveBeenCalledWith(7);
});
