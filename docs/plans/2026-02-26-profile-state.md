# Profile & State File Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add named search profiles with per-provider dedup state to `scrapeJobs()`, the CLI, and the SDK.

**Architecture:** A new `src/state.ts` module handles all state I/O and dedup logic. `scrapeJobs()` in `src/scraper.ts` integrates it when `profile` is set. The CLI gets three new flags. No scraper internals are touched.

**Tech Stack:** Node.js `fs` (readFileSync, writeFileSync, renameSync, existsSync), vitest for unit tests, TypeScript.

---

## Task 1: Create `src/state.ts` — types + `findStateFilePath()`

**Files:**
- Create: `src/state.ts`
- Create: `tests/unit/state.test.ts`

**Step 1: Write the failing test**

Create `tests/unit/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findStateFilePath } from "../../src/state";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("findStateFilePath", () => {
  it("returns override path when provided", () => {
    expect(findStateFilePath("/custom/path.json")).toBe("/custom/path.json");
  });

  it("finds .git root walking up from a subdirectory", () => {
    // Create a temp tree: tmpRoot/.git and tmpRoot/sub/sub2
    const tmpRoot = join(tmpdir(), `jobspy-test-${Date.now()}`);
    const subDir = join(tmpRoot, "sub", "sub2");
    mkdirSync(join(tmpRoot, ".git"), { recursive: true });
    mkdirSync(subDir, { recursive: true });

    // Simulate cwd being the deep subdir
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
    // Use a path that has no .git above it (inside tmpdir, not a git repo)
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
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: FAIL with "Cannot find module '../../src/state'"

**Step 3: Create `src/state.ts` with types and `findStateFilePath()`**

```ts
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ScrapeJobsParams } from "./types";
import type { FlatJobRecord } from "./scraper";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SeenUrl {
  url: string;
  seenAt: string; // ISO date YYYY-MM-DD
}

export interface ProviderState {
  lastSeenDate: string | null; // ISO date YYYY-MM-DD; null for providers that never set date_posted
  seenUrls: SeenUrl[];
}

export interface ProfileState {
  params: ScrapeJobsParams;
  lastRunAt: string | null; // ISO timestamp
  state: Record<string, ProviderState>; // keyed by site name
}

export interface JobspyState {
  version: number;
  profiles: Record<string, ProfileState>;
}

export const EMPTY_STATE: JobspyState = { version: 1, profiles: {} };

const STATE_FILENAME = ".jobspy-state.json";
const URL_WINDOW_DAYS = 7;

// ─── findStateFilePath ────────────────────────────────────────────────────────

