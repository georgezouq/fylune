import { describe, expect, it } from "vitest";

import { formatJsonDocument, validateJsonDocument } from "../../src/jsonDocument.js";

describe("JSON documents", () => {
  it("validates and formats JSON and JSONL without mixing their record rules", () => {
    expect(validateJsonDocument('{"ok":true}')).toBeNull();
    expect(validateJsonDocument('{"ok":}')).toMatch(/JSON/i);
    expect(validateJsonDocument('{"id":1}\n{"id":2}\n', true)).toBeNull();
    expect(validateJsonDocument('{"id":1}\nnope\n', true)).toMatch(/^Line 2:/);
    expect(formatJsonDocument('{"ok":true}')).toBe('{\n  "ok": true\n}\n');
    expect(formatJsonDocument('{"id":1}\n {"id":2}\n', true)).toBe('{"id":1}\n{"id":2}\n');
  });
});
