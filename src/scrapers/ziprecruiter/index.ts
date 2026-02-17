import * as cheerio from "cheerio";
import { Scraper } from "../base";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Compensation,
  type Location,
  Site,
  DescriptionFormat,
  getJobTypeFromString,
  getCountry,
} from "../../types";
import {
  createLogger,
  markdownConverter,
  extractEmails,
  sleep,
} from "../../utils";

const log = createLogger("ZipRecruiter");

const WEB_HEADERS: Record<string, string> = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
};

// ZipRecruiter pay interval numeric codes
const PAY_INTERVAL_MAP: Record<number, string> = {
  1: "hourly",
  2: "daily",
  3: "weekly",
  4: "monthly",
  5: "yearly",
};

// ZipRecruiter employment type numeric codes
const EMPLOYMENT_TYPE_MAP: Record<number, string> = {
  1: "fulltime",
  2: "parttime",
  3: "contract",
  4: "internship",
  5: "temporary",
};

export class ZipRecruiter extends Scraper {
  private baseUrl = "https://www.ziprecruiter.com";
  private jobsPerPage = 20;
  private seenUrls = new Set<string>();
  private scraper_input!: ScraperInput;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.ZIP_RECRUITER, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession("chrome_130");
    this.scraper_input = input;
    this.seenUrls.clear();

    const jobList: JobPost[] = [];
    const resultsWanted = input.results_wanted ?? 15;
    const maxPages = Math.ceil(resultsWanted / this.jobsPerPage);

    for (let page = 1; page <= maxPages; page++) {
      if (jobList.length >= resultsWanted) break;
      if (page > 1) await sleep(2000);
      log.info(`search page: ${page} / ${maxPages}`);

      const [jobs, hasMore] = await this.findJobsInPage(input, page);
      if (jobs.length) {
        jobList.push(...jobs);
      } else {
        break;
      }
      if (!hasMore) break;
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async findJobsInPage(
    input: ScraperInput,
    page: number,
  ): Promise<[JobPost[], boolean]> {
    const url = this.buildUrl(input, page);
    try {
      const res = await this.session.fetch(url, { headers: WEB_HEADERS });
      if (!res.ok) {
        log.error(`ZipRecruiter response status ${res.status} for page ${page}`);
        return [[], false];
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      const raw = $('script[type="application/json"]').first().text();
      if (!raw) {
        log.error("No JSON data found in ZipRecruiter page");
        return [[], false];
      }

      const data = JSON.parse(raw) as any;
      const jobCards: any[] = data.hydrateJobCardsResponse?.jobCards ?? [];
      const currentPage: number = data.page ?? page;
      const maxPages: number = data.maxPages ?? 1;

      // For page 1, also grab the full description of the first job
      const firstJobDetails = page === 1 ? data.getJobDetailsResponse?.jobDetails : null;

      const jobs: JobPost[] = [];
      for (let i = 0; i < jobCards.length; i++) {
        const card = jobCards[i];
        const fullDesc = (i === 0 && firstJobDetails?.listingKey === card.listingKey)
          ? firstJobDetails?.htmlFullDescription
          : undefined;
        const job = this.processCard(card, fullDesc);
        if (job) jobs.push(job);
      }

      return [jobs, currentPage < maxPages];
    } catch (e: any) {
      log.error(`ZipRecruiter page ${page}: ${e.message}`);
      return [[], false];
    }
  }

  private buildUrl(input: ScraperInput, page: number): string {
    const params = new URLSearchParams();
    if (input.search_term) params.set("search", input.search_term);
    if (input.location) params.set("location", input.location);
    if (input.hours_old) {
      params.set("days_ago", String(Math.max(Math.floor(input.hours_old / 24), 1)));
    }
    if (input.is_remote) params.set("remote", "1");
    if (input.distance) params.set("radius", String(input.distance));

    if (page === 1) {
      // First page uses candidate/search
      return `${this.baseUrl}/candidate/search?${params}`;
    } else {
      // Subsequent pages use jobs-search with page param
      params.set("page", String(page));
      return `${this.baseUrl}/jobs-search?${params}`;
    }
  }

  private processCard(card: any, fullDescription?: string): JobPost | null {
    const listingKey: string = card.listingKey;
    if (!listingKey) return null;

    const jobUrl = card.rawCanonicalZipJobPageUrl
      ? `${this.baseUrl}${card.rawCanonicalZipJobPageUrl}`
      : `${this.baseUrl}/jobs//j?lvk=${listingKey}`;

    if (this.seenUrls.has(jobUrl)) return null;
    this.seenUrls.add(jobUrl);

    const title: string = card.title ?? "";
    const companyName: string = card.company?.name ?? "";

    // Location
    const locData = card.location ?? {};
    const countryCode: string = locData.countryCode ?? "US";
    const countryValue = countryCode === "CA" ? "canada" : "usa";
    const countryEnum = getCountry(countryValue);
    const location: Location = {
      city: locData.city,
      state: locData.stateCode ?? locData.state,
      country: countryEnum?.name ?? countryCode,
    };

    // Job type
    const empTypeNum: number = card.employmentTypes?.[0]?.name ?? 0;
    const empTypeStr = EMPLOYMENT_TYPE_MAP[empTypeNum];
    const jobType = empTypeStr ? getJobTypeFromString(empTypeStr) : null;

    // Date posted
    const datePosted = card.status?.postedAtUtc
      ? new Date(card.status.postedAtUtc).toISOString().split("T")[0]
      : undefined;

    // Compensation
    const pay = card.pay ?? {};
    const intervalNum: number = pay.interval ?? 0;
    const interval = PAY_INTERVAL_MAP[intervalNum];
    const compensation: Compensation = {
      interval,
      min_amount: pay.min != null ? Math.floor(pay.min) : undefined,
      max_amount: pay.max != null ? Math.floor(pay.max) : undefined,
      currency: "USD",
    };

    // Description
    let description = fullDescription ?? card.shortDescription ?? "";
    if (
      description &&
      this.scraper_input.description_format === DescriptionFormat.MARKDOWN
    ) {
      description = markdownConverter(description) ?? description;
    }

    // Direct apply URL
    const jobUrlDirect: string | undefined =
      card.applyButtonConfig?.externalApplyUrl || undefined;

    return {
      id: `zr-${listingKey}`,
      title,
      company_name: companyName,
      location,
      job_type: jobType ? [jobType] : undefined,
      compensation,
      date_posted: datePosted,
      job_url: jobUrl,
      description: description || undefined,
      emails: extractEmails(description),
      job_url_direct: jobUrlDirect,
    };
  }
}
