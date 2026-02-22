# jobspy-js SDK Reference

Comprehensive SDK documentation for [jobspy-js](https://github.com/borgius/jobspy-js) — scrape job postings from 9 job boards with a single function call.

## Table of Contents

- [Quick Start](#quick-start)
- [scrapeJobs()](#scrapejobs)
  - [Parameters](#parameters)
  - [Return Value](#return-value)
- [Types & Enums](#types--enums)
  - [Site](#site)
  - [JobType](#jobtype)
  - [CompensationInterval](#compensationinterval)
  - [DescriptionFormat](#descriptionformat)
  - [SalarySource](#salarysource)
  - [Location](#location)
  - [Compensation](#compensation)
  - [Country](#country)
- [Output Fields](#output-fields)
- [Proxy Configuration](#proxy-configuration)
- [Country Support](#country-support)
- [Helper Functions](#helper-functions)
- [Scraper-Specific Behavior](#scraper-specific-behavior)
- [Examples](#examples)
  - [Basic Search](#basic-search)
  - [Multiple Sites](#multiple-sites)
  - [Remote Jobs with Salary Filter](#remote-jobs-with-salary-filter)
  - [International Search](#international-search)
  - [With Proxy Rotation](#with-proxy-rotation)
  - [LinkedIn Company Filter](#linkedin-company-filter)
  - [Pagination with Offset](#pagination-with-offset)
  - [Recent Jobs Only](#recent-jobs-only)
- [Error Handling](#error-handling)
- [Exports](#exports)

---

## Quick Start

```bash
npm install jobspy-js
```

```ts
import { scrapeJobs } from "jobspy-js";

const { jobs } = await scrapeJobs({
  site_name: ["indeed", "linkedin"],
  search_term: "software engineer",
  location: "San Francisco, CA",
  results_wanted: 20,
});

for (const job of jobs) {
  console.log(`${job.title} at ${job.company} — ${job.job_url}`);
}
```

---

## scrapeJobs()

The main entry point. Scrapes one or more job boards concurrently and returns a unified, flattened result set.

```ts
import { scrapeJobs } from "jobspy-js";

const result = await scrapeJobs(params?: ScrapeJobsParams): Promise<ScrapeJobsResult>
```

All sites are scraped **in parallel** via `Promise.allSettled`. If one site fails, the others still return results. Results are sorted by site name (alphabetical), then by `date_posted` descending (newest first).

### Parameters

```ts
interface ScrapeJobsParams {
  site_name?:                   string | string[] | Site | Site[];
  search_term?:                 string;
  google_search_term?:          string;
  location?:                    string;
  distance?:                    number;
  is_remote?:                   boolean;
  job_type?:                    string;
  easy_apply?:                  boolean;
  results_wanted?:              number;
  country_indeed?:              string;
  proxies?:                     string | string[];
  description_format?:          string;
  linkedin_fetch_description?:  boolean;
  linkedin_company_ids?:        number[];
  offset?:                      number;
  hours_old?:                   number;
  enforce_annual_salary?:       boolean;
  verbose?:                     number;
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `site_name` | `string \| string[] \| Site \| Site[]` | All sites | Job boards to scrape. Accepts enum values, string keys, or arrays. Site names are normalized — `"ziprecruiter"`, `"zip_recruiter"`, and `"zip-recruiter"` all work. |
| `search_term` | `string` | — | Job title or search query (e.g. `"react developer"`). |
| `google_search_term` | `string` | — | Overrides `search_term` for the Google scraper only. Useful for customizing Google's broader search syntax. |
| `location` | `string` | — | Job location (e.g. `"San Francisco, CA"`, `"London"`, `"Remote"`). |
| `distance` | `number` | `50` | Search radius in miles from the specified location. |
| `is_remote` | `boolean` | `false` | Filter for remote jobs only. |
| `job_type` | `string` | — | Filter by employment type: `"fulltime"`, `"parttime"`, `"contract"`, `"internship"`, `"temporary"`. |
| `easy_apply` | `boolean` | — | Filter for easy-apply jobs (supported on LinkedIn, Indeed, Glassdoor). |
| `results_wanted` | `number` | `15` | Maximum number of results **per site**. Total results may be up to `results_wanted * number_of_sites`. |
| `country_indeed` | `string` | `"usa"` | Country for Indeed and Glassdoor regional domains. See [Country Support](#country-support). |
| `proxies` | `string \| string[]` | — | Proxy server(s) for rotating requests. See [Proxy Configuration](#proxy-configuration). |
| `description_format` | `string` | `"markdown"` | Format for job descriptions: `"markdown"`, `"html"`, or `"plain"`. |
| `linkedin_fetch_description` | `boolean` | `false` | Fetch full job descriptions from LinkedIn (requires an extra HTTP request per job — slower). |
| `linkedin_company_ids` | `number[]` | — | Filter LinkedIn results to specific company IDs. |
| `offset` | `number` | `0` | Skip the first N results (pagination offset). |
| `hours_old` | `number` | — | Only return jobs posted within the last N hours. |
| `enforce_annual_salary` | `boolean` | `false` | Convert all salary figures to annual equivalents (hourly × 2080, monthly × 12, etc.). |
| `verbose` | `number` | `0` | Logging verbosity: `0` = errors only, `1` = warnings, `2` = all. |

### Return Value

```ts
interface ScrapeJobsResult {
  jobs: FlatJobRecord[];
}
```

Returns an object with a `jobs` array. Each job is a flat record (nested objects like `location` and `compensation` are flattened to top-level fields).

---

## Types & Enums

All types and enums are exported from the package root:

```ts
import {
  Site, JobType, CompensationInterval, DescriptionFormat, SalarySource,
  type JobPost, type JobResponse, type Compensation, type Location,
  type ScrapeJobsParams, type ScraperInput, type Country,
} from "jobspy-js";
```

### Site

```ts
enum Site {
  LINKEDIN       = "linkedin",
  INDEED         = "indeed",
  ZIP_RECRUITER  = "zip_recruiter",
  GLASSDOOR      = "glassdoor",
  GOOGLE         = "google",
  GOOGLE_CAREERS = "google_careers",
  BAYT           = "bayt",
  NAUKRI         = "naukri",
  BDJOBS         = "bdjobs",
}
```

When passing `site_name` as a string, the input is normalized (underscores, hyphens, and spaces are stripped before matching), so `"ziprecruiter"`, `"zip_recruiter"`, and `"zip-recruiter"` all resolve to `Site.ZIP_RECRUITER`.

### JobType

```ts
enum JobType {
  FULL_TIME  = "fulltime",
  PART_TIME  = "parttime",
  CONTRACT   = "contract",
  TEMPORARY  = "temporary",
  INTERNSHIP = "internship",
  PER_DIEM   = "perdiem",
  NIGHTS     = "nights",
  OTHER      = "other",
  SUMMER     = "summer",
  VOLUNTEER  = "volunteer",
}
```

Not all job types are supported on every site. See [Scraper-Specific Behavior](#scraper-specific-behavior) for details.

### CompensationInterval

```ts
enum CompensationInterval {
  YEARLY  = "yearly",
  MONTHLY = "monthly",
  WEEKLY  = "weekly",
  DAILY   = "daily",
  HOURLY  = "hourly",
}
```

### DescriptionFormat

```ts
enum DescriptionFormat {
  MARKDOWN = "markdown",
  HTML     = "html",
  PLAIN    = "plain",
}
```

Controls how job descriptions are formatted in the output. `markdown` converts HTML descriptions to Markdown. `html` preserves the original HTML. `plain` strips all markup.

### SalarySource

```ts
enum SalarySource {
  DIRECT_DATA = "direct_data",
  DESCRIPTION = "description",
}
```

Indicates whether salary data came from structured fields in the job listing (`direct_data`) or was extracted via regex from the description text (`description`).

### Location

```ts
interface Location {
  city?:    string;
  state?:   string;
  country?: string;
}
```

### Compensation

```ts
interface Compensation {
  interval?:   CompensationInterval;
  min_amount?: number;
  max_amount?: number;
  currency?:   string;
}
```

### Country

```ts
interface Country {
  name:              string;
  indeed_domain:     string;
  indeed_api_code:   string;
  glassdoor_domain?: string;
}
```

Used internally to resolve regional domains for Indeed and Glassdoor. Retrieve with `getCountry("usa")`.

---

## Output Fields

Each job in the returned `jobs` array is a `FlatJobRecord` — a flat object with all nested structures expanded to top-level fields.

| Field | Type | Description | Sources |
|-------|------|-------------|---------|
| `id` | `string` | Unique job ID with site prefix (e.g. `"li-123"`, `"in-abc"`) | All |
| `site` | `string` | Source site key (e.g. `"linkedin"`, `"indeed"`) | All |
| `job_url` | `string` | Canonical job URL on the board | All |
| `job_url_direct` | `string?` | Direct employer/ATS URL | LinkedIn, Indeed, ZipRecruiter |
| `title` | `string` | Job title | All |
| `company` | `string?` | Company name | All |
| `location` | `string?` | Formatted as `"City, State, Country"` | All |
| `date_posted` | `string?` | ISO date `"YYYY-MM-DD"` | All |
| `job_type` | `string?` | Comma-separated (e.g. `"fulltime, contract"`) | All |
| `salary_source` | `string?` | `"direct_data"` or `"description"` | All |
| `interval` | `string?` | Pay interval: `"yearly"`, `"hourly"`, etc. | All |
| `min_amount` | `number?` | Minimum salary/pay amount | All |
| `max_amount` | `number?` | Maximum salary/pay amount | All |
| `currency` | `string?` | Currency code (e.g. `"USD"`, `"EUR"`) | All |
| `is_remote` | `boolean?` | Whether the job is remote | All |
| `job_level` | `string?` | Seniority level (e.g. `"mid-senior level"`) | LinkedIn |
| `job_function` | `string?` | Job function category | LinkedIn |
| `listing_type` | `string?` | E.g. `"sponsored"` | LinkedIn, Indeed |
| `emails` | `string?` | Comma-separated emails extracted from description | All |
| `description` | `string?` | Full job description (format per `description_format`) | All |
| `company_industry` | `string?` | Industry classification | LinkedIn, Indeed |
| `company_url` | `string?` | Company page on the job board | LinkedIn, Glassdoor |
| `company_logo` | `string?` | Company logo URL | Indeed, Naukri |
| `company_url_direct` | `string?` | Company's own website URL | LinkedIn, Indeed |
| `company_addresses` | `string?` | Company address(es) | Indeed |
| `company_num_employees` | `string?` | Employee count range | Indeed |
| `company_revenue` | `string?` | Revenue range | Indeed |
| `company_description` | `string?` | Company description text | Indeed |
| `skills` | `string?` | Comma-separated skill tags | Naukri |
| `experience_range` | `string?` | Required experience (e.g. `"3-5 years"`) | Naukri |
| `company_rating` | `number?` | Company rating (e.g. `4.2`) | Naukri |
| `company_reviews_count` | `number?` | Number of company reviews | Naukri |
| `vacancy_count` | `number?` | Number of open positions | Naukri |
| `work_from_home_type` | `string?` | `"Remote"`, `"Hybrid"`, `"Work from office"` | Naukri |

---

## Proxy Configuration

Pass proxies via the `proxies` parameter. They rotate round-robin across concurrent scraper instances.

```ts
// Single proxy
const result = await scrapeJobs({
  search_term: "developer",
  proxies: "user:pass@proxy.example.com:8080",
});

// Multiple proxies (round-robin rotation)
const result = await scrapeJobs({
  search_term: "developer",
  proxies: [
    "user:pass@proxy1.example.com:8080",
    "user:pass@proxy2.example.com:8080",
    "user:pass@proxy3.example.com:8080",
  ],
});
```

**Accepted formats:**

| Format | Example |
|--------|---------|
| `host:port` | `proxy.example.com:8080` |
| `user:pass@host:port` | `admin:secret@proxy.example.com:8080` |
| `http://host:port` | `http://proxy.example.com:8080` |
| `https://host:port` | `https://proxy.example.com:8080` |
| `socks5://host:port` | `socks5://proxy.example.com:1080` |

Bare `host:port` strings are automatically prefixed with `http://`.

---

## Country Support

The `country_indeed` parameter controls regional domains for **Indeed** and **Glassdoor**. Country names are resolved case-insensitively. The default is `"usa"`.

<details>
<summary>Full list of 60+ supported countries</summary>

| Country | Indeed | Glassdoor |
|---------|--------|-----------|
| Argentina | Yes | Yes |
| Australia | Yes | Yes |
| Austria | Yes | Yes |
| Bahrain | Yes | No |
| Bangladesh | Yes | No |
| Belgium | Yes | Yes |
| Brazil | Yes | Yes |
| Canada | Yes | Yes |
| Chile | Yes | No |
| China | Yes | No |
| Colombia | Yes | No |
| Costa Rica | Yes | No |
| Czech Republic | Yes | No |
| Denmark | Yes | No |
| Ecuador | Yes | No |
| Egypt | Yes | No |
| Finland | Yes | No |
| France | Yes | Yes |
| Germany | Yes | Yes |
| Greece | Yes | No |
| Hong Kong | Yes | Yes |
| Hungary | Yes | No |
| India | Yes | Yes |
| Indonesia | Yes | No |
| Ireland | Yes | Yes |
| Israel | Yes | No |
| Italy | Yes | Yes |
| Japan | Yes | No |
| Kuwait | Yes | No |
| Luxembourg | Yes | No |
| Malaysia | Yes | No |
| Mexico | Yes | Yes |
| Morocco | Yes | No |
| Netherlands | Yes | Yes |
| New Zealand | Yes | Yes |
| Nigeria | Yes | No |
| Norway | Yes | No |
| Oman | Yes | No |
| Pakistan | Yes | No |
| Panama | Yes | No |
| Peru | Yes | No |
| Philippines | Yes | No |
| Poland | Yes | No |
| Portugal | Yes | No |
| Qatar | Yes | No |
| Romania | Yes | No |
| Saudi Arabia | Yes | No |
| Singapore | Yes | Yes |
| South Africa | Yes | No |
| South Korea | Yes | No |
| Spain | Yes | Yes |
| Sweden | Yes | No |
| Switzerland | Yes | Yes |
| Taiwan | Yes | No |
| Thailand | Yes | No |
| Turkey | Yes | No |
| Ukraine | Yes | No |
| United Arab Emirates | Yes | No |
| United Kingdom | Yes | Yes |
| USA | Yes | Yes |
| Uruguay | Yes | No |
| Venezuela | Yes | No |
| Vietnam | Yes | No |

</details>

Aliases: `"us"`, `"usa"`, `"united states"` all map to USA. `"uk"` maps to United Kingdom. `"czechia"` maps to Czech Republic.

---

## Helper Functions

These utility functions are exported from the package root.

| Function | Signature | Description |
|----------|-----------|-------------|
| `getCountry` | `(name: string) => Country` | Resolves a country by name (case-insensitive). Throws if not found. |
| `displayLocation` | `(loc: Location) => string` | Formats a `Location` object as `"City, State, Country"`. |

---

## Scraper-Specific Behavior

Each scraper has different capabilities and limitations:

| Scraper | Method | Supported `job_type` values | Notable behavior |
|---------|--------|-----------------------------|------------------|
| **LinkedIn** | HTML scraping | `fulltime`, `parttime`, `internship`, `contract`, `temporary` | Set `linkedin_fetch_description: true` for full descriptions (slower). Supports `linkedin_company_ids` filter. |
| **Indeed** | GraphQL API | `fulltime`, `parttime`, `contract`, `internship` | Uses iOS mobile API. Provides rich company metadata (revenue, employee count, addresses). |
| **Glassdoor** | GraphQL API | All types | Uses `country_indeed` for domain selection. Some countries have no Glassdoor domain. |
| **Google Jobs** | Playwright | `fulltime`, `parttime`, `internship`, `contract` | Requires `npx playwright install chromium`. Currently broken upstream (JS challenge page). |
| **Google Careers** | HTTP + JSON | — | Scrapes jobs **at Google** (the company), not a general job board. |
| **ZipRecruiter** | Web scraping | `fulltime`, `parttime`, `contract`, `internship`, `temporary` | US-only. 20 results per page. |
| **Bayt** | HTML scraping | — | Middle East focused job board. |
| **Naukri** | REST API | — | India focused. Returns skills, experience range, company ratings. |
| **BDJobs** | REST API | — | Bangladesh focused job board. |

---

## Examples

### Basic Search

```ts
import { scrapeJobs } from "jobspy-js";

const { jobs } = await scrapeJobs({
  site_name: "indeed",
  search_term: "software engineer",
  location: "New York, NY",
});

console.log(`Found ${jobs.length} jobs`);
```

### Multiple Sites

```ts
const { jobs } = await scrapeJobs({
  site_name: ["linkedin", "indeed", "glassdoor"],
  search_term: "data scientist",
  location: "San Francisco, CA",
  results_wanted: 25,
});

// Group by site
const bySite = Object.groupBy(jobs, (j) => j.site);
for (const [site, siteJobs] of Object.entries(bySite)) {
  console.log(`${site}: ${siteJobs.length} jobs`);
}
```

### Remote Jobs with Salary Filter

```ts
const { jobs } = await scrapeJobs({
  site_name: ["linkedin", "indeed"],
  search_term: "frontend developer",
  is_remote: true,
  enforce_annual_salary: true,
});

const wellPaid = jobs.filter((j) => j.min_amount && j.min_amount >= 100000);
console.log(`${wellPaid.length} remote jobs paying $100k+`);
```

### International Search

```ts
// Search Indeed and Glassdoor in Germany
const { jobs } = await scrapeJobs({
  site_name: ["indeed", "glassdoor"],
  search_term: "Softwareentwickler",
  location: "Berlin",
  country_indeed: "germany",
});
```

### With Proxy Rotation

```ts
const { jobs } = await scrapeJobs({
  site_name: ["linkedin", "indeed", "glassdoor", "ziprecruiter"],
  search_term: "devops engineer",
  location: "Austin, TX",
  results_wanted: 50,
  proxies: [
    "user:pass@us-proxy1.example.com:8080",
    "user:pass@us-proxy2.example.com:8080",
  ],
});
```

### LinkedIn Company Filter

```ts
// Only jobs from specific LinkedIn company IDs
const { jobs } = await scrapeJobs({
  site_name: "linkedin",
  search_term: "product manager",
  linkedin_company_ids: [1441, 1035],  // Google, Microsoft
  linkedin_fetch_description: true,
});
```

### Pagination with Offset

```ts
// First page
const page1 = await scrapeJobs({
  site_name: "indeed",
  search_term: "nurse",
  location: "Chicago, IL",
  results_wanted: 20,
  offset: 0,
});

// Second page
const page2 = await scrapeJobs({
  site_name: "indeed",
  search_term: "nurse",
  location: "Chicago, IL",
  results_wanted: 20,
  offset: 20,
});
```

### Recent Jobs Only

```ts
// Jobs posted in the last 24 hours
const { jobs } = await scrapeJobs({
  site_name: ["linkedin", "indeed"],
  search_term: "machine learning engineer",
  hours_old: 24,
  description_format: "plain",
});
```

---

## Error Handling

`scrapeJobs()` uses `Promise.allSettled` internally, so individual scraper failures don't crash the entire call. Failed scrapers are silently skipped — you'll receive results from whichever sites succeeded.

```ts
try {
  const { jobs } = await scrapeJobs({
    site_name: ["linkedin", "indeed", "glassdoor"],
    search_term: "developer",
  });

  if (jobs.length === 0) {
    console.log("No jobs found — try broadening your search");
  }
} catch (err) {
  // Only throws if all scrapers fail or params are invalid
  console.error("Scrape failed:", err);
}
```

Set `verbose: 2` to see detailed logs from each scraper for debugging:

```ts
const { jobs } = await scrapeJobs({
  search_term: "developer",
  verbose: 2,
});
```

---

## Exports

Everything exported from `"jobspy-js"`:

```ts
// Main function
export { scrapeJobs } from "./scraper";

// Enums
export { Site, JobType, CompensationInterval, DescriptionFormat, SalarySource } from "./types";

// Types
export type { JobPost, JobResponse, Compensation, Location } from "./types";
export type { ScrapeJobsParams, ScraperInput, Country } from "./types";

// Constants & helpers
export { DESIRED_COLUMNS, getCountry, displayLocation } from "./types";
```
