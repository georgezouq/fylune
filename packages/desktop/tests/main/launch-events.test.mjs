import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { captureLaunchEvents } from "../../electron/lib/launch-events.cjs";

describe("native launch requests", () => {
  it("retains cold-start requests before main is imported and dispatches warm opens once, in order", async () => {
    const app = new EventEmitter();
    const connect = captureLaunchEvents(app);
    const preventDefault = vi.fn();
    app.emit("open-file", { preventDefault }, "/test/【NEW】登录.md");
    app.emit("second-instance", {}, ["Fylune", "--fylune-open=/test/workspace"]);
    const handle = vi.fn();
    await new Promise((resolve) => setImmediate(resolve));
    expect(handle).not.toHaveBeenCalled();
    connect(handle);
    app.emit("open-file", { preventDefault }, "/test/settings.json");
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(3));
    expect(handle.mock.calls.map(([request]) => request)).toEqual([
      { filePath: "/test/【NEW】登录.md" },
      { argv: ["Fylune", "--fylune-open=/test/workspace"] },
      { filePath: "/test/settings.json" },
    ]);
    expect(preventDefault).toHaveBeenCalledTimes(2);
  });

  it("waits for earlier opens and continues after an open fails", async () => {
    const app = new EventEmitter();
    const connect = captureLaunchEvents(app);
    let finishFirst;
    const handle = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockRejectedValueOnce(Object.assign(new Error("Missing file"), { code: "ENOENT" }))
      .mockResolvedValue(undefined);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      connect(handle);
      for (const filePath of ["/test/first.md", "/test/missing.md", "/test/last.md"]) {
        app.emit("open-file", { preventDefault() {} }, filePath);
      }
      await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(1));
      finishFirst();
      await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(3));
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("ENOENT"));
    } finally {
      stderr.mockRestore();
    }
  });

  it("ignores invalid native paths without discarding a plain second-instance activation", async () => {
    const app = new EventEmitter();
    const connect = captureLaunchEvents(app);
    const handle = vi.fn();
    connect(handle);
    for (const filePath of [null, {}, "relative.md", ""]) {
      app.emit("open-file", { preventDefault() {} }, filePath);
    }
    app.emit("second-instance", {}, ["Fylune"]);
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(1));
    expect(handle).toHaveBeenCalledWith({ argv: ["Fylune"] });
  });
});
