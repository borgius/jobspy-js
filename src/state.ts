import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FlatJobRecord } from "./scraper";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SeenUrl {
  url: string;
  seenAt: string; // ISO date YYYY-MM-DD
}

export interface ProviderState {
  lastSeenDate: string | null; // ISO date YYYY-MM-DD; null for providers that never set date_posted
  /**
   * URLs seen within the last URL_WINDOW_DAYS days.
   * Entries older than this window must be evicted on every state save.
   * Always write seenAt using new Date().toISOString().slice(0, 10).
   */
  seenUrls: SeenUrl[];
}

export interface ProfileState {
  lastRunAt: string | null; // ISO timestamp
  providers: Record<string, ProviderState>; // keyed by site name
}

export interface JobspyState {
  version: number;
  profiles: Record<string, ProfileState>;
}

export interface JobspyFile {
  config: {
    profiles: Record<string, Record<string, any>>;
  };
  state: JobspyState;
}

export function emptyFile(): JobspyFile {
  return {
    config: { profiles: {} },
    state: { version: 1, profiles: {} },
  };
}

const JOBSPY_FILENAME = "jobspy.json";
export const URL_WINDOW_DAYS = 7;

// ─── findJobspyPath ──────────────────────────────────────────────────────────

export function findJobspyPath(override?: string): string {
  if (override) return override;
  const cwd = process.cwd();
  let dir = cwd;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return join(dir, JOBSPY_FILENAME);
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return join(cwd, JOBSPY_FILENAME);
}

export function loadFile(filePath: string): JobspyFile {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.config && parsed.state) return parsed as JobspyFile;
    return emptyFile();
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || e instanceof SyntaxError) return emptyFile();
    throw e;
  }
}

export function saveFile(filePath: string, file: JobspyFile): void {
  const tmp = `${filePath}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(file, null, 2));
    renameSync(tmp, filePath);
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw e;
  }
}

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

export function updateProviderState(
  state: ProviderState,
  newJobs: FlatJobRecord[],
): ProviderState {
  const today = new Date().toISOString().split("T")[0];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - URL_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  // lastSeenDate intentionally stays null for providers that never set date_posted (e.g. Bayt).
  // In that case, filterNewJobs relies solely on the URL rolling window.
  let newLastSeenDate = state.lastSeenDate;
  for (const job of newJobs) {
    if (job.date_posted) {
      if (!newLastSeenDate || job.date_posted > newLastSeenDate) {
        newLastSeenDate = job.date_posted;
      }
    }
  }

  // Prune old entries from existing state, then append new entries.
  // Refresh seenAt for any URL that reappears in newJobs (sliding window).
  const pruned = state.seenUrls.filter((s) => s.seenAt >= cutoffStr);
  const newUrls = new Set(newJobs.map((job) => job.job_url));
  const deduped = pruned.filter((s) => !newUrls.has(s.url));
  const added = newJobs.map((job) => ({ url: job.job_url, seenAt: today }));

  return {
    lastSeenDate: newLastSeenDate,
    seenUrls: [...deduped, ...added],
  };
}
