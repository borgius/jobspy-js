import * as cheerio from "cheerio";
import { Scraper } from "../base";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Location,
  Site,
  DescriptionFormat,
} from "../../types";
import {
  createLogger,
  markdownConverter,
  removeAttributes,
  randomSleep,
} from "../../utils";

const log = createLogger("BDJobs");

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Connection: "keep-alive",
  Referer: "https://jobs.bdjobs.com/",
  "Cache-Control": "max-age=0",
};

const JOB_SELECTORS = [
  "div.job-item",
  "div.sout-jobs-wrapper",
  "div.norm-jobs-wrapper",
  "div.featured-wrap",
];

const DATE_FORMATS = [
  /(\d{1,2})\s+(\w{3})\s+(\d{4})/,
  /(\d{1,2})-(\w{3})-(\d{4})/,
  /(\w+)\s+(\d{1,2}),\s+(\d{4})/,
];

export class BDJobs extends Scraper {
  private baseUrl = "https://jobs.bdjobs.com";
  private searchUrl = "https://jobs.bdjobs.com/jobsearch.asp";
  private delay = 2;
  private bandDelay = 3;
  private scraper_input!: ScraperInput;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.BDJOBS, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession();
    this.scraper_input = input;
    const jobList: JobPost[] = [];
    const seenIds = new Set<string>();
    let page = 1;
    const resultsWanted = input.results_wanted ?? 15;