export function findStateFilePath(override?: string): string {
  if (override) return override;
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return join(dir, STATE_FILENAME);
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return join(process.cwd(), STATE_FILENAME);
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/state.ts tests/unit/state.test.ts
git commit -m "feat: add state types and findStateFilePath"
```

---

## Task 2: Add `loadState()` and `saveState()` to `src/state.ts`

**Files:**
- Modify: `src/state.ts`
- Modify: `tests/unit/state.test.ts`

**Step 1: Write the failing tests**

Append to `tests/unit/state.test.ts`:

```ts
import { loadState, saveState } from "../../src/state";
import { writeFileSync, readFileSync } from "node:fs";

describe("loadState", () => {
  it("returns empty state when file does not exist", () => {
    const result = loadState("/tmp/does-not-exist-ever.json");
    expect(result).toEqual({ version: 1, profiles: {} });
  });

  it("parses a valid state file", () => {
    const tmp = join(tmpdir(), `jobspy-load-${Date.now()}.json`);
    const data = { version: 1, profiles: { test: { params: {}, lastRunAt: null, state: {} } } };
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
    const state = { version: 1, profiles: { myprofile: { params: { search_term: "engineer" }, lastRunAt: null, state: {} } } };
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
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: FAIL with "loadState is not a function"

**Step 3: Add `loadState()` and `saveState()` to `src/state.ts`**

```ts
export function loadState(filePath: string): JobspyState {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as JobspyState;
  } catch {
    return { version: 1, profiles: {} };
  }
}

export function saveState(filePath: string, state: JobspyState): void {
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, filePath);
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add src/state.ts tests/unit/state.test.ts
git commit -m "feat: add loadState and saveState"
```

---

## Task 3: Add `mergeParams()` to `src/state.ts`

**Files:**
- Modify: `src/state.ts`
- Modify: `tests/unit/state.test.ts`

**Step 1: Write the failing tests**

Append to `tests/unit/state.test.ts`:

```ts
import { mergeParams } from "../../src/state";

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
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: FAIL with "mergeParams is not a function"

**Step 3: Add `mergeParams()` to `src/state.ts`**

```ts
export function mergeParams(
  saved: ScrapeJobsParams,
  runtime: ScrapeJobsParams,
): ScrapeJobsParams {
  const merged: ScrapeJobsParams = { ...saved };
  for (const [key, val] of Object.entries(runtime)) {
    if (val !== undefined) {
      (merged as Record<string, unknown>)[key] = val;
    }
  }
  return merged;
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/state.ts tests/unit/state.test.ts
git commit -m "feat: add mergeParams"
```

---

## Task 4: Add `filterNewJobs()` to `src/state.ts`

**Files:**
- Modify: `src/state.ts`
- Modify: `tests/unit/state.test.ts`

**Step 1: Write the failing tests**

Append to `tests/unit/state.test.ts`:

```ts
import { filterNewJobs } from "../../src/state";

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
    const jobs = [makeJob({ date_posted: daysAgo(1) }), makeJob({ job_url: "https://example.com/job/2", date_posted: daysAgo(0) })];
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
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: FAIL with "filterNewJobs is not a function"

**Step 3: Add `filterNewJobs()` to `src/state.ts`**

```ts
export function filterNewJobs(
  jobs: FlatJobRecord[],
  providerState: ProviderState,
): FlatJobRecord[] {
  const { lastSeenDate, seenUrls } = providerState;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - URL_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const windowUrls = new Set(
    seenUrls
      .filter((s) => s.seenAt >= cutoffStr)
      .map((s) => s.url),
  );

  return jobs.filter((job) => {
    if (windowUrls.has(job.job_url)) return false;
    if (job.date_posted && lastSeenDate) {
      if (job.date_posted <= lastSeenDate) return false;
    }
    return true;
  });
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/state.ts tests/unit/state.test.ts
git commit -m "feat: add filterNewJobs"
```

---

## Task 5: Add `updateProviderState()` to `src/state.ts`

**Files:**
- Modify: `src/state.ts`
- Modify: `tests/unit/state.test.ts`

**Step 1: Write the failing tests**

Append to `tests/unit/state.test.ts`:

```ts
import { updateProviderState } from "../../src/state";

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
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: FAIL with "updateProviderState is not a function"

**Step 3: Add `updateProviderState()` to `src/state.ts`**

```ts
export function updateProviderState(
  state: ProviderState,
  newJobs: FlatJobRecord[],
): ProviderState {
  const today = new Date().toISOString().split("T")[0];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - URL_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  let newLastSeenDate = state.lastSeenDate;
  for (const job of newJobs) {
    if (job.date_posted) {
      if (!newLastSeenDate || job.date_posted > newLastSeenDate) {
        newLastSeenDate = job.date_posted;
      }
    }
  }

  const pruned = state.seenUrls.filter((s) => s.seenAt >= cutoffStr);
  const added = newJobs.map((job) => ({ url: job.job_url, seenAt: today }));

  return {
    lastSeenDate: newLastSeenDate,
    seenUrls: [...pruned, ...added],
  };
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/state.test.ts
```

Expected: PASS (all tests in file)

**Step 5: Commit**

```bash
git add src/state.ts tests/unit/state.test.ts
git commit -m "feat: add updateProviderState"
```

---

## Task 6: Add new params to `src/types.ts` and update result type in `src/scraper.ts`

**Files:**
- Modify: `src/types.ts` (lines 191–210, the `ScrapeJobsParams` interface)
- Modify: `src/scraper.ts` (lines 72–111, the `ScrapeJobsResult` and `FlatJobRecord` interfaces)

**Step 1: Add `profile`, `stateFile`, `skipDedup` to `ScrapeJobsParams` in `src/types.ts`**

In `src/types.ts`, find `ScrapeJobsParams` and add three optional fields at the end:

```ts
export interface ScrapeJobsParams {
  // ... existing fields unchanged ...
  hours_old?: number;
  enforce_annual_salary?: boolean;
  verbose?: number;

  // Profile / state
  profile?: string;
  stateFile?: string;
  skipDedup?: boolean;
}
```

**Step 2: Update `ScrapeJobsResult` in `src/scraper.ts`**

Find `ScrapeJobsResult` (line 72) and update:

```ts
export interface ScrapeJobsResult {
  jobs: FlatJobRecord[];
  totalScraped: number;
  newCount: number;
  profile?: {
    name: string;
    lastRunAt: string | null;
    stateFile: string;
  };
}
```

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add src/types.ts src/scraper.ts
git commit -m "feat: add profile params to ScrapeJobsParams and ScrapeJobsResult"
```

---

## Task 7: Integrate profile/state into `scrapeJobs()` in `src/scraper.ts`

**Files:**
- Modify: `src/scraper.ts`

**Step 1: Add imports at the top of `src/scraper.ts`**

After the existing imports, add:

```ts
import {
  findStateFilePath,
  loadState,
  saveState,
  mergeParams,
  filterNewJobs,
  updateProviderState,
  type ProfileState,
} from "./state";
```

**Step 2: Update the `scrapeJobs()` function**

The function currently ends by returning `{ jobs: flatJobs }`. Replace the entire final section — from the sort through the return — with this:

```ts
  // Sort by site, then date_posted descending
  flatJobs.sort((a, b) => {
    const siteCmp = (a.site ?? "").localeCompare(b.site ?? "");
    if (siteCmp !== 0) return siteCmp;
    const aDate = a.date_posted ?? "";
    const bDate = b.date_posted ?? "";
    return bDate.localeCompare(aDate);
  });

  const totalScraped = flatJobs.length;

  // ── Profile / dedup ────────────────────────────────────────────────────────
  if (!params.profile) {
    return { jobs: flatJobs, totalScraped, newCount: totalScraped };
  }

  const stateFilePath = findStateFilePath(params.stateFile);
  const stateData = loadState(stateFilePath);

  const profileName = params.profile;
  const existing: ProfileState = stateData.profiles[profileName] ?? {
    params: {},
    lastRunAt: null,
    state: {},
  };

  // Filter per site unless skipDedup
  let filteredJobs = flatJobs;
  if (!params.skipDedup) {
    filteredJobs = [];
    for (const site of sites) {
      const siteJobs = flatJobs.filter((j) => j.site === (site as string));
      const provState = existing.state[site] ?? { lastSeenDate: null, seenUrls: [] };
      filteredJobs.push(...filterNewJobs(siteJobs, provState));
    }
  }

  // Update state for each site with ALL scraped jobs (not just filtered)
  for (const site of sites) {
    const siteJobs = flatJobs.filter((j) => j.site === (site as string));
    const provState = existing.state[site] ?? { lastSeenDate: null, seenUrls: [] };
    existing.state[site] = updateProviderState(provState, siteJobs);
  }

  // Persist profile — strip profile/stateFile/skipDedup from saved params
  const { profile: _p, stateFile: _sf, skipDedup: _sd, ...paramsToSave } = params;
  existing.params = mergeParams(existing.params, paramsToSave);
  existing.lastRunAt = new Date().toISOString();
  stateData.profiles[profileName] = existing;
  saveState(stateFilePath, stateData);

  return {
    jobs: filteredJobs,
    totalScraped,
    newCount: filteredJobs.length,
    profile: {
      name: profileName,
      lastRunAt: existing.lastRunAt,
      stateFile: stateFilePath,
    },
  };
```

**Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 4: Smoke test**

```bash
pnpm vite-node -e "
import { scrapeJobs } from './src/scraper';
const r = await scrapeJobs({ site_name: ['indeed'], search_term: 'engineer', results_wanted: 3, profile: 'test-smoke' });
console.log('totalScraped:', r.totalScraped, 'newCount:', r.newCount, 'profile:', r.profile);
"
```

Expected: prints totalScraped=3, newCount=3 on first run, newCount=0 on second run.

**Step 5: Commit**

```bash
git add src/scraper.ts
git commit -m "feat: integrate profile state dedup into scrapeJobs"
```

---

## Task 8: Update CLI — add `--profile`, `--all`, `--list-profiles`

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Add new options to the commander program**

In `src/cli/index.ts`, after the existing `.option("-v, --verbose ...")` line and before `.action(...)`, add:

```ts
  .option("--profile <name>", "Named search profile — saves params and dedup state")
  .option("--all", "Skip dedup for this run (still updates state)")
  .option("--list-profiles", "List saved profiles and their last run time")
```

**Step 2: Handle `--list-profiles` at the start of the action handler**

At the very start of the `.action(async (opts) => {` block, before the `scrapeJobs` call, add:

```ts
    if (opts.listProfiles) {
      const { findStateFilePath, loadState } = await import("../state");
      const stateFilePath = findStateFilePath();
      const state = loadState(stateFilePath);
      const profiles = Object.entries(state.profiles);
      if (profiles.length === 0) {
        console.log("No saved profiles. Run with --profile <name> to create one.");
      } else {
        console.log(`Profiles in ${stateFilePath}:`);
        for (const [name, p] of profiles) {
          const last = p.lastRunAt ? new Date(p.lastRunAt).toLocaleString() : "never";
          const sites = (p.params.site_name as string[] | undefined)?.join(", ") ?? "all";
          console.log(`  ${name.padEnd(20)} last run: ${last}  sites: ${sites}  term: ${p.params.search_term ?? ""}`);
        }
      }
      return;
    }
```

**Step 3: Pass `profile`, `skipDedup` to `scrapeJobs`**

In the `scrapeJobs({...})` call in the action handler, add:

```ts
        profile: opts.profile,
        skipDedup: opts.all ?? false,
```

**Step 4: Update the console output to show dedup info when profile is active**

After `console.log(`Found ${result.jobs.length} jobs`);`, add:

```ts
      if (result.profile) {
        console.log(`  (${result.totalScraped} scraped, ${result.newCount} new since last run — state: ${result.profile.stateFile})`);
      }
```

**Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

**Step 6: Smoke test the CLI**

```bash
# First run — should show jobs
pnpm cli --profile mytest -q "engineer" --site indeed -n 3

# Second run — should show 0 new (all already seen)
pnpm cli --profile mytest

# List profiles
pnpm cli --list-profiles

# Force all results
pnpm cli --profile mytest --all -n 3
```

**Step 7: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add --profile, --all, --list-profiles CLI flags"
```

---

## Task 9: Run all unit tests and verify

**Step 1: Run the full unit test suite**

```bash
pnpm vitest run tests/unit/
```

Expected: All pass.

**Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

**Step 3: Final commit if any fixups**

```bash
git add -p
git commit -m "chore: fix any typecheck or test issues"
```
