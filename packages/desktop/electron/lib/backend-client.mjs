import { z } from "zod";

import { FyluneError } from "./errors.mjs";

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable().optional(),
  accountType: z.literal("REGISTERED").optional(),
}).passthrough();

const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: userSchema,
});

function errorMessage(body) {
  if (typeof body?.message === "string" && body.message.trim()) return body.message.trim();
  if (Array.isArray(body?.message)) return body.message.filter(Boolean).join(" ");
  return "Fylune could not complete the account request.";
}

export class BackendClient {
  constructor({ baseUrl, fetchImpl = fetch, tokenVault = null }) {
    this.baseUrl = new URL(baseUrl);
    const localHttp = this.baseUrl.protocol === "http:" &&
      new Set(["127.0.0.1", "localhost"]).has(this.baseUrl.hostname);
    if (this.baseUrl.protocol !== "https:" && !localHttp) {
      throw new Error("Fylune backend must use HTTPS outside local development");
    }
    this.fetchImpl = fetchImpl;
    this.tokenVault = tokenVault;
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.initialization = null;
  }

  async initialize() {
    if (!this.initialization) {
      this.initialization = (async () => {
        const stored = await this.tokenVault?.load?.();
        if (!stored?.accessToken || !stored?.user) return;
        this.accessToken = stored.accessToken;
        this.refreshToken = stored.refreshToken ?? null;
        this.user = stored.user;
      })();
    }
    return this.initialization;
  }

  async #request(endpoint, options = {}, allowRefresh = true) {
    const { timeoutMs = 10_000, ...requestOptions } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(new URL(endpoint, this.baseUrl), {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
          ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
        },
      });
      if (response.status === 401 && allowRefresh && this.refreshToken && endpoint !== "/auth/refresh") {
        await this.#refresh();
        return this.#request(endpoint, options, false);
      }
      if (!response.ok) {
        let body = {};
        try { body = await response.json(); } catch { /* optional error body */ }
        throw new FyluneError("BACKEND_REQUEST_FAILED", errorMessage(body), { status: response.status });
      }
      return response.status === 204 ? null : response.json();
    } catch (error) {
      if (error instanceof FyluneError) throw error;
      throw new FyluneError(
        "BACKEND_UNAVAILABLE",
        error?.name === "AbortError" ? "The Fylune service timed out." : "The Fylune service is unavailable.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async #apply(response) {
    const session = authResponseSchema.parse(response);
    this.accessToken = session.accessToken;
    this.refreshToken = session.refreshToken;
    this.user = session.user;
    await this.tokenVault?.save?.(session).catch(() => false);
    return { user: this.user };
  }

  async #refresh() {
    const response = await this.#request(
      "/auth/refresh",
      { method: "POST", body: JSON.stringify({ refreshToken: this.refreshToken }) },
      false,
    );
    this.accessToken = response.accessToken;
    this.refreshToken = response.refreshToken;
    await this.tokenVault?.save?.({
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      user: this.user,
    }).catch(() => false);
  }

  async signIn(credentials) {
    await this.initialize();
    return this.#apply(await this.#request("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }));
  }

  async register(credentials) {
    await this.initialize();
    return this.#apply(await this.#request("/auth/register", {
      method: "POST",
      body: JSON.stringify(credentials),
    }));
  }

  async getSession() {
    await this.initialize();
    return { user: this.user ?? { id: "local", email: null, name: "Local user", accountType: "GUEST", offline: true } };
  }

  async getAccount() {
    await this.initialize();
    if (!this.accessToken) return this.getSession();
    try {
      const response = z.object({ user: userSchema }).parse(await this.#request("/auth/me"));
      this.user = response.user;
      return response;
    } catch {
      return { user: this.user, offline: true };
    }
  }

  async signOut() {
    if (this.refreshToken) {
      await this.#request(
        "/auth/logout",
        { method: "POST", body: JSON.stringify({ refreshToken: this.refreshToken }) },
        false,
      ).catch(() => null);
    }
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    await this.tokenVault?.clear?.();
    return this.getSession();
  }
}