    while (jobList.length < resultsWanted) {
      log.info(`search page: ${page}`);
      try {
        const params = new URLSearchParams({
          hidJobSearch: "jobsearch",
          txtsearch: input.search_term ?? "",
        });
        if (page > 1) params.set("pg", String(page));

        const res = await this.session.fetch(
          `${this.searchUrl}?${params}`,
          { headers: HEADERS, timeout: 60000 } as any,
        );
        if (!res.ok) {
          log.error(`BDJobs response status code ${res.status}`);
          break;
        }

        const html = await res.text();
        const $ = cheerio.load(html);
        const jobCards = this.findJobListings($);

        if (!jobCards.length) {
          log.info("No more job listings found");
          break;
        }

        log.info(`Found ${jobCards.length} job cards on page ${page}`);

        for (const card of jobCards) {
          const job = await this.processJob($, card);
          if (job && !seenIds.has(job.id!)) {
            seenIds.add(job.id!);
            jobList.push(job);
            if (jobList.length >= resultsWanted) break;
          }
        }

        page++;
        await randomSleep(this.delay, this.delay + this.bandDelay);
      } catch (e: any) {
        log.error(`Error during scraping: ${e.message}`);
        break;
      }
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private findJobListings($: cheerio.CheerioAPI): cheerio.Cheerio<any>[] {
    for (const selector of JOB_SELECTORS) {
      const parts = selector.split(".");
      const tag = parts[0];
      const cls = parts[1];
      const elements = $(tag).filter(`.${cls}`);
      if (elements.length > 0) {
        const result: cheerio.Cheerio<any>[] = [];
        elements.each((_, el) => { result.push($(el)); });
        return result;
      }
    }

    // Fallback: look for job detail links
    const links = $('a[href*="jobdetail" i]');
    if (links.length) {
      const result: cheerio.Cheerio<any>[] = [];
      links.each((_, el) => { result.push($(el).parent()); });
      return result;
    }
    return [];
  }

  private async processJob(
    $: cheerio.CheerioAPI,
    card: cheerio.Cheerio<any>,
  ): Promise<JobPost | null> {
    try {
      const jobLink = card.find('a[href*="jobdetail" i]').first();
      if (!jobLink.length) return null;

      let jobUrl = jobLink.attr("href") ?? "";
      if (!jobUrl.startsWith("http")) {
        jobUrl = new URL(jobUrl, this.baseUrl).href;
      }

      const jobId = jobUrl.includes("jobid=")
        ? jobUrl.split("jobid=")[1].split("&")[0]
        : `bdjobs-${Math.abs(hashCode(jobUrl))}`;

      let title = jobLink.text().trim();
      if (!title) {
        const titleEl = card.find("h2, h3, h4, strong, div.job-title-text");
        title = titleEl.text().trim() || "N/A";
      }

      // Company
      let companyName: string | undefined;
      const companyEl = card.find(
        'span[class*="comp-name" i], div[class*="comp-name" i], span[class*="company" i], div[class*="company" i]',
      );
      companyName = companyEl.first().text().trim() || undefined;

      // Location
      const locEl = card.find(
        'span[class*="locon" i], div[class*="locon" i], span[class*="location" i], div[class*="location" i]',
      );
      const locationText = locEl.first().text().trim() || "Dhaka, Bangladesh";
      const location = this.parseLocation(locationText);

      // Date
      const dateEl = card.find(
        'span[class*="date" i], div[class*="date" i], span[class*="deadline" i]',
      );
      const datePosted = dateEl.length
        ? this.parseDate(dateEl.first().text().trim())
        : undefined;

      const isRemote = this.isJobRemote(title, location);

      // Fetch full details
      const details = await this.getJobDetails(jobUrl);

      return {
        id: jobId,
        title,
        company_name: companyName,
        location,
        date_posted: datePosted,
        job_url: jobUrl,
        is_remote: isRemote,
        description: details.description,
      };
    } catch (e: any) {
      log.error(`Error in processJob: ${e.message}`);
      return null;
    }
  }

  private async getJobDetails(
    jobUrl: string,
  ): Promise<{ description?: string }> {
    try {
      const res = await this.session.fetch(jobUrl, {
        headers: HEADERS,
        timeout: 60000,
      } as any);
      if (!res.ok) return {};

      const html = await res.text();
      const $ = cheerio.load(html);

      let description = "";

      // Try jobcontent div first
      const jobContent = $("div.jobcontent");
      if (jobContent.length) {
        const respHeading = jobContent.find(
          'h4#job_resp, h4:contains("responsibilities"), h5:contains("responsibilities")',
        );
        if (respHeading.length) {
          const parts: string[] = [];
          let sibling = respHeading.next();
          while (sibling.length) {
            const tag = sibling.prop("tagName")?.toLowerCase();
            if (tag === "hr" || tag === "h4" || tag === "h5") break;
            if (tag === "ul") {
              sibling.find("li").each((_, li) => {
                parts.push($(li).text().trim());
              });
            } else if (tag === "p") {
              parts.push(sibling.text().trim());
            }
            sibling = sibling.next();
          }
          description = parts.join("\n");
        }
      }

      // Fallback
      if (!description) {
        const descEl = $(
          'div[class*="job-description" i], div[class*="details" i], section[class*="requirements" i]',
        );
        if (descEl.length) {
          let html = removeAttributes(descEl.first().html()!);
          if (
            this.scraper_input.description_format === DescriptionFormat.MARKDOWN
          ) {
            html = markdownConverter(html) ?? html;
          }
          description = html;
        }
      }

      return { description: description || undefined };
    } catch (e: any) {
      log.error(`Error getting job details: ${e.message}`);
      return {};
    }
  }

  private parseLocation(text: string): Location {
    const parts = text.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      return { city: parts[0], state: parts[1], country: "bangladesh" };
    }
    return { city: text.trim(), country: "bangladesh" };
  }

  private parseDate(text: string): string | undefined {
    const cleaned = text.replace(/Deadline:\s*/i, "").trim();
    try {
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    } catch {
      // ignore
    }
    return undefined;
  }

  private isJobRemote(title: string, location: Location): boolean {
    const keywords = ["remote", "work from home", "wfh", "home based"];
    const full =
      `${title} ${location.city ?? ""} ${location.state ?? ""}`.toLowerCase();
    return keywords.some((k) => full.includes(k));
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
