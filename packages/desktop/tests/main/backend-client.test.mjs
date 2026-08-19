import { describe, expect, it, vi } from "vitest";

import { BackendClient } from "../../electron/lib/backend-client.mjs";

const session = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: { id: "user-1", email: "user@example.com", name: "User" },
};

describe("backend account client", () => {
  it("requires HTTPS outside local development", () => {
    expect(() => new BackendClient({ baseUrl: "http://api.fylune.test" })).toThrow("must use HTTPS");
    expect(() => new BackendClient({ baseUrl: "http://127.0.0.1:4318" })).not.toThrow();
  });

  it("works offline without loading or calling the backend until account access is requested", async () => {
    const load = vi.fn(async () => null);
    const fetchImpl = vi.fn();
    const backend = new BackendClient({
      baseUrl: "https://api.fylune.test",
      fetchImpl,
      tokenVault: { load },
    });

    expect(load).not.toHaveBeenCalled();
    await expect(backend.getSession()).resolves.toMatchObject({
      user: { id: "local", accountType: "GUEST", offline: true },
    });
    expect(load).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("registers and persists the returned account session", async () => {
    const save = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (url, options) => {
      expect(url.pathname).toBe("/auth/register");
      expect(JSON.parse(options.body)).toEqual({
        email: "user@example.com",
        password: "correct-horse-battery-staple",
        name: "User",
      });
      return new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const backend = new BackendClient({
      baseUrl: "https://api.fylune.test",
      fetchImpl,
      tokenVault: { load: async () => null, save },
    });

    await expect(backend.register({
      email: "user@example.com",
      password: "correct-horse-battery-staple",
      name: "User",
    })).resolves.toEqual({ user: session.user });
    expect(save).toHaveBeenCalledWith(session);
  });

  it("refreshes once after an expired access token", async () => {
    const requests = [];
    const fetchImpl = vi.fn(async (url, options) => {
      requests.push([url.pathname, options.headers.Authorization ?? null]);
      if (url.pathname === "/auth/refresh") {
        return new Response(JSON.stringify({ accessToken: "fresh-access", refreshToken: "fresh-refresh" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (requests.length === 1) return new Response(null, { status: 401 });
      return new Response(JSON.stringify({ user: session.user }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const backend = new BackendClient({
      baseUrl: "https://api.fylune.test",
      fetchImpl,
      tokenVault: { load: async () => session, save: async () => {} },
    });

    await expect(backend.getAccount()).resolves.toEqual({ user: session.user });
    expect(requests).toEqual([
      ["/auth/me", "Bearer access-token"],
      ["/auth/refresh", "Bearer access-token"],
      ["/auth/me", "Bearer fresh-access"],
    ]);
  });

  it("exposes the optional self-hosted Agent API without sending a model key to the renderer", async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(options.headers.Authorization).toBe("Bearer access-token");
      if (url.pathname === "/ai/agent/status") {
        return new Response(JSON.stringify({ configured: true, provider: "openrouter" }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "chatcmpl-local", choices: [] }), { status: 200 });
    });
    const backend = new BackendClient({
      baseUrl: "https://api.fylune.test",
      fetchImpl,
      tokenVault: { load: async () => session, save: async () => {} },
    });

    await expect(backend.getAgentStatus()).resolves.toMatchObject({ configured: true });
    await expect(backend.completeAgent({
      messages: [{ role: "user", content: "Summarize this" }],
    })).resolves.toMatchObject({ id: "chatcmpl-local" });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toMatchObject({
      stream: false,
      messages: [{ role: "user", content: "Summarize this" }],
    });
  });
});
