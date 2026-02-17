import * as cheerio from "cheerio";
import { Scraper } from "../base";
import { HEADERS } from "./constants";
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
} from "../../types";
import {
  createLogger,
  markdownConverter,
  plainConverter,
  extractEmails,
  removeAttributes,
  parseCurrency,
  randomSleep,
} from "../../utils";

const log = createLogger("LinkedIn");

const JOB_TYPE_CODE: Record<string, string> = {
  [JobType.FULL_TIME]: "F",
  [JobType.PART_TIME]: "P",
  [JobType.INTERNSHIP]: "I",
  [JobType.CONTRACT]: "C",
  [JobType.TEMPORARY]: "T",
};

export class LinkedIn extends Scraper {
  private baseUrl = "https://www.linkedin.com";
  private delay = 3;
  private bandDelay = 4;
  private scraper_input!: ScraperInput;
  private urlRegex = /(?<=\?url=)[^"]+/;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.LINKEDIN, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession();
    this.scraper_input = input;
    const jobList: JobPost[] = [];
    const seenIds = new Set<string>();
    let start = input.offset ? Math.floor(input.offset / 10) * 10 : 0;
    let requestCount = 0;
    const secondsOld = input.hours_old ? input.hours_old * 3600 : null;
    const resultsWanted = input.results_wanted ?? 15;

    const continueSearch = () =>
      jobList.length < resultsWanted && start < 1000;

    while (continueSearch()) {
      requestCount++;
      log.info(
        `search page: ${requestCount} / ${Math.ceil(resultsWanted / 10)}`,
      );

      const params = new URLSearchParams();
      if (input.search_term) params.set("keywords", input.search_term);
      if (input.location) params.set("location", input.location);
      if (input.distance) params.set("distance", String(input.distance));
      if (input.is_remote) params.set("f_WT", "2");
      if (input.job_type) {
        const code = JOB_TYPE_CODE[input.job_type];
        if (code) params.set("f_JT", code);
      }
      params.set("pageNum", "0");
      params.set("start", String(start));
      if (input.easy_apply) params.set("f_AL", "true");
      if (input.linkedin_company_ids?.length) {
        params.set("f_C", input.linkedin_company_ids.join(","));
      }
      if (secondsOld !== null) params.set("f_TPR", `r${secondsOld}`);

      try {
        const url = `${this.baseUrl}/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;
        const response = await this.session.fetch(url, {
          headers: HEADERS,
          timeout: 10000,
        } as any);

        if (!response.ok) {
          if (response.status === 429) {
            log.error("429 Response - Blocked by LinkedIn for too many requests");
          } else {
            log.error(`LinkedIn response status code ${response.status}`);
          }
          break;
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const jobCards = $("div.base-search-card");

        if (jobCards.length === 0) break;

        for (let i = 0; i < jobCards.length; i++) {
          const card = $(jobCards[i]);
          const hrefTag = card.find("a.base-card__full-link");
          const href = hrefTag.attr("href");
          if (!href) continue;

          const jobId = href.split("?")[0].split("-").pop()!;
          if (seenIds.has(jobId)) continue;
          seenIds.add(jobId);

          const job = await this.processJob($, card, jobId, !!input.linkedin_fetch_description);
          if (job) jobList.push(job);
          if (!continueSearch()) break;
        }

        if (continueSearch()) {
          await randomSleep(this.delay, this.delay + this.bandDelay);
          start += jobCards.length;
        }
      } catch (e: any) {
        log.error(`LinkedIn: ${e.message}`);
        break;
      }
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async processJob(
    $: cheerio.CheerioAPI,
    card: cheerio.Cheerio<any>,
    jobId: string,
    fetchDesc: boolean,
  ): Promise<JobPost | null> {
    // Salary
    let compensation: Compensation | undefined;
    const salaryTag = card.find("span.job-search-card__salary-info");
    if (salaryTag.length) {
      const salaryText = salaryTag.text().trim();
      const values = salaryText.split("-").map(parseCurrency);
      if (values.length >= 2) {
        compensation = {
          min_amount: Math.floor(values[0]),
          max_amount: Math.floor(values[1]),
          currency: salaryText[0] !== "$" ? salaryText[0] : "USD",
        };
      }
    }

    // Title
    const titleTag = card.find("span.sr-only");
    const title = titleTag.text().trim() || "N/A";

    // Company
    const companyTag = card.find("h4.base-search-card__subtitle");
    const companyA = companyTag.find("a");
    const companyUrl = companyA.attr("href")
      ? new URL(companyA.attr("href")!).origin + new URL(companyA.attr("href")!).pathname
      : "";
    const company = companyA.text().trim() || "N/A";

    // Location
    const metadata = card.find("div.base-search-card__metadata");
    const location = this.getLocation(metadata);

    // Date
    const dateTag = metadata.find("time.job-search-card__listdate");
    const datePosted = dateTag.attr("datetime") ?? undefined;

    // Description (optional)
    let jobDetails: Record<string, any> = {};
    let description: string | undefined;
    if (fetchDesc) {
      jobDetails = await this.getJobDetails(jobId);
      description = jobDetails.description;
    }

    const isRemote = this.isJobRemote(title, description, location);

    return {
      id: `li-${jobId}`,
      title,
      company_name: company,
      company_url: companyUrl || undefined,
      location,
      is_remote: isRemote,
      date_posted: datePosted,
      job_url: `${this.baseUrl}/jobs/view/${jobId}`,
      compensation,
      job_type: jobDetails.job_type,
      job_level: jobDetails.job_level?.toLowerCase(),
      company_industry: jobDetails.company_industry,
      description: jobDetails.description,
      job_url_direct: jobDetails.job_url_direct,
      emails: extractEmails(description),
      company_logo: jobDetails.company_logo,
      job_function: jobDetails.job_function,
    };
  }

  private async getJobDetails(jobId: string): Promise<Record<string, any>> {
    try {
      const response = await this.session.fetch(
        `${this.baseUrl}/jobs/view/${jobId}`,
        { headers: HEADERS, timeout: 5000 } as any,
      );
      if (!response.ok) return {};
      const html = await response.text();
      if (html.includes("linkedin.com/signup")) return {};

      const $ = cheerio.load(html);

      // Description
      let description: string | undefined;
      const divContent = $("div[class*='show-more-less-html__markup']");
      if (divContent.length) {
        const cleaned = removeAttributes(divContent.html()!);
        if (this.scraper_input.description_format === DescriptionFormat.MARKDOWN) {
          description = markdownConverter(cleaned);
        } else if (this.scraper_input.description_format === DescriptionFormat.PLAIN) {
          description = plainConverter(cleaned);
        } else {
          description = cleaned;
        }
      }

      // Job function
      let jobFunction: string | undefined;
      $("h3").each((_, el) => {
        if ($(el).text().includes("Job function")) {
          const span = $(el).next("span.description__job-criteria-text");
          if (span.length) jobFunction = span.text().trim();
        }
      });

      // Logo
      const logoImg = $("img.artdeco-entity-image");
      const companyLogo = logoImg.attr("data-delayed-url") ?? undefined;

      return {
        description,
        job_level: this.parseCriteria($, "Seniority level"),
        company_industry: this.parseCriteria($, "Industries"),
        job_type: this.parseJobType($),
        job_url_direct: this.parseJobUrlDirect($),
        company_logo: companyLogo,
        job_function: jobFunction,
      };
    } catch {
      return {};
    }
  }

  private parseCriteria($: cheerio.CheerioAPI, label: string): string | undefined {
    let result: string | undefined;
    $("h3.description__job-criteria-subheader").each((_, el) => {
      if ($(el).text().includes(label)) {
        const span = $(el).next(
          "span.description__job-criteria-text",
        );
        if (span.length) result = span.text().trim();
      }
    });
    return result;
  }

  private parseJobType($: cheerio.CheerioAPI): JobType[] | undefined {
    const typeStr = this.parseCriteria($, "Employment type");
    if (!typeStr) return undefined;
    const normalized = typeStr.toLowerCase().replace(/-/g, "");
    const jt = getJobTypeFromString(normalized);
    return jt ? [jt] : undefined;
  }

  private parseJobUrlDirect($: cheerio.CheerioAPI): string | undefined {
    const code = $("code#applyUrl");
    if (!code.length) return undefined;
    const match = this.urlRegex.exec(code.text().trim());
    return match ? decodeURIComponent(match[0]) : undefined;
  }

  private getLocation(metadata: cheerio.Cheerio<any>): Location {
    const locTag = metadata.find("span.job-search-card__location");
    const locStr = locTag.text().trim() || "N/A";
    const parts = locStr.split(", ");
    if (parts.length === 2) {
      return { city: parts[0], state: parts[1], country: "worldwide" };
    }
    if (parts.length >= 3) {
      return { city: parts[0], state: parts[1], country: parts[2] };
    }
    return { country: "worldwide" };
  }

  private isJobRemote(
    title: string,
    description: string | undefined,
    location: Location,
  ): boolean {
    const keywords = ["remote", "work from home", "wfh"];
    const locStr = [location.city, location.state, location.country]
      .filter(Boolean)
      .join(" ");
    const full = `${title} ${description ?? ""} ${locStr}`.toLowerCase();
    return keywords.some((k) => full.includes(k));
  }
}
