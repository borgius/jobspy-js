import { describe, it, expect } from "vitest";
import { findJobspyPath, loadFile, saveFile, filterNewJobs, updateProviderState } from "../../src/state";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("findJobspyPath", () => {
  it("returns override path when provided", () => {
    expect(findJobspyPath("/custom/path.json")).toBe("/custom/path.json");
  });

  it("finds .git root walking up from a subdirectory", () => {
    const tmpRoot = join(tmpdir(), `jobspy-test-${Date.now()}`);
    const subDir = join(tmpRoot, "sub", "sub2");
    mkdirSync(join(tmpRoot, ".git"), { recursive: true });
    mkdirSync(subDir, { recursive: true });

    const original = process.cwd;
    process.cwd = () => subDir;
    try {
      expect(findJobspyPath()).toBe(join(tmpRoot, "jobspy.json"));
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
      const result = findJobspyPath();
      expect(result).toBe(join(tmpRoot, "jobspy.json"));
    } finally {
      process.cwd = original;
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("loadFile", () => {
  it("returns empty file when path does not exist", () => {
    const result = loadFile("/tmp/does-not-exist-ever.json");
    expect(result).toEqual({
      config: { profiles: {} },
      state: { version: 1, profiles: {} },
    });
  });

  it("parses a valid unified file", () => {
    const tmp = join(tmpdir(), `jobspy-load-${Date.now()}.json`);
    const data = {
      config: { profiles: { test: { search_term: "dev" } } },
      state: { version: 1, profiles: { test: { lastRunAt: null, providers: {} } } },
    };
    writeFileSync(tmp, JSON.stringify(data));
    expect(loadFile(tmp)).toEqual(data);
    rmSync(tmp, { force: true });
  });

  it("returns empty file for malformed JSON", () => {
    const tmp = join(tmpdir(), `jobspy-bad-${Date.now()}.json`);
    writeFileSync(tmp, "not json {{{{");
    expect(loadFile(tmp)).toEqual({
      config: { profiles: {} },
      state: { version: 1, profiles: {} },
    });
    rmSync(tmp, { force: true });
  });

  it("returns empty file for old-format state-only files", () => {
    const tmp = join(tmpdir(), `jobspy-old-${Date.now()}.json`);
    writeFileSync(tmp, JSON.stringify({ version: 1, profiles: {} }));
    expect(loadFile(tmp)).toEqual({
      config: { profiles: {} },
      state: { version: 1, profiles: {} },
    });
    rmSync(tmp, { force: true });
  });
});

describe("saveFile", () => {
  it("writes unified file and reads it back", () => {
    const tmp = join(tmpdir(), `jobspy-save-${Date.now()}.json`);
    const file = {
      config: { profiles: { myprofile: { search_term: "engineer" } } },
      state: { version: 1, profiles: { myprofile: { lastRunAt: null, providers: {} } } },
    };
    saveFile(tmp, file);
    const back = JSON.parse(readFileSync(tmp, "utf-8"));
    expect(back).toEqual(file);
    rmSync(tmp, { force: true });
  });

  it("preserves config when saving state updates", () => {
    const tmp = join(tmpdir(), `jobspy-preserve-${Date.now()}.json`);
    const file = {
      config: { profiles: { frontend: { search_term: "react" }, backend: { search_term: "node" } } },
      state: { version: 1, profiles: {} as Record<string, any> },
    };
    // Simulate a state update
    file.state.profiles["frontend"] = { lastRunAt: new Date().toISOString(), providers: {} };
    saveFile(tmp, file);
    const back = JSON.parse(readFileSync(tmp, "utf-8"));
    expect(back.config.profiles.frontend.search_term).toBe("react");
    expect(back.config.profiles.backend.search_term).toBe("node");
    expect(back.state.profiles.frontend.lastRunAt).toBeTruthy();
    rmSync(tmp, { force: true });
  });

  it("does not leave a .tmp file behind", () => {
    const tmp = join(tmpdir(), `jobspy-atomic-${Date.now()}.json`);
    saveFile(tmp, { config: { profiles: {} }, state: { version: 1, profiles: {} } });
    expect(existsSync(tmp + ".tmp")).toBe(false);
    rmSync(tmp, { force: true });
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
