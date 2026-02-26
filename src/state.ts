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
export const URL_WINDOW_DAYS = 7;

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
