import { Scraper } from "../base";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Location,
  Site,
} from "../../types";
import {
  createLogger,
  extractEmails,
  extractJobTypeFromText,
  markdownConverter,
  plainConverter,
} from "../../utils";
import { DescriptionFormat } from "../../types";

const log = createLogger("GoogleCareers");

const HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const BASE_URL =
  "https://www.google.com/about/careers/applications/jobs/results";

/** Extract and JSON-parse an AF_initDataCallback block from the page HTML. */
function extractAfCallback(html: string, key: string): unknown | null {
  const marker = `AF_initDataCallback({key: '${key}'`;
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const dataStart = html.indexOf("data:", start) + 5;
  let depth = 0;
  let i = dataStart;

  while (i < html.length) {
    const ch = html[i];
    if (ch === "[" || ch === "{") {
      depth++;
    } else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    } else if (ch === '"') {
      i++;
      while (i < html.length) {
        if (html[i] === '"' && html[i - 1] !== "\\") break;
        i++;
      }
    }
    i++;
  }

  try {
    return JSON.parse(html.slice(dataStart, i));
  } catch {
    return null;
  }
}

/** Slugify a job title to build the canonical job URL. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convert a HTML string to the requested format. */
function convertDescription(
  html: string | null | undefined,
  format: DescriptionFormat,
): string | undefined {
  if (!html) return undefined;
  return format === DescriptionFormat.MARKDOWN
    ? markdownConverter(html)
    : plainConverter(html);
}

export class GoogleCareers extends Scraper {
  private baseUrl = BASE_URL;
  private scraper_input!: ScraperInput;
  private jobsPerPage = 20;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.GOOGLE_CAREERS, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession();
    this.scraper_input = {
      ...input,
      results_wanted: Math.min(1000, input.results_wanted ?? 15),
    };

    const offset = this.scraper_input.offset ?? 0;
    const resultsWanted = this.scraper_input.results_wanted!;
    const jobList: JobPost[] = [];
    const seenIds = new Set<string>();

    let page = 1;
    let total: number | null = null;

    while (jobList.length < resultsWanted + offset) {
      log.info(`fetching page ${page}`);
      const url = this.buildUrl(page);
      const res = await this.session.fetch(url, { headers: HEADERS });
      const html = await res.text();

      const data = extractAfCallback(html, "ds:1") as any[] | null;
      if (!data) {
        log.warn("failed to extract AF_initDataCallback ds:1");
        break;
      }

      const rawJobs: unknown[] = Array.isArray(data[0]) ? data[0] : [];
      if (total === null) {
        total = typeof data[2] === "number" ? data[2] : rawJobs.length;
      }

      if (!rawJobs.length) break;

      for (const raw of rawJobs) {
        if (jobList.length >= resultsWanted + offset) break;
        const job = this.parseJob(raw);
        if (job && !seenIds.has(job.id ?? "")) {
          seenIds.add(job.id ?? "");
          jobList.push(job);
        }
      }

      const fetched = page * this.jobsPerPage;
      if (fetched >= (total ?? 0)) break;
      page++;
    }

    await this.close();
    return { jobs: jobList.slice(offset, offset + resultsWanted) };
  }

  private buildUrl(page: number): string {
    const params = new URLSearchParams();
    if (this.scraper_input.search_term) {
      params.set("q", this.scraper_input.search_term);
    }
    if (this.scraper_input.location) {
      params.set("location", this.scraper_input.location);
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    const qs = params.toString();
    return qs ? `${this.baseUrl}?${qs}` : this.baseUrl;
  }

  private parseJob(raw: unknown): JobPost | null {
    if (!Array.isArray(raw)) return null;
    const job = raw as any[];

    try {
      const id: string = String(job[0] ?? "");
      if (!id) return null;

      const title: string = job[1] ?? "";
      const company: string = job[7] ?? "Google";

      // Location: job[9] = [[city_full, addrs, city, zip, state, country_code], ...]
      const locationArr = Array.isArray(job[9]) ? job[9] : [];
      const primaryLoc = Array.isArray(locationArr[0]) ? locationArr[0] : [];
      const location: Location = {
        city: primaryLoc[2] ?? primaryLoc[0] ?? undefined,
        state: primaryLoc[4] ?? undefined,
        country: primaryLoc[5] ?? undefined,
      };

      // Date posted: job[12] = [unix_seconds, nanoseconds]
      let datePosted: string | undefined;
      if (Array.isArray(job[12]) && typeof job[12][0] === "number") {
        datePosted = new Date(job[12][0] * 1000).toISOString().split("T")[0];
      }

      // Description: combine about (job[10][1]), responsibilities (job[3][1]),
      //              min qualifications (job[4][1]), preferred qualifications (job[19][1])
      const aboutHtml: string = Array.isArray(job[10]) ? (job[10][1] ?? "") : "";
      const respHtml: string = Array.isArray(job[3]) ? (job[3][1] ?? "") : "";
      const qualHtml: string = Array.isArray(job[4]) ? (job[4][1] ?? "") : "";
      const prefQualHtml: string = Array.isArray(job[19]) ? (job[19][1] ?? "") : "";
      const combinedHtml = [aboutHtml, respHtml, qualHtml, prefQualHtml]
        .filter(Boolean)
        .join("\n");

      const fmt = this.scraper_input.description_format ?? DescriptionFormat.MARKDOWN;
      const description = convertDescription(combinedHtml, fmt);

      // Job URL: /jobs/results/{id}-{slug}
      const slug = slugify(title);
      const jobUrl = `${this.baseUrl}/${id}-${slug}`;

      // Multiple locations: store as comma-separated in city
      if (locationArr.length > 1) {
        location.city = locationArr
          .map((l: any) => (Array.isArray(l) ? l[0] : ""))
          .filter(Boolean)
          .join("; ");
      }

      const isRemote =
        (description?.toLowerCase().includes("remote") ?? false) ||
        locationArr.some((l: any) =>
          (Array.isArray(l) ? l[0] : "").toLowerCase().includes("remote"),
        );

      return {
        id: `gc-${id}`,
        title,
        company_name: company,
        location,
        job_url: jobUrl,
        date_posted: datePosted,
        is_remote: isRemote,
        description,
        emails: extractEmails(description),
        job_type: extractJobTypeFromText(description),
      };
    } catch {
      return null;
    }
  }
}
