import {
  type ScrapeJobsParams,
  type ScraperInput,
  type JobPost,
  type JobResponse,
  Site,
  JobType,
  DescriptionFormat,
  SalarySource,
  getCountry,
  displayLocation,
  DESIRED_COLUMNS,
} from "./types";
import { setLogLevel, extractSalary, convertToAnnual } from "./utils";
import { Indeed } from "./scrapers/indeed";
import { LinkedIn } from "./scrapers/linkedin";
import { Glassdoor } from "./scrapers/glassdoor";
import { Google } from "./scrapers/google";
import { ZipRecruiter } from "./scrapers/ziprecruiter";
import { Bayt } from "./scrapers/bayt";
import { Naukri } from "./scrapers/naukri";
import { BDJobs } from "./scrapers/bdjobs";
import type { Scraper } from "./scrapers/base";

const SCRAPER_MAP: Record<Site, new (opts: { proxies?: string | string[] | null }) => Scraper> = {
  [Site.INDEED]: Indeed,
  [Site.LINKEDIN]: LinkedIn,
  [Site.GLASSDOOR]: Glassdoor,
  [Site.GOOGLE]: Google,
  [Site.ZIP_RECRUITER]: ZipRecruiter,
  [Site.BAYT]: Bayt,
  [Site.NAUKRI]: Naukri,
  [Site.BDJOBS]: BDJobs,
};

function resolveSites(
  siteName?: string | string[] | Site | Site[],
): Site[] {
  if (!siteName) return Object.values(Site);
  if (typeof siteName === "string") return [mapStrToSite(siteName)];
  if (Array.isArray(siteName)) {
    return siteName.map((s) =>
      typeof s === "string" ? mapStrToSite(s) : s,
    );
  }
  return [siteName as Site];
}

function mapStrToSite(name: string): Site {
  const upper = name.toUpperCase();
  const site = (Site as any)[upper];
  if (site) return site;
  const normalized = name.toLowerCase().replace(/[_\s-]/g, "");
  // Try matching by value (exact, then normalized)
  for (const s of Object.values(Site)) {
    if (s === name.toLowerCase()) return s as Site;
    if ((s as string).replace(/_/g, "") === normalized) return s as Site;
  }
  throw new Error(`Unknown site: ${name}`);
}

function resolveJobType(jt?: string): JobType | undefined {
  if (!jt) return undefined;
  for (const t of Object.values(JobType)) {
    if (t === jt) return t;
  }
  throw new Error(`Invalid job type: ${jt}`);
}

export interface ScrapeJobsResult {
  jobs: FlatJobRecord[];
}

export interface FlatJobRecord {
  id?: string;
  site: string;
  job_url: string;
  job_url_direct?: string;
  title: string;
  company?: string;
  location?: string;
  date_posted?: string;
  job_type?: string;
  salary_source?: string;
  interval?: string;
  min_amount?: number;
  max_amount?: number;
  currency?: string;
  is_remote?: boolean;
  job_level?: string;
  job_function?: string;
  listing_type?: string;
  emails?: string;
  description?: string;
  company_industry?: string;
  company_url?: string;
  company_logo?: string;
  company_url_direct?: string;
  company_addresses?: string;
  company_num_employees?: string;
  company_revenue?: string;
  company_description?: string;
  skills?: string;
  experience_range?: string;
  company_rating?: number;
  company_reviews_count?: number;
  vacancy_count?: number;
  work_from_home_type?: string;
}

/**
 * Scrapes jobs from multiple job boards concurrently.
 *
 * @example
 * ```ts
 * import { scrapeJobs } from "jobspy-js";
 *
 * const result = await scrapeJobs({
 *   site_name: ["indeed", "linkedin"],
 *   search_term: "software engineer",
 *   location: "San Francisco, CA",
 *   results_wanted: 20,
 * });
 *
 * console.log(`Found ${result.jobs.length} jobs`);
 * ```
 */
