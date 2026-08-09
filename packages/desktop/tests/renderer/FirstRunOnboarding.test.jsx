/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FirstRunOnboarding } from "../../src/FirstRunOnboarding.jsx";

describe("first run onboarding", () => {
  it("explains the local folder model and opens the native folder chooser", async () => {
    const user = userEvent.setup();
    const onOpenProject = vi.fn();
    const onCreateProject = vi.fn();
    render(
      <FirstRunOnboarding
        onCreateProject={onCreateProject}
        onOpenProject={onOpenProject}
      />,
    );

    expect(screen.getByRole("heading", { name: "Welcome to Fylune" })).toBeInTheDocument();
    expect(screen.getByText("Choose or create a local project folder to use as your Fylune workspace.")).toBeInTheDocument();
    expect(screen.getByText("Your files stay on this device. No account is required.")).toBeInTheDocument();
    expect(screen.getByText("Markdown · MDX")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose a folder" }));
    expect(onOpenProject).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Create a new workspace" }));
    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it("keeps both actions unavailable while a folder opens or a workspace is created", () => {
    const { rerender } = render(
      <FirstRunOnboarding
        busyAction="open"
        onCreateProject={() => {}}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Opening folder…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create a new workspace" })).toBeDisabled();

    rerender(
      <FirstRunOnboarding
        busyAction="create"
        onCreateProject={() => {}}
        onOpenProject={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Choose a folder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Creating workspace…" })).toBeDisabled();
  });
});
