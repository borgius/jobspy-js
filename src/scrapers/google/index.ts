import { Scraper } from "../base";
import { HEADERS_INITIAL, HEADERS_JOBS } from "./constants";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Location,
  Site,
  JobType,
} from "../../types";
import {
  createLogger,
  extractEmails,
  extractJobTypeFromText,
} from "../../utils";

const log = createLogger("Google");

export class Google extends Scraper {
  private searchUrl = "https://www.google.com/search";
  private jobsUrl = "https://www.google.com/async/callback:550";
  private scraper_input!: ScraperInput;
  private seenUrls = new Set<string>();
  private jobsPerPage = 10;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.GOOGLE, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession();
    this.scraper_input = {
      ...input,
      results_wanted: Math.min(900, input.results_wanted ?? 15),
    };
    this.seenUrls.clear();

    const [forwardCursor, initialJobs] = await this.getInitialCursorAndJobs();
    const jobList = [...initialJobs];

    if (!forwardCursor) {
      log.warn(
        "initial cursor not found, try changing your query or there was at most 10 results",
      );
      await this.close();
      return { jobs: jobList };
    }

    let cursor: string | null = forwardCursor;
    let page = 1;
    const offset = this.scraper_input.offset ?? 0;
    const resultsWanted = this.scraper_input.results_wanted!;

    while (this.seenUrls.size < resultsWanted + offset && cursor) {
      log.info(
        `search page: ${page} / ${Math.ceil(resultsWanted / this.jobsPerPage)}`,
      );
      try {
        const [jobs, nextCursor] = await this.getJobsNextPage(cursor);
        if (!jobs.length) {
          log.info(`found no jobs on page: ${page}`);
          break;
        }
        jobList.push(...jobs);
        cursor = nextCursor;
        page++;
      } catch (e: any) {
        log.error(`failed to get jobs on page: ${page}, ${e.message}`);
        break;
      }
    }

    await this.close();
    return {
      jobs: jobList.slice(offset, offset + resultsWanted),
    };
  }

  private async getInitialCursorAndJobs(): Promise<
    [string | null, JobPost[]]
  > {
    let query = `${this.scraper_input.search_term ?? ""} jobs`;

    const jobTypeMap: Record<string, string> = {
      [JobType.FULL_TIME]: "Full time",
      [JobType.PART_TIME]: "Part time",
      [JobType.INTERNSHIP]: "Internship",
      [JobType.CONTRACT]: "Contract",
    };

    if (this.scraper_input.job_type) {
      const mapped = jobTypeMap[this.scraper_input.job_type];
      if (mapped) query += ` ${mapped}`;
    }
    if (this.scraper_input.location) {
      query += ` near ${this.scraper_input.location}`;
    }
    if (this.scraper_input.hours_old) {
      const h = this.scraper_input.hours_old;
      if (h <= 24) query += " since yesterday";
      else if (h <= 72) query += " in the last 3 days";
      else if (h <= 168) query += " in the last week";
      else query += " in the last month";
    }
    if (this.scraper_input.is_remote) query += " remote";
    if (this.scraper_input.google_search_term) {
      query = this.scraper_input.google_search_term;
    }

    const url = `${this.searchUrl}?q=${encodeURIComponent(query)}&udm=8`;
    const res = await this.session.fetch(url, { headers: HEADERS_INITIAL });
    const html = await res.text();

    // Extract cursor
    const fcMatch = /data-async-fc="([^"]+)"/.exec(html);
    const cursor = fcMatch?.[1] ?? null;

    // Extract initial jobs
    const jobs = this.findInitialJobs(html);
    return [cursor, jobs];
  }

  private findInitialJobs(html: string): JobPost[] {
    const pattern = /520084652":(\[.*?\]\s*])\s*}\s*]\s*]\s*]\s*]\s*]/g;
    const results: JobPost[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        const job = this.parseJob(parsed);
        if (job) results.push(job);
      } catch {
        // skip parse errors
      }
    }
    return results;
  }

  private async getJobsNextPage(
    forwardCursor: string,
  ): Promise<[JobPost[], string | null]> {
    const params = new URLSearchParams({
      fc: forwardCursor,
      fcv: "3",
      async: "_fmt:prog",
    });
    const res = await this.session.fetch(
      `${this.jobsUrl}?${params}`,
      { headers: HEADERS_JOBS },
    );
    const text = await res.text();
    return this.parseJobs(text);
  }

  private parseJobs(data: string): [JobPost[], string | null] {
    try {
      const startIdx = data.indexOf("[[[");
      const endIdx = data.lastIndexOf("]]]") + 3;
      if (startIdx === -1 || endIdx < 3) return [[], null];

      const s = data.slice(startIdx, endIdx);
      const parsed = JSON.parse(s)[0];

      const fcMatch = /data-async-fc="([^"]+)"/.exec(data);
      const nextCursor = fcMatch?.[1] ?? null;

      const jobs: JobPost[] = [];
      for (const arr of parsed) {
        const [, jobData] = arr;
        if (typeof jobData !== "string" || !jobData.startsWith("[[["))
          continue;
        try {
          const jobD = JSON.parse(jobData);
          const jobInfo = this.findJobInfo(jobD);
          if (jobInfo) {
            const job = this.parseJob(jobInfo);
            if (job) jobs.push(job);
          }
        } catch {
          // skip
        }
      }
      return [jobs, nextCursor];
    } catch {
      return [[], null];
    }
  }

  private findJobInfo(data: any): any[] | null {
    if (data && typeof data === "object" && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (key === "520084652" && Array.isArray(value)) return value;
        const result = this.findJobInfo(value);
        if (result) return result;
      }
    } else if (Array.isArray(data)) {
      for (const item of data) {
        const result = this.findJobInfo(item);
        if (result) return result;
      }
    }
    return null;
  }

  private parseJob(jobInfo: any[]): JobPost | null {
    try {
      const jobUrl =
        jobInfo[3]?.[0]?.[0] ?? null;
      if (!jobUrl || this.seenUrls.has(jobUrl)) return null;
      this.seenUrls.add(jobUrl);

      const title = jobInfo[0];
      const companyName = jobInfo[1];
      const locationStr = jobInfo[2] ?? "";
      let city = locationStr;
      let state: string | undefined;
      let country: string | undefined;

      if (locationStr.includes(",")) {
        const parts = locationStr.split(",").map((s: string) => s.trim());
        city = parts[0];
        state = parts[1];
        country = parts[2];
      }

      let datePosted: string | undefined;
      const daysAgoStr = jobInfo[12];
      if (typeof daysAgoStr === "string") {
        const m = /\d+/.exec(daysAgoStr);
        if (m) {
          const d = new Date();
          d.setDate(d.getDate() - parseInt(m[0]));
          datePosted = d.toISOString().split("T")[0];
        }
      }

      const description = jobInfo[19] ?? "";
      const descLower = description.toLowerCase();

      const location: Location = { city, state, country };

      return {
        id: `go-${jobInfo[28] ?? Math.random().toString(36).slice(2)}`,
        title,
        company_name: companyName,
        location,
        job_url: jobUrl,
        date_posted: datePosted,
        is_remote:
          descLower.includes("remote") || descLower.includes("wfh"),
        description,
        emails: extractEmails(description),
        job_type: extractJobTypeFromText(description),
      };
    } catch {
      return null;
    }
  }
}
