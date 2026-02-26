import { describe, it, expect } from "vitest";
import { findStateFilePath, loadState, saveState, mergeParams, filterNewJobs, updateProviderState } from "../../src/state";
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

function makeJob(overrides: Partial<{ job_url: string; date_posted: string }>): any {
  return { job_url: "https://example.com/job/1", title: "Dev", site: "indeed", ...overrides };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

describe("filterNewJobs", () => {
  it("keeps all jobs on first run (empty state)", () => {
    const jobs = [
      makeJob({ date_posted: daysAgo(1) }),
      makeJob({ job_url: "https://example.com/job/2", date_posted: daysAgo(0) }),
    ];
    const result = filterNewJobs(jobs, { lastSeenDate: null, seenUrls: [] });
    expect(result).toHaveLength(2);
  });

  it("filters jobs older than or equal to lastSeenDate", () => {
    const jobs = [
      makeJob({ date_posted: daysAgo(3), job_url: "https://example.com/old" }),
      makeJob({ date_posted: daysAgo(0), job_url: "https://example.com/new" }),
    ];
    const state = { lastSeenDate: daysAgo(2), seenUrls: [] };
    const result = filterNewJobs(jobs, state);
    expect(result).toHaveLength(1);
    expect(result[0].job_url).toBe("https://example.com/new");
  });

  it("filters jobs whose URL is in the rolling window even if date is newer", () => {
    const url = "https://example.com/repost";
    const jobs = [makeJob({ date_posted: daysAgo(0), job_url: url })];
    const state = { lastSeenDate: daysAgo(5), seenUrls: [{ url, seenAt: daysAgo(1) }] };
    expect(filterNewJobs(jobs, state)).toHaveLength(0);
  });

  it("does NOT filter URLs seen more than 7 days ago", () => {
    const url = "https://example.com/old-post";
    const jobs = [makeJob({ date_posted: daysAgo(0), job_url: url })];
    const state = { lastSeenDate: null, seenUrls: [{ url, seenAt: daysAgo(8) }] };
    expect(filterNewJobs(jobs, state)).toHaveLength(1);
  });

  it("falls back to URL check when date_posted is missing (Bayt-style)", () => {
    const url = "https://bayt.com/job/99";
    const jobs = [makeJob({ date_posted: undefined, job_url: url })];
    const seen = { lastSeenDate: null, seenUrls: [{ url, seenAt: daysAgo(1) }] };
    expect(filterNewJobs(jobs, seen)).toHaveLength(0);

    const unseen = { lastSeenDate: null, seenUrls: [] };
    expect(filterNewJobs(jobs, unseen)).toHaveLength(1);
  });

  it("filters job posted on exactly lastSeenDate (equal is excluded)", () => {
    const date = daysAgo(2);
    const jobs = [makeJob({ date_posted: date, job_url: "https://example.com/exact" })];
    const state = { lastSeenDate: date, seenUrls: [] };
    expect(filterNewJobs(jobs, state)).toHaveLength(0);
  });

  it("blocks URL seen exactly 7 days ago (inclusive boundary — still in window)", () => {
    const url = "https://example.com/boundary";
    const jobs = [makeJob({ date_posted: daysAgo(0), job_url: url })];
    const state = { lastSeenDate: null, seenUrls: [{ url, seenAt: daysAgo(7) }] };
    expect(filterNewJobs(jobs, state)).toHaveLength(0);
  });
});

describe("updateProviderState", () => {
  const today = new Date().toISOString().split("T")[0];

  it("sets lastSeenDate to max date_posted of new jobs", () => {
    const jobs = [
      makeJob({ date_posted: daysAgo(2), job_url: "https://a.com/1" }),
      makeJob({ date_posted: daysAgo(0), job_url: "https://a.com/2" }),
    ];
    const result = updateProviderState({ lastSeenDate: null, seenUrls: [] }, jobs);
    expect(result.lastSeenDate).toBe(today);
  });

  it("does not downgrade lastSeenDate if new jobs are older", () => {
    const prev = daysAgo(0);
    const jobs = [makeJob({ date_posted: daysAgo(3), job_url: "https://a.com/3" })];
    const result = updateProviderState({ lastSeenDate: prev, seenUrls: [] }, jobs);
    expect(result.lastSeenDate).toBe(prev);
  });

  it("adds new job URLs to seenUrls with today's date", () => {
    const jobs = [makeJob({ job_url: "https://new.com/job" })];
    const result = updateProviderState({ lastSeenDate: null, seenUrls: [] }, jobs);
    expect(result.seenUrls).toContainEqual({ url: "https://new.com/job", seenAt: today });
  });

  it("prunes seenUrls entries older than 7 days", () => {
    const old = { url: "https://old.com/job", seenAt: daysAgo(8) };
    const recent = { url: "https://recent.com/job", seenAt: daysAgo(3) };
    const result = updateProviderState({ lastSeenDate: null, seenUrls: [old, recent] }, []);
    expect(result.seenUrls.find((s) => s.url === old.url)).toBeUndefined();
    expect(result.seenUrls.find((s) => s.url === recent.url)).toBeDefined();
  });

  it("does not duplicate URLs when a job_url already exists in seenUrls", () => {
    const url = "https://existing.com/job";
    const existingEntry = { url, seenAt: daysAgo(2) };
    const jobs = [makeJob({ job_url: url })];
    const result = updateProviderState({ lastSeenDate: null, seenUrls: [existingEntry] }, jobs);
    const occurrences = result.seenUrls.filter((s) => s.url === url);
    expect(occurrences).toHaveLength(1);
    // seenAt should be refreshed to today
    expect(occurrences[0].seenAt).toBe(new Date().toISOString().split("T")[0]);
  });
});
