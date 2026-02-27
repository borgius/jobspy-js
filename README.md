# jobspy-js

TypeScript port of [JobSpy](https://github.com/speedyapply/JobSpy) — scrape job postings from LinkedIn, Indeed, Glassdoor, Google Jobs, Google Careers, ZipRecruiter, Bayt, Naukri & BDJobs.

Uses [wreq-js](https://github.com/nicehash/wreq-js) for browser TLS fingerprint emulation (Chrome/Firefox/Safari).

## Features

- **9 job boards** — LinkedIn, Indeed, Glassdoor, Google Jobs, Google Careers, ZipRecruiter, Bayt, Naukri, BDJobs
- **3 interfaces** — SDK, CLI, MCP server
- **Config profiles** — define named search profiles in `jobspy.json`, run with `--profile`
- **Dedup tracking** — automatic per-profile deduplication across runs (URL + date window)
- **Browser emulation** — wreq-js with full TLS fingerprinting (JA3/JA4)
- **Proxy rotation** — built-in rotating proxy support
- **Concurrent scraping** — all sites scraped in parallel
- **Salary extraction** — parses compensation from descriptions when not provided directly
- **60+ countries** — Indeed/Glassdoor regional domain support

## Supported Sites

| Site | Key | Notes |
|------|-----|-------|
| LinkedIn | `linkedin` | HTML scraping |
| Indeed | `indeed` | GraphQL API |
| Glassdoor | `glassdoor` | GraphQL API |
| Google Jobs | `google` | Playwright (headless Chrome); requires clean residential IP or proxy |
| Google Careers | `google_careers` | Plain HTTP; scrapes jobs at Google the company |
| ZipRecruiter | `zip_recruiter` | Web scraping |
| Bayt | `bayt` | HTML scraping |
| Naukri | `naukri` | REST API |
| BDJobs | `bdjobs` | REST API |

## Installation

```bash
npm install jobspy-js
```

> **Google Jobs** (`google`) uses [Playwright](https://playwright.dev) to execute JavaScript. After installing, run:
> ```bash
> npx playwright install chromium
> ```

## SDK Usage

> **Full SDK reference:** See [SDK.md](https://github.com/borgius/jobspy-js/blob/master/SDK.md) for complete documentation — all parameters, types, enums, output fields, proxy configuration, country support, and advanced examples.

```ts
import { scrapeJobs, fetchLinkedInJob } from "jobspy-js";

// Scrape multiple job boards
const result = await scrapeJobs({
  site_name: ["indeed", "linkedin"],
  search_term: "software engineer",
  location: "San Francisco, CA",
  results_wanted: 20,
});

console.log(`Found ${result.jobs.length} jobs`);
for (const job of result.jobs) {
  console.log(`${job.title} at ${job.company} — ${job.job_url}`);
}

// Fetch details for a single LinkedIn job
const details = await fetchLinkedInJob("4127292817");
console.log(details.description);
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `site_name` | `string[]` | all sites | Job boards to scrape |
| `search_term` | `string` | — | Job title / search query |
| `location` | `string` | — | Job location (e.g. `"San Francisco, CA"`) |
| `distance` | `number` | `50` | Search radius in miles |
| `is_remote` | `boolean` | `false` | Filter for remote jobs |
| `job_type` | `string` | — | `fulltime`, `parttime`, `contract`, `internship` |
| `results_wanted` | `number` | `15` | Results per site |
| `country_indeed` | `string` | `"usa"` | Country for Indeed/Glassdoor |
| `hours_old` | `number` | — | Filter jobs posted within N hours |
| `description_format` | `string` | `"markdown"` | `markdown`, `html`, or `plain` |
| `proxies` | `string \| string[]` | — | Proxy servers (`user:pass@host:port`) |
| `linkedin_fetch_description` | `boolean` | `false` | Fetch full LinkedIn descriptions (slower) |
| `enforce_annual_salary` | `boolean` | `false` | Convert all salaries to annual |
| `profile` | `string` | — | Named profile for dedup tracking |
| `skip_dedup` | `boolean` | `false` | Skip dedup filtering (still updates state) |

### fetchLinkedInJob()

Fetch full details for a single LinkedIn job by ID or URL:

```ts
import { fetchLinkedInJob } from "jobspy-js";

const job = await fetchLinkedInJob("4127292817");
// or: fetchLinkedInJob("https://www.linkedin.com/jobs/view/4127292817")

console.log(job.description);        // full job description (markdown)
console.log(job.job_level);          // "mid-senior level"
console.log(job.job_type);           // ["fulltime"]
console.log(job.company_industry);   // "Software Development"
console.log(job.job_url_direct);     // direct application URL
```

Options: `{ format?: "markdown"|"html"|"plain", proxies?: string|string[] }`

> **Full reference:** See [SDK.md](https://github.com/borgius/jobspy-js/blob/master/SDK.md#fetchlinkedinjob) for all fields and examples.

## CLI

### Quick Start

```bash
# Search for React jobs on LinkedIn
jobspy -s linkedin -q "react developer" -l "New York, NY" -n 20

# Multiple sites, remote only, output to file
jobspy -s linkedin indeed -q "typescript" -r -o results.json

# CSV output with salary normalization
jobspy -s indeed -q "python" --enforce-annual-salary -o jobs.csv

# Google Careers (jobs at Google)
jobspy -s google_careers -q "software engineer" -l "USA" -n 10

# Fetch full details for a single LinkedIn job
jobspy --describe 4127292817
jobspy --describe https://www.linkedin.com/jobs/view/4127292817
```

### All CLI Options

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `-s, --site <sites...>` | | all sites | Job boards to scrape |
| `-q, --search-term <term>` | | — | Search query |
| `--google-search-term <term>` | | — | Override search term for Google only |
| `-l, --location <location>` | | — | Job location |
| `-d, --distance <miles>` | | `50` | Search radius in miles |
| `-r, --remote` | | `false` | Filter for remote jobs |
| `-t, --job-type <type>` | | — | `fulltime`, `parttime`, `contract`, `internship` |
| `--easy-apply` | | `false` | Filter for easy apply jobs |
| `-n, --results <count>` | `--limit` | `15` | Number of results per site |
| `--limit <count>` | | — | Alias for `--results` |
| `-c, --country <country>` | | `usa` | Country for Indeed/Glassdoor |
| `-p, --proxies <proxies...>` | | — | Proxy servers |
| `--format <format>` | | `markdown` | Description format: `markdown`, `html`, `plain` |
| `--linkedin-fetch-description` | | `false` | Fetch full LinkedIn descriptions |
| `--linkedin-company-ids <ids...>` | | — | Filter by LinkedIn company IDs |
| `--offset <offset>` | | `0` | Pagination offset |
| `--hours-old <hours>` | | — | Only jobs posted within N hours |
| `--enforce-annual-salary` | | `false` | Convert all salaries to annual |
| `-v, --verbose <level>` | | `0` | `0`=errors, `1`=warnings, `2`=all |
| `-o, --output <file>` | | stdout | Output file (`.json` or `.csv`) |
| `--profile <name>` | | — | Use a named profile from `jobspy.json` |
| `--all` | | `false` | Skip dedup for this run (still updates state) |
| `--list-profiles` | | — | List all saved profiles |
| `--init` | | — | Generate a `jobspy.json` with sample profiles |
| `--describe <jobId>` | | — | Fetch full LinkedIn job details by ID or URL |

## Config File (`jobspy.json`)

The CLI supports a unified config file that stores both **search profiles** and **dedup state** in a single `jobspy.json` file.

### Generating a Config

```bash
jobspy --init
```

This creates a `jobspy.json` in the current directory with two sample profiles:

```json
{
  "config": {
    "profiles": {
      "frontend": {
        "site": ["linkedin", "indeed", "zip_recruiter", "glassdoor", ...],
        "search_term": "react frontend developer",
        "google_search_term": "react frontend developer jobs near New York NY",
        "location": "New York, NY",
        "distance": 25,
        "remote": false,
        "job_type": "fulltime",
        "results": 50,
        "country": "usa",
        "format": "markdown",
        "linkedin_fetch_description": true,
        "hours_old": 72,
        "enforce_annual_salary": true,
        "verbose": 1,
        "output": "frontend-jobs.csv"
      },
      "backend": {
        "site": ["linkedin", "indeed", "zip_recruiter", "glassdoor", ...],
        "search_term": "node.js backend engineer",
        "google_search_term": "node.js backend engineer jobs near New York NY",
        "location": "New York, NY",
        "distance": 25,
        "remote": true,
        "job_type": "fulltime",
        "results": 50,
        "hours_old": 48,
        "output": "backend-jobs.json"
      }
    }
  },
  "state": {
    "version": 1,
    "profiles": {}
  }
}
```

### Config Profile Options

Each profile in `config.profiles` supports the following keys:

| Key | Type | Description |
|-----|------|-------------|
| `site` | `string[]` | Job boards to scrape |
| `search_term` | `string` | Search query |
| `google_search_term` | `string` | Override search term for Google |
| `location` | `string` | Job location |
| `distance` | `number` | Search radius in miles |
| `remote` | `boolean` | Filter for remote jobs |
| `job_type` | `string` | Employment type filter |
| `easy_apply` | `boolean` | Easy apply filter |
| `results` | `number` | Results per site |
| `country` | `string` | Country for Indeed/Glassdoor |
| `proxies` | `string[]` | Proxy servers |
| `format` | `string` | Description format |
| `linkedin_fetch_description` | `boolean` | Fetch full LinkedIn descriptions |
| `linkedin_company_ids` | `number[]` | LinkedIn company ID filter |
| `offset` | `number` | Pagination offset |
| `hours_old` | `number` | Max age of postings in hours |
| `enforce_annual_salary` | `boolean` | Normalize salaries to annual |
| `verbose` | `number` | Log verbosity level |
| `output` | `string` | Output file path |

### Running Profiles

```bash
# Run the frontend profile — uses all settings from jobspy.json
jobspy --profile frontend

# Run backend profile
jobspy --profile backend

# Override a config value with a CLI flag
jobspy --profile frontend -n 10 -l "San Francisco, CA"

# List all profiles and their last run times
jobspy --list-profiles
```

CLI flags always take priority over config profile values. This lets you use a profile as a base and override specific options per run.

### Adding Your Own Profiles

Edit `jobspy.json` and add a new entry under `config.profiles`:

```json
{
  "config": {
    "profiles": {
      "frontend": { "..." : "..." },
      "backend": { "..." : "..." },
      "devops-remote": {
        "site": ["linkedin", "indeed"],
        "search_term": "devops engineer",
        "location": "United States",
        "remote": true,
        "job_type": "fulltime",
        "results": 30,
        "hours_old": 24,
        "output": "devops-jobs.csv"
      }
    }
  },
  "state": { "..." : "..." }
}
```

Then run it:

```bash
jobspy --profile devops-remote
```

## Dedup / Incremental Runs

When you use `--profile`, jobspy automatically tracks which jobs you've already seen. On subsequent runs, only **new** jobs are returned.

### How It Works

1. **URL rolling window** — every scraped job URL is recorded with a timestamp. URLs seen within the last 7 days are filtered out on the next run.
2. **Date watermark** — the most recent `date_posted` per provider is saved. Jobs with a date on or before this watermark are skipped.
3. **State is always updated** — even when using `--all` to skip filtering, the state is still updated so the next normal run knows what's been seen.

### Examples

```bash
# First run — returns all 50 jobs, saves state
jobspy --profile frontend
# Found 50 jobs

# Second run (hours later) — returns only new postings
jobspy --profile frontend
# Found 3 jobs (47 already seen)

# Force all results (skip dedup), but still update state
jobspy --profile frontend --all
# Found 50 jobs

# Check profile status
jobspy --list-profiles
# Profiles in /path/to/jobspy.json:
#   frontend             last run: 2/27/2026, 3:15:00 PM  sites: linkedin, indeed, ...  term: react frontend developer
#   backend              last run: never  sites: linkedin, indeed, ...  term: node.js backend engineer
```

### State Section

The `state` section of `jobspy.json` is managed automatically. You should not need to edit it by hand, but here's what it looks like after a run:

```json
{
  "state": {
    "version": 1,
    "profiles": {
      "frontend": {
        "lastRunAt": "2026-02-27T15:30:00.000Z",
        "providers": {
          "linkedin": {
            "lastSeenDate": "2026-02-27",
            "seenUrls": [
              { "url": "https://linkedin.com/jobs/view/123", "seenAt": "2026-02-27" }
            ]
          },
          "indeed": {
            "lastSeenDate": "2026-02-26",
            "seenUrls": []
          }
        }
      }
    }
  }
}
```

URLs older than 7 days are automatically pruned on each run to keep the file size manageable.

### Ad-hoc Profiles

You don't need a config profile to use dedup. Running `--profile` with any name creates state tracking for it, even without a matching config entry:

```bash
# No config profile needed — CLI flags define the search
jobspy --profile my-search -s linkedin -q "rust developer" -l "Austin, TX" -n 20
```

## MCP Server

Add to your MCP client config:

```json
{
  "mcpServers": {
    "jobspy": {
      "command": "npx",
      "args": ["-y", "jobspy-js", "--mcp"]
    }
  }
}
```

The MCP server exposes a `scrape_jobs` tool with all the same parameters as the SDK.

## Development

```bash
git clone https://github.com/borgius/jobspy-js.git
cd jobspy-js
npm install

# Build
npm run build

# Type check
npm run typecheck

# Run CLI from source
npm run cli -- -s linkedin -q "react" -n 5

# Run tests
npm test
```

## Project Structure

```
src/
├── index.ts              # SDK entry point
├── scraper.ts            # Main scrapeJobs() orchestrator
├── state.ts              # Profile state, dedup logic, file I/O
├── types.ts              # All types, enums, country config
├── utils.ts              # Logger, proxy rotation, HTML helpers
├── cli/index.ts          # CLI (commander)
├── mcp/index.ts          # MCP server
└── scrapers/
    ├── base.ts           # Abstract Scraper base class
    ├── indeed/           # GraphQL API
    ├── linkedin/         # HTML scraping
    ├── glassdoor/        # GraphQL API
    ├── google/           # Playwright headless Chrome
    ├── google-careers/   # Plain HTTP; AF_initDataCallback JSON parsing
    ├── ziprecruiter/     # Web scraping
    ├── bayt/             # HTML scraping
    ├── naukri/           # REST API
    └── bdjobs/           # REST API
```

## License

MIT
