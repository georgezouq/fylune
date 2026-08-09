/* eslint-disable no-unused-vars -- the base ESLint config does not mark JSX references as usage */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WelcomeLoginModal } from "../../src/WelcomeLoginModal.jsx";

describe("welcome login modal", () => {
  it("keeps local editing available when the user skips sign-in", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <WelcomeLoginModal
        authBridge={{ signIn: vi.fn() }}
        onComplete={onComplete}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Use Fylune locally or sign in" })).toBeInTheDocument();
    expect(screen.getByText("You can open, edit, and search your files without an account.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Continue without an account" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Continue without an account" }));
    expect(onComplete).toHaveBeenCalledWith("skipped");
  });

  it("signs in with email and password", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const signIn = vi.fn().mockResolvedValue({ user: { id: "user-1", email: "hello@fylune.com" } });
    render(
      <WelcomeLoginModal
        authBridge={{ signIn }}
        onComplete={onComplete}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Email" }), "hello@fylune.com");
    await user.type(screen.getByLabelText("Password"), "local-password");
    await user.click(screen.getByRole("button", { name: "Sign in to Fylune" }));
    expect(signIn).toHaveBeenCalledWith({ email: "hello@fylune.com", password: "local-password" });
    expect(onComplete).toHaveBeenCalledWith({
      status: "signed-in",
      session: { user: { id: "user-1", email: "hello@fylune.com" } },
    });
  });

  it("keeps every dismiss action available while sign-in is pending", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const signIn = vi.fn(() => new Promise(() => {}));
    render(
      <WelcomeLoginModal
        authBridge={{ signIn }}
        onComplete={onComplete}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Email" }), "hello@fylune.com");
    await user.type(screen.getByLabelText("Password"), "local-password");
    await user.click(screen.getByRole("button", { name: "Sign in to Fylune" }));

    expect(screen.getByRole("button", { name: "Please wait…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue without an account" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Continue without an account" }));
    await user.keyboard("{Escape}");
    expect(onComplete).toHaveBeenCalledTimes(3);
    expect(onComplete).toHaveBeenNthCalledWith(1, "skipped");
    expect(onComplete).toHaveBeenNthCalledWith(2, "skipped");
    expect(onComplete).toHaveBeenNthCalledWith(3, "skipped");
  });
});
