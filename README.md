# jobspy-js

TypeScript port of [JobSpy](https://github.com/speedyapply/JobSpy) — scrape job postings from LinkedIn, Indeed, Glassdoor, Google Jobs, Google Careers, ZipRecruiter, Bayt, Naukri & BDJobs.

Uses [wreq-js](https://github.com/nicehash/wreq-js) for browser TLS fingerprint emulation (Chrome/Firefox/Safari).

## Features

- **9 job boards** — LinkedIn, Indeed, Glassdoor, Google Jobs, Google Careers, ZipRecruiter, Bayt, Naukri, BDJobs
- **3 interfaces** — SDK, CLI, MCP server
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

```ts
import { scrapeJobs } from "jobspy-js";

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

## CLI

```bash
# Search for React jobs on LinkedIn
npx jobspy -s linkedin -q "react developer" -l "New York, NY" -n 20

# Multiple sites, remote only, output to file
npx jobspy -s linkedin indeed -q "typescript" -r -o results.json

# CSV output
npx jobspy -s indeed -q "python" -o jobs.csv

# Google Careers (jobs at Google)
npx jobspy -s google_careers -q "software engineer" -l "USA" -n 10
```

Run `npx jobspy --help` for all options.

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
