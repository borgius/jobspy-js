import { describe, it, expect } from "vitest";
import { findStateFilePath } from "../../src/state";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("findStateFilePath", () => {
  it("returns override path when provided", () => {
    expect(findStateFilePath("/custom/path.json")).toBe("/custom/path.json");
  });

  it("finds .git root walking up from a subdirectory", () => {
    const tmpRoot = join(tmpdir(), `jobspy-test-${Date.now()}`);
    const subDir = join(tmpRoot, "sub", "sub2");
    mkdirSync(join(tmpRoot, ".git"), { recursive: true });
    mkdirSync(subDir, { recursive: true });

    const original = process.cwd;
    process.cwd = () => subDir;
    try {
      expect(findStateFilePath()).toBe(join(tmpRoot, ".jobspy-state.json"));
    } finally {
      process.cwd = original;
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("falls back to cwd when no .git found", () => {
    const tmpRoot = join(tmpdir(), `jobspy-test-nongit-${Date.now()}`);
    mkdirSync(tmpRoot, { recursive: true });
    const original = process.cwd;
    process.cwd = () => tmpRoot;
    try {
      const result = findStateFilePath();
      expect(result).toBe(join(tmpRoot, ".jobspy-state.json"));
    } finally {
      process.cwd = original;
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
