/**
 * Credential loader for job-scraper providers.
 *
 * Priority (highest → lowest):
 *  1. Explicitly passed `credentials` object in ScrapeJobsParams
 *  2. Per-provider CLI options (linkedin_username / linkedin_password, …)
 *  3. Environment variables (LINKEDIN_USERNAME / LINKEDIN_PASSWORD, …)
 *
 * Whether to *use* credentials at all is controlled by:
 *  - `params.use_creds === true`  OR
 *  - env var `JOBSPY_CREDS=1`
 */

import type { ProviderCredentials, ProviderCreds, ScrapeJobsParams } from "./types";

type Provider = keyof ProviderCredentials;

/** Returns true when authenticated scraping fallback is enabled. */
export function shouldUseCreds(params: Partial<ScrapeJobsParams> = {}): boolean {
  if (params.use_creds) return true;
  const envVal = process.env.JOBSPY_CREDS;
  return envVal === "1" || envVal?.toLowerCase() === "true";
}

/**
 * Build a ProviderCredentials object by merging env vars, per-field params,
 * and an explicit credentials object (in order of increasing priority).
 */
export function loadCredentials(params: Partial<ScrapeJobsParams> = {}): ProviderCredentials {
  const creds: ProviderCredentials = {};

  // Helper – apply a provider entry only when both username + password exist
  const apply = (
    provider: Provider,
    username: string | undefined,
    password: string | undefined,
  ) => {
    if (username && password) {
      creds[provider] = { username, password } as ProviderCreds;
    }
  };

  // 1. Environment variables (lowest priority)
  apply("linkedin",     env("LINKEDIN_USERNAME"),     env("LINKEDIN_PASSWORD"));
  apply("indeed",       env("INDEED_USERNAME"),       env("INDEED_PASSWORD"));
  apply("glassdoor",    env("GLASSDOOR_USERNAME"),    env("GLASSDOOR_PASSWORD"));
  apply("zip_recruiter",env("ZIPRECRUITER_USERNAME"), env("ZIPRECRUITER_PASSWORD"));
  apply("bayt",         env("BAYT_USERNAME"),         env("BAYT_PASSWORD"));
  apply("naukri",       env("NAUKRI_USERNAME"),       env("NAUKRI_PASSWORD"));
  apply("bdjobs",       env("BDJOBS_USERNAME"),       env("BDJOBS_PASSWORD"));

  // 2. Per-provider CLI / param fields (override env)
  apply("linkedin",     params.linkedin_username,     params.linkedin_password);
  apply("indeed",       params.indeed_username,       params.indeed_password);
  apply("glassdoor",    params.glassdoor_username,    params.glassdoor_password);
  apply("zip_recruiter",params.ziprecruiter_username, params.ziprecruiter_password);
  apply("bayt",         params.bayt_username,         params.bayt_password);
  apply("naukri",       params.naukri_username,       params.naukri_password);
  apply("bdjobs",       params.bdjobs_username,       params.bdjobs_password);

  // 3. Explicit credentials object (highest priority, merged field-by-field)
  if (params.credentials) {
    for (const [key, val] of Object.entries(params.credentials) as [Provider, ProviderCreds][]) {
      if (val?.username && val?.password) {
        creds[key] = val;
      }
    }
  }

  return creds;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}
