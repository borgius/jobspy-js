import { existsSync } from "node:fs";
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
  /**
   * URLs seen within the last URL_WINDOW_DAYS days.
   * Entries older than this window must be evicted on every state save.
   * Always write seenAt using new Date().toISOString().slice(0, 10).
   */
  seenUrls: SeenUrl[];
}

export interface ProfileState {
  params: ScrapeJobsParams;
  lastRunAt: string | null; // ISO timestamp
  providers: Record<string, ProviderState>; // keyed by site name
}

export interface JobspyState {
  version: number;
  profiles: Record<string, ProfileState>;
}

export function emptyState(): JobspyState {
  return { version: 1, profiles: {} };
}

const STATE_FILENAME = ".jobspy-state.json";
export const URL_WINDOW_DAYS = 7;

// ─── findStateFilePath ────────────────────────────────────────────────────────

export function findStateFilePath(override?: string): string {
  if (override) return override;
  const cwd = process.cwd();
  let dir = cwd;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return join(dir, STATE_FILENAME);
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return join(cwd, STATE_FILENAME);
}