export async function scrapeJobs(
  params: ScrapeJobsParams = {},
): Promise<ScrapeJobsResult> {
  setLogLevel(params.verbose ?? 0);

  const sites = resolveSites(params.site_name);
  const country = getCountry(params.country_indeed ?? "usa");
  const jobType = resolveJobType(params.job_type);
  const descFormat =
    (params.description_format as DescriptionFormat) ??
    DescriptionFormat.MARKDOWN;

  const scraperInput: ScraperInput = {
    site_type: sites,
    search_term: params.search_term,
    google_search_term: params.google_search_term,
    location: params.location,
    country,
    distance: params.distance ?? 50,
    is_remote: params.is_remote ?? false,
    job_type: jobType,
    easy_apply: params.easy_apply,
    offset: params.offset ?? 0,
    linkedin_fetch_description: params.linkedin_fetch_description ?? false,
    linkedin_company_ids: params.linkedin_company_ids,
    description_format: descFormat,
    results_wanted: params.results_wanted ?? 15,
    hours_old: params.hours_old,
  };

  const proxies = params.proxies
    ? typeof params.proxies === "string"
      ? [params.proxies]
      : params.proxies
    : undefined;

  // Scrape all sites concurrently
  const results = await Promise.allSettled(
    sites.map(async (site) => {
      const ScraperClass = SCRAPER_MAP[site];
      const scraper = new ScraperClass({ proxies });
      try {
        const response = await scraper.scrape(scraperInput);
        return { site: site as string, response };
      } finally {
        await scraper.close().catch(() => {});
      }
    }),
  );

  // Collect and flatten results
  const flatJobs: FlatJobRecord[] = [];

  for (const result of results) {
    if (result.status === "rejected") continue;
    const { site, response } = result.value;

    for (const job of response.jobs) {
      const record = flattenJob(job, site, country.name, params);
      flatJobs.push(record);
    }
  }

  // Sort by site, then date_posted descending
  flatJobs.sort((a, b) => {
    const siteCmp = (a.site ?? "").localeCompare(b.site ?? "");
    if (siteCmp !== 0) return siteCmp;
    const aDate = a.date_posted ?? "";
    const bDate = b.date_posted ?? "";
    return bDate.localeCompare(aDate);
  });

  return { jobs: flatJobs };
}

function flattenJob(
  job: JobPost,
  site: string,
  countryName: string,
  params: ScrapeJobsParams,
): FlatJobRecord {
  const record: FlatJobRecord = {
    id: job.id,
    site,
    job_url: job.job_url,
    job_url_direct: job.job_url_direct,
    title: job.title,
    company: job.company_name,
    location: job.location ? displayLocation(job.location) : undefined,
    date_posted: job.date_posted,
    job_type: job.job_type?.map((jt) => jt).join(", "),
    is_remote: job.is_remote,
    job_level: job.job_level,
    job_function: job.job_function,
    listing_type: job.listing_type,
    emails: job.emails?.join(", "),
    description: job.description,
    company_industry: job.company_industry,
    company_url: job.company_url,
    company_logo: job.company_logo,
    company_url_direct: job.company_url_direct,
    company_addresses: job.company_addresses,
    company_num_employees: job.company_num_employees,
    company_revenue: job.company_revenue,
    company_description: job.company_description,
    skills: job.skills?.join(", "),
    experience_range: job.experience_range,
    company_rating: job.company_rating,
    company_reviews_count: job.company_reviews_count,
    vacancy_count: job.vacancy_count,
    work_from_home_type: job.work_from_home_type,
  };

  // Handle compensation
  if (job.compensation?.min_amount != null || job.compensation?.max_amount != null) {
    record.interval = job.compensation.interval;
    record.min_amount = job.compensation.min_amount;
    record.max_amount = job.compensation.max_amount;
    record.currency = job.compensation.currency ?? "USD";
    record.salary_source = SalarySource.DIRECT_DATA;

    if (
      params.enforce_annual_salary &&
      record.interval &&
      record.interval !== "yearly" &&
      record.min_amount != null &&
      record.max_amount != null
    ) {
      convertToAnnual(record as any);
    }
  } else if (countryName === "usa" || countryName === "us") {
    // Try extracting salary from description
    const extracted = extractSalary(job.description, {
      enforceAnnual: params.enforce_annual_salary,
    });
    if (extracted) {
      record.interval = extracted.interval;
      record.min_amount = extracted.min_amount;
      record.max_amount = extracted.max_amount;
      record.currency = extracted.currency;
      record.salary_source = SalarySource.DESCRIPTION;
    }
  }

  // Clear salary_source if no salary data
  if (record.min_amount == null) {
    record.salary_source = undefined;
  }

  return record;
}
