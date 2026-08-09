/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarUpdateButton, SoftwareUpdateSection } from "../../src/SoftwareUpdateSection.jsx";
import i18n from "../../src/i18n/index.js";

const directState = {
  distribution: "direct",
  canSelfUpdate: true,
  status: "idle",
  currentVersion: "0.1.0",
  availableVersion: null,
  releaseDate: null,
  stagingPercentage: null,
  progress: null,
  errorCode: null,
};

function updateBridge(initial = directState) {
  let state = initial;
  const listeners = new Set();
  const publish = (next) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener(state));
    return state;
  };
  return {
    getUpdateState: vi.fn(async () => state),
    checkForUpdates: vi.fn(async () => publish({
      status: "available",
      availableVersion: "0.2.0",
      releaseDate: "2026-07-23T00:00:00.000Z",
    })),
    downloadUpdate: vi.fn(async () => {
      publish({ status: "downloading", progress: 46 });
      return publish({ status: "downloaded", progress: 100 });
    }),
    installUpdate: vi.fn(async () => publish({ status: "installing" })),
    onUpdateStateChange: vi.fn((listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  };
}

describe("software update settings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("checks, downloads, and installs a direct-distribution update", async () => {
    const user = userEvent.setup();
    const bridge = updateBridge();
    render(<SoftwareUpdateSection updateBridge={bridge} />);

    expect(await screen.findByText("Version 0.1.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Fylune 0.2.0 is ready to download.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download update" }));
    expect(await screen.findByText("Fylune 0.2.0 is ready to install.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restart and install" }));
    expect(bridge.installUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByText("Restarting to install the update…")).toBeInTheDocument();
  });

  it("keeps offline failures retryable and explains that local editing still works", async () => {
    const bridge = updateBridge({
      ...directState,
      status: "error",
      errorCode: "OFFLINE",
    });
    render(<SoftwareUpdateSection updateBridge={bridge} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your local editor still works",
    );
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("shows a successful no-update check as a normal current state", async () => {
    const bridge = updateBridge({
      ...directState,
      currentVersion: "0.1.2",
      status: "not_available",
    });
    render(<SoftwareUpdateSection updateBridge={bridge} />);

    expect(await screen.findByRole("status")).toHaveTextContent("Fylune is up to date.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("delegates MAS updates to the App Store without exposing self-update actions", async () => {
    const bridge = updateBridge({
      ...directState,
      distribution: "app_store",
      canSelfUpdate: false,
      status: "disabled",
    });
    render(<SoftwareUpdateSection updateBridge={bridge} />);

    expect(await screen.findByText(
      "This copy is updated securely by the Mac App Store.",
    )).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /update|install/i })).not.toBeInTheDocument();
  });

  it("offers a sidebar download, reports progress, and prompts to restart when ready", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const bridge = updateBridge({
      ...directState,
      status: "available",
      availableVersion: "0.2.0",
    });
    render(<SidebarUpdateButton updateBridge={bridge} />);

    const download = await screen.findByRole("button", { name: /0\.1\.0 → 0\.2\.0/ });
    await user.click(download);

    expect(bridge.downloadUpdate).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: /ready to install/i })).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("shows live download progress in the sidebar", async () => {
    const bridge = updateBridge({
      ...directState,
      status: "available",
      availableVersion: "0.2.0",
    });
    render(<SidebarUpdateButton updateBridge={bridge} />);
    await screen.findByRole("button", { name: /0\.1\.0 → 0\.2\.0/ });

    act(() => {
      bridge.onUpdateStateChange.mock.calls[0][0]({
        ...directState,
        status: "downloading",
        availableVersion: "0.2.0",
        progress: 46,
      });
    });

    expect(screen.getByRole("button", { name: /46%/ })).toBeDisabled();
    expect(screen.getByText("46")).toBeInTheDocument();
  });
});
