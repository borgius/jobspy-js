import * as cheerio from "cheerio";
import { Scraper } from "../base";
import { HEADERS, COOKIE_DATA } from "./constants";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Compensation,
  type Location,
  Site,
  JobType,
  DescriptionFormat,
  getJobTypeFromString,
  getCountry,
} from "../../types";
import {
  createLogger,
  markdownConverter,
  extractEmails,
  removeAttributes,
  sleep,
} from "../../utils";

const log = createLogger("ZipRecruiter");

export class ZipRecruiter extends Scraper {
  private baseUrl = "https://www.ziprecruiter.com";
  private apiUrl = "https://api.ziprecruiter.com";
  private delay = 5;
  private jobsPerPage = 20;
  private seenUrls = new Set<string>();
  private scraper_input!: ScraperInput;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.ZIP_RECRUITER, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession();
    this.scraper_input = input;
    this.seenUrls.clear();

    // Initialize cookies
    await this.getCookies();

    const jobList: JobPost[] = [];
    let continueToken: string | null = null;
    const resultsWanted = input.results_wanted ?? 15;
    const maxPages = Math.ceil(resultsWanted / this.jobsPerPage);

    for (let page = 1; page <= maxPages; page++) {
      if (jobList.length >= resultsWanted) break;
      if (page > 1) await sleep(this.delay * 1000);
      log.info(`search page: ${page} / ${maxPages}`);

      const [jobs, nextToken] = await this.findJobsInPage(input, continueToken);
      if (jobs.length) {
        jobList.push(...jobs);
      } else {
        break;
      }
      continueToken = nextToken;
      if (!continueToken) break;
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async findJobsInPage(
    input: ScraperInput,
    continueToken: string | null,
  ): Promise<[JobPost[], string | null]> {
    const params = this.buildParams(input);
    if (continueToken) params.set("continue_from", continueToken);

    try {
      const res = await this.session.fetch(
        `${this.apiUrl}/jobs-app/jobs?${params}`,
        { headers: HEADERS },
      );
      if (!res.ok) {
        if (res.status === 429) {
          log.error("429 Response - Blocked by ZipRecruiter for too many requests");
        } else {
          log.error(`ZipRecruiter response status code ${res.status}`);
        }
        return [[], null];
      }

      const data = (await res.json()) as any;
      const jobsRaw = data.jobs ?? [];
      const nextToken = data.continue ?? null;

      const jobs = await Promise.all(
        jobsRaw.map((j: any) => this.processJob(j)),
      );
      return [jobs.filter(Boolean) as JobPost[], nextToken];
    } catch (e: any) {
      log.error(`ZipRecruiter: ${e.message}`);
      return [[], null];
    }
  }

  private buildParams(input: ScraperInput): URLSearchParams {
    const params = new URLSearchParams();
    if (input.search_term) params.set("search", input.search_term);
    if (input.location) params.set("location", input.location);
    if (input.hours_old) {
      params.set("days", String(Math.max(Math.floor(input.hours_old / 24), 1)));
    }
    if (input.job_type) {
      const map: Record<string, string> = {
        [JobType.FULL_TIME]: "full_time",
        [JobType.PART_TIME]: "part_time",
      };
      params.set("employment_type", map[input.job_type] ?? input.job_type);
    }
    if (input.easy_apply) params.set("zipapply", "1");
    if (input.is_remote) params.set("remote", "1");
    if (input.distance) params.set("radius", String(input.distance));
    return params;
  }

  private async processJob(job: any): Promise<JobPost | null> {
    const title = job.name;
    const jobUrl = `${this.baseUrl}/jobs//j?lvk=${job.listing_key}`;
    if (this.seenUrls.has(jobUrl)) return null;
    this.seenUrls.add(jobUrl);

    let description = (job.job_description ?? "").trim();
    const listingType = job.buyer_type ?? "";
    if (this.scraper_input.description_format === DescriptionFormat.MARKDOWN) {
      description = markdownConverter(description) ?? description;
    }

    const company = job.hiring_company?.name;
    const countryValue = job.job_country === "US" ? "usa" : "canada";
    const countryEnum = getCountry(countryValue);

    const location: Location = {
      city: job.job_city,
      state: job.job_state,
      country: countryEnum.name,
    };

    const empType = (job.employment_type ?? "").replace(/_/g, "").toLowerCase();
    const jobType = getJobTypeFromString(empType);

    const datePosted = job.posted_time
      ? new Date(job.posted_time).toISOString().split("T")[0]
      : undefined;

    let compInterval = job.compensation_interval;
    if (compInterval === "annual") compInterval = "yearly";

    const compensation: Compensation = {
      interval: compInterval,
      min_amount: job.compensation_min != null ? Math.floor(job.compensation_min) : undefined,
      max_amount: job.compensation_max != null ? Math.floor(job.compensation_max) : undefined,
      currency: job.compensation_currency,
    };

    // Fetch full description
    const [descFull, jobUrlDirect] = await this.getDescription(jobUrl);

    return {
      id: `zr-${job.listing_key}`,
      title,
      company_name: company,
      location,
      job_type: jobType ? [jobType] : undefined,
      compensation,
      date_posted: datePosted,
      job_url: jobUrl,
      description: descFull ?? description,
      emails: extractEmails(description),
      job_url_direct: jobUrlDirect,
      listing_type: listingType,
    };
  }

  private async getDescription(
    jobUrl: string,
  ): Promise<[string | undefined, string | undefined]> {
    try {
      const res = await this.session.fetch(jobUrl, { headers: HEADERS });
      if (!res.ok) return [undefined, undefined];

      const html = await res.text();
      const $ = cheerio.load(html);

      const jobDesc = $("div.job_description");
      const companyDesc = $("section.company_description");

      let descFull = "";
      if (jobDesc.length) {
        descFull += removeAttributes(jobDesc.html()!);
      }
      if (companyDesc.length) {
        descFull += removeAttributes(companyDesc.html()!);
      }

      let jobUrlDirect: string | undefined;
      try {
        const scriptTag = $('script[type="application/json"]');
        if (scriptTag.length) {
          const json = JSON.parse(scriptTag.text());
          const saveUrl = json?.model?.saveJobURL ?? "";
          const m = /job_url=(.+)/.exec(saveUrl);
          if (m) jobUrlDirect = m[1];
        }
      } catch {
        // ignore
      }

      if (
        descFull &&
        this.scraper_input.description_format === DescriptionFormat.MARKDOWN
      ) {
        descFull = markdownConverter(descFull) ?? descFull;
      }

      return [descFull || undefined, jobUrlDirect];
    } catch {
      return [undefined, undefined];
    }
  }

  private async getCookies() {
    try {
      await this.session.fetch(`${this.apiUrl}/jobs-app/event`, {
        method: "POST",
        headers: HEADERS,
        body: COOKIE_DATA.toString(),
      });
    } catch {
      // ignore cookie errors
    }
  }
}
