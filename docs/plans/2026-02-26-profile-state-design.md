# Design: Profile & State File for Repeatable Searches

**Date:** 2026-02-26
**Status:** Approved

## Overview

Add a project-level `.jobspy-state.json` state file that saves named search profiles (params + dedup state). On repeated runs, only new jobs are returned — jobs already seen in a previous run are filtered out. Works at both the SDK and CLI levels.

---

## State File

**Location:** Project root (nearest `.git` directory walking up from `cwd`). Falls back to `cwd` if no git repo found. Can be overridden via `stateFile` SDK param.

**Filename:** `.jobspy-state.json`

**Format:**

```json
{
  "version": 1,
  "profiles": {
    "frontend": {
      "params": {
        "site_name": ["indeed", "linkedin"],
        "search_term": "react developer",
        "location": "NYC",
        "results_wanted": 20
      },
      "lastRunAt": "2026-02-25T10:30:00Z",
      "state": {
        "indeed": {
          "lastSeenDate": "2026-02-25",
          "seenUrls": [
            { "url": "https://indeed.com/viewjob?jk=abc", "seenAt": "2026-02-25" }
          ]
        },
        "bayt": {
          "lastSeenDate": null,
          "seenUrls": [
            { "url": "https://bayt.com/job/456", "seenAt": "2026-02-25" }
          ]
        }
      }
    }
  }
}
```

- `params` — saved on first use or when new flags/params are passed; reused on bare profile runs
- `state` — keyed by site name; `lastSeenDate` is `null` for providers that never return dates (Bayt)
- `seenUrls` entries are pruned when older than 7 days on every save

---

## Per-Provider Dedup Strategy

Analysis of all scrapers:

| Provider       | `date_posted` | Strategy |
|----------------|---------------|----------|
| Indeed         | Always        | Date-first |
| LinkedIn       | Sometimes     | Date when available, else URL |
| Glassdoor      | Sometimes     | Date when available, else URL |
| Google         | Sometimes     | Date when available, else URL |
| Google Careers | Sometimes     | Date when available, else URL |
| ZipRecruiter   | Sometimes     | Date when available, else URL |
| Naukri         | Sometimes     | Date when available, else URL |
| BDJobs         | Sometimes     | Date when available, else URL |
| **Bayt**       | **Never**     | URL-only |

**Dedup algorithm (post-scrape, per provider):**

For providers with `date_posted`:
1. `date_posted <= lastSeenDate` → skip (definitely old)
2. `date_posted > lastSeenDate` AND URL not in rolling window → keep
3. `date_posted > lastSeenDate` AND URL in rolling window → skip (re-post seen recently)
4. `date_posted` missing on a job → URL check only

For Bayt (no `date_posted`):
1. URL in rolling window → skip
2. URL not in rolling window → keep

**After filtering, update state:**
1. Set `lastSeenDate` to max `date_posted` among kept jobs for that provider (keep existing if no new jobs)
2. Add kept jobs' URLs to `seenUrls` with today's ISO date
3. Prune `seenUrls` entries where `seenAt < today - 7 days`

**Edge cases:**
- First run (no prior state): no filtering, all jobs kept, state initialized
- `skipDedup: true` / `--all` flag: skip filtering, but still update state
- Provider returns 0 jobs: provider state untouched

---

## CLI Interface

```bash
# First run: save params as "frontend" profile, run, return new jobs
jobspy --profile frontend -q "react developer" -l NYC --site indeed linkedin

# Subsequent run: reuse saved params, return only new jobs
jobspy --profile frontend

# Override a param on re-run (updates saved params too)
jobspy --profile frontend -n 30

# Ignore dedup, return all results (still updates state)
jobspy --profile frontend --all

# List saved profiles
jobspy --list-profiles
```

New CLI flags:
- `--profile <name>` — profile name to load/save
- `--all` — skip dedup for this run (still updates state)
- `--list-profiles` — print all saved profile names and their last run time

---

## SDK Interface

New params on `scrapeJobs()`:

```ts
await scrapeJobs({
  // existing params ...
  profile: "frontend",                        // profile name
  stateFile: "/custom/path/.jobspy-state.json", // optional path override
  skipDedup: false,                           // equivalent of --all
});
```

When `profile` is set:
1. Resolve state file path (override → git root → cwd)
2. Load state (create empty if missing)
3. Merge saved params with runtime params (runtime params win on conflict)
4. Run scrape
5. Filter results through dedup logic per provider
6. Save updated state (atomic tmp + rename)
7. Return only new jobs with enriched result metadata

Updated `ScrapeJobsResult`:

```ts
export interface ScrapeJobsResult {
  jobs: FlatJobRecord[];     // only new jobs (post-dedup)
  totalScraped: number;      // raw count before dedup
  newCount: number;          // count after dedup
  profile?: {
    name: string;
    lastRunAt: string | null; // ISO timestamp of previous run
    stateFile: string;        // resolved path of state file used
  };
}
```

---

## New File: `src/state.ts`

All state I/O and dedup logic lives here. Both CLI and SDK import from it. No scraper internals are modified.

Exported surface:

```ts
function findStateFilePath(override?: string): string
function loadState(filePath: string): JobspyState
function saveState(filePath: string, state: JobspyState): void
function mergeParams(saved: ScrapeJobsParams, runtime: ScrapeJobsParams): ScrapeJobsParams
function filterNewJobs(jobs: FlatJobRecord[], providerState: ProviderState): FlatJobRecord[]
function updateProviderState(state: ProviderState, newJobs: FlatJobRecord[]): ProviderState
```

Atomic write: write to `.jobspy-state.json.tmp`, then `fs.renameSync` to final path.

---

## Files Changed

| File | Change |
|------|--------|
| `src/state.ts` | New — all state logic |
| `src/scraper.ts` | Add `profile`, `stateFile`, `skipDedup` to `ScrapeJobsParams`; integrate state in `scrapeJobs()` |
| `src/types.ts` | Add new fields to `ScrapeJobsParams` and `ScrapeJobsResult` |
| `src/cli/index.ts` | Add `--profile`, `--all`, `--list-profiles` flags |
