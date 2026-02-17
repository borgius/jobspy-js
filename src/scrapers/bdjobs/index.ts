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
  sleep,
} from "../../utils";

const log = createLogger("BDJobs");

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://bdjobs.com/h/jobs/",
  Origin: "https://bdjobs.com",
};

export class BDJobs extends Scraper {
  private searchUrl = "https://api.bdjobs.com/Jobs/api/JobSearch/GetJobSearch";
  private jobDetailsBaseUrl = "https://bdjobs.com/h/details/";
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
      const jobs = await this.fetchPage(input, page);
      if (!jobs.length) break;

      for (const job of jobs) {
        if (!seenIds.has(job.id!)) {
          seenIds.add(job.id!);
          jobList.push(job);
          if (jobList.length >= resultsWanted) break;
        }
      }
      page++;
      if (page > 1) await sleep(1000);
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async fetchPage(input: ScraperInput, page: number): Promise<JobPost[]> {
    const params = new URLSearchParams();
    if (input.search_term) params.set("txtsearch", input.search_term);
    if (page > 1) params.set("pg", String(page));

    try {
      const res = await this.session.fetch(`${this.searchUrl}?${params}`, {
        headers: HEADERS,
      });
      if (!res.ok) {
        log.error(`BDJobs response status ${res.status}`);
        return [];
      }

      const data = await res.json() as any;
      if (data.statuscode !== "1" && data.message !== "Success") {
        log.error(`BDJobs API error: ${data.message}`);
        return [];
      }

      // Combine premiumData and data (regular listings) if present
      const items: any[] = [
        ...(data.premiumData ?? []),
        ...(data.data ?? []),
      ];
      if (!items.length) return [];

      return items.map(item => this.processItem(item)).filter(Boolean) as JobPost[];
    } catch (e: any) {
      log.error(`BDJobs page ${page}: ${e.message}`);
      return [];
    }
  }

  private processItem(item: any): JobPost | null {
    const jobId = item.Jobid ?? item.jobId;
    if (!jobId) return null;

    const title: string = item.jobTitle ?? item.JobTitle ?? "";
    const jobUrl = `${this.jobDetailsBaseUrl}${jobId}`;

    const location = this.parseLocation(item.location ?? "Dhaka, Bangladesh");
    const datePosted = item.publishDate
      ? new Date(item.publishDate).toISOString().split("T")[0]
      : undefined;

    let description: string = item.jobContext ?? "";
    if (description && this.scraper_input.description_format === DescriptionFormat.MARKDOWN) {
      description = markdownConverter(description) ?? description;
    }

    return {
      id: `bdjobs-${jobId}`,
      title,
      company_name: item.companyName ?? item.CompanyName ?? undefined,
      location,
      date_posted: datePosted,
      job_url: jobUrl,
      description: description || undefined,
    };
  }

  private parseLocation(text: string): Location {
    const parts = text.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      return { city: parts[0], state: parts[1], country: "Bangladesh" };
    }
    return { city: text.trim(), country: "Bangladesh" };
  }
}
