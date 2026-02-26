import { describe, it, expect } from "vitest";
import { findStateFilePath, loadState, saveState, mergeParams } from "../../src/state";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
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

describe("loadState", () => {
  it("returns empty state when file does not exist", () => {
    const result = loadState("/tmp/does-not-exist-ever.json");
    expect(result).toEqual({ version: 1, profiles: {} });
  });

  it("parses a valid state file", () => {
    const tmp = join(tmpdir(), `jobspy-load-${Date.now()}.json`);
    const data = { version: 1, profiles: { test: { params: {}, lastRunAt: null, providers: {} } } };
    writeFileSync(tmp, JSON.stringify(data));
    expect(loadState(tmp)).toEqual(data);
    rmSync(tmp, { force: true });
  });

  it("returns empty state for malformed JSON", () => {
    const tmp = join(tmpdir(), `jobspy-bad-${Date.now()}.json`);
    writeFileSync(tmp, "not json {{{{");
    expect(loadState(tmp)).toEqual({ version: 1, profiles: {} });
    rmSync(tmp, { force: true });
  });
});

describe("saveState", () => {
  it("writes state to file and reads it back", () => {
    const tmp = join(tmpdir(), `jobspy-save-${Date.now()}.json`);
    const state = { version: 1, profiles: { myprofile: { params: { search_term: "engineer" }, lastRunAt: null, providers: {} } } };
    saveState(tmp, state);
    const back = JSON.parse(readFileSync(tmp, "utf-8"));
    expect(back).toEqual(state);
    rmSync(tmp, { force: true });
  });

  it("does not leave a .tmp file behind", () => {
    const tmp = join(tmpdir(), `jobspy-atomic-${Date.now()}.json`);
    saveState(tmp, { version: 1, profiles: {} });
    expect(existsSync(tmp + ".tmp")).toBe(false);
    rmSync(tmp, { force: true });
  });
});

describe("mergeParams", () => {
  it("runtime params override saved params", () => {
    const saved = { search_term: "old", location: "NYC", results_wanted: 10 };
    const runtime = { search_term: "new" };
    expect(mergeParams(saved, runtime)).toMatchObject({ search_term: "new", location: "NYC", results_wanted: 10 });
  });

  it("undefined runtime values do not overwrite saved values", () => {
    const saved = { search_term: "saved", results_wanted: 20 };
    const runtime = { search_term: undefined, location: "SF" };
    const merged = mergeParams(saved, runtime);
    expect(merged.search_term).toBe("saved");
    expect(merged.location).toBe("SF");
  });

  it("works with empty saved params", () => {
    expect(mergeParams({}, { search_term: "test" })).toEqual({ search_term: "test" });
  });

  it("falsy runtime values (false, 0) overwrite saved values", () => {
    const saved = { is_remote: true, distance: 50, offset: 5 };
    const runtime = { is_remote: false, distance: 0, offset: 0 };
    const merged = mergeParams(saved, runtime);
    expect(merged.is_remote).toBe(false);
    expect(merged.distance).toBe(0);
    expect(merged.offset).toBe(0);
  });
});
