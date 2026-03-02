# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Provider credentials** — per-provider username/password support for all scrapers via env vars (`LINKEDIN_USERNAME` / `LINKEDIN_PASSWORD`, `INDEED_USERNAME` / `INDEED_PASSWORD`, `GLASSDOOR_USERNAME` / `GLASSDOOR_PASSWORD`, `ZIPRECRUITER_*`, `BAYT_*`, `NAUKRI_*`, `BDJOBS_*`), CLI flags (`--linkedin-username`, `--linkedin-password`, …), or `credentials` object in `ScrapeJobsParams`.
- **`--creds` CLI flag** — opt-in authenticated scraping fallback (also `JOBSPY_CREDS=1` env var). Credentials are loaded but only *used* when this flag is set.
- **LinkedIn login fallback** — on 429 throttle or auth-wall redirect, the LinkedIn scraper automatically attempts a form-based session login and retries the blocked request when `--creds` is active.
- `src/credentials.ts` — new module that merges credentials from three priority layers: env vars → per-parameter fields → explicit `credentials` object.
- `ProviderCredentials` and `ProviderCreds` types exported from `types.ts`.
- `use_creds`, `credentials`, and all `*_username`/`*_password` fields added to `ScrapeJobsParams` and `ScraperInput`.
- `--init` profiles now include commented-out credential examples.

---

## [1.6.0] — 2026-03-02

### Added
- **`fetchJobDetails(site, id, options)`** — fetch full job details by provider-specific ID for *any* supported site (`indeed`, `linkedin`, `glassdoor`, `zip_recruiter`, `bayt`, `naukri`, `bdjobs`). Equivalent to `fetchLinkedInJob` but provider-agnostic.
- **`--id <jobId>` CLI flag** — fetch full job details from any provider by ID (requires `-s/--site`).
- Abstract `fetchJob(id, format)` method on the base `Scraper` class; subclasses override per provider.

### Changed
- LinkedIn scraper now distinguishes between a true auth-wall redirect (no job content) and a page that merely references the signup URL — prevents false-positive empty results.
- LinkedIn auth-wall check uses `show-more-less-html__markup` presence as a page-content signal.

---

## [1.5.0] — 2026-02-27

### Added
- **`fetchLinkedInJob(idOrUrl, options)`** — fetch full details for a single LinkedIn job by numeric ID or full URL. Returns description, job level, job type, job function, company industry, company logo, and direct application URL.
- **`--describe <jobId>` CLI flag** — fetch and pretty-print LinkedIn job details from the command line.
- **Unified `jobspy.json` config file** — single file stores both search profiles (`config.profiles`) and dedup state (`state.profiles`). Replaces the previous separate state file.
- **`--init` CLI flag** — generates a `jobspy.json` with two sample profiles (`frontend`, `backend`).
- **`--list-profiles` CLI flag** — lists all profiles with last-run timestamp, sites, and search term.
- **`--profile <name>` CLI flag** — run a named search profile from `jobspy.json`; CLI flags override profile values.
- **`--all` CLI flag** — skip dedup filtering for one run while still updating state.
- **Dedup / incremental runs** — `scrapeJobs()` with a profile name automatically tracks seen URLs and date watermarks per provider. Only new jobs are returned on subsequent runs.
- `profile` and `skip_dedup` fields in `ScrapeJobsParams`.
- `ScrapeJobsResult` now includes `totalScraped`, `newCount`, and `profile` metadata.
- `src/state.ts` — state file I/O, `filterNewJobs()`, `updateProviderState()`, `mergeParams()`.

### Changed
- CLI option merging: profile config values are used as defaults; CLI flags always take precedence.

---

## [1.3.0] — 2026-02-21

### Changed
- **Dual ESM/CJS output** — Vite build now emits both `.js` (ESM) and `.cjs` (CommonJS) bundles for broad compatibility with Node.js consumers.
- Updated `package.json` exports map with `import`/`require` conditions.

---

## [1.2.0] — 2026-02-21

### Added
- **`SDK.md`** — comprehensive SDK reference covering all parameters, types, enums, output fields, proxy configuration, country support, and advanced examples.

---

## [1.1.0] — 2026-02-18

### Added
- **Google Careers scraper** (`google_careers`) — scrapes jobs posted at Google the company via plain HTTP; parses `AF_initDataCallback` JSON payload.
- **Playwright support for Google Jobs** (`google`) — headless Chromium execution via `@playwright/test` to handle JavaScript-rendered job listings.

### Fixed
- ZipRecruiter scraper — corrected JSON extraction and pagination.
- BDJobs scraper — fixed request parameters and result parsing.

---

## [1.0.1] — 2026-02-18

### Changed
- Refactored source structure for improved readability and maintainability (module split, consistent naming).
- Added `release` script to `package.json`.

---

## [1.0.0] — 2026-02-17

### Added
- Initial TypeScript port of [JobSpy](https://github.com/speedyapply/JobSpy) (Python).
- **9 scrapers**: LinkedIn (HTML), Indeed (GraphQL), Glassdoor (GraphQL), Google Jobs (Playwright), Google Careers (HTTP), ZipRecruiter, Bayt, Naukri (REST), BDJobs (REST).
- **Three interfaces**: SDK (`scrapeJobs()`), CLI (`jobspy`), MCP server.
- [wreq-js](https://github.com/nicehash/wreq-js) browser TLS fingerprint emulation (JA3/JA4, Chrome/Firefox/Safari).
- Concurrent multi-site scraping via `Promise.allSettled`.
- Proxy rotation support.
- Salary extraction from job descriptions.
- 60+ country support for Indeed and Glassdoor regional domains.
- `JobPost`, `ScraperInput`, `JobResponse`, and all supporting types.

[Unreleased]: https://github.com/borgius/jobspy-js/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/borgius/jobspy-js/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/borgius/jobspy-js/compare/v1.3.0...v1.5.0
[1.3.0]: https://github.com/borgius/jobspy-js/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/borgius/jobspy-js/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/borgius/jobspy-js/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/borgius/jobspy-js/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/borgius/jobspy-js/releases/tag/v1.0.0
