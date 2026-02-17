import { Scraper } from "../base";
import { HEADERS } from "./constants";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Compensation,
  type Location,
  Site,
  DescriptionFormat,
} from "../../types";
import {
  createLogger,
  markdownConverter,
  extractEmails,
  randomSleep,
} from "../../utils";

const log = createLogger("Naukri");

export class Naukri extends Scraper {
  private baseUrl = "https://www.naukri.com/jobapi/v3/search";
  private delay = 3;
  private bandDelay = 4;
  private jobsPerPage = 20;
  private scraper_input!: ScraperInput;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.NAUKRI, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession();
    this.scraper_input = input;
    const jobList: JobPost[] = [];
    const seenIds = new Set<string>();
    const resultsWanted = input.results_wanted ?? 15;
    let page = Math.floor((input.offset ?? 0) / this.jobsPerPage) + 1;

    const continueSearch = () => jobList.length < resultsWanted && page <= 50;

    while (continueSearch()) {
      log.info(`Scraping page ${page} for: ${input.search_term}`);
      const params = new URLSearchParams({
        noOfResults: String(this.jobsPerPage),
        urlType: "search_by_keyword",
        searchType: "adv",
        keyword: input.search_term ?? "",
        pageNo: String(page),
        k: input.search_term ?? "",
        seoKey: `${(input.search_term ?? "").toLowerCase().replace(/\s+/g, "-")}-jobs`,
        src: "jobsearchDesk",
        latLong: "",
      });
      if (input.location) params.set("location", input.location);
      if (input.is_remote) params.set("remote", "true");
      if (input.hours_old) {
        params.set("days", String(Math.floor(input.hours_old / 24)));
      }

      try {
        const res = await this.session.fetch(`${this.baseUrl}?${params}`, {
          headers: HEADERS,
          timeout: 10000,
        } as any);
        if (!res.ok) {
          log.error(`Naukri API response status code ${res.status}`);
          break;
        }
        const data = (await res.json()) as any;
        const jobDetails = data.jobDetails ?? [];
        if (!jobDetails.length) break;

        for (const job of jobDetails) {
          const jobId = job.jobId;
          if (!jobId || seenIds.has(jobId)) continue;
          seenIds.add(jobId);

          const post = this.processJob(job, jobId);
          if (post) jobList.push(post);
          if (!continueSearch()) break;
        }

        if (continueSearch()) {
          await randomSleep(this.delay, this.delay + this.bandDelay);
          page++;
        }
      } catch (e: any) {
        log.error(`Naukri API request failed: ${e.message}`);
        break;
      }
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private processJob(job: any, jobId: string): JobPost | null {
    const title = job.title ?? "N/A";
    const company = job.companyName ?? "N/A";
    const companyUrl = job.staticUrl
      ? `https://www.naukri.com/${job.staticUrl}`
      : undefined;

    const location = this.getLocation(job.placeholders ?? []);
    const compensation = this.getCompensation(job.placeholders ?? []);
    const datePosted = this.parseDate(
      job.footerPlaceholderLabel,
      job.createdDate,
    );

    const jobUrl = `https://www.naukri.com${job.jdURL ?? `/job/${jobId}`}`;
    let description = job.jobDescription ?? undefined;
    if (description && this.scraper_input.description_format === DescriptionFormat.MARKDOWN) {
      description = markdownConverter(description);
    }

    const isRemote = this.isJobRemote(title, description ?? "", location);
    const companyLogo = job.logoPathV3 ?? job.logoPath;

    // Naukri-specific
    const skills = job.tagsAndSkills
      ? job.tagsAndSkills.split(",").map((s: string) => s.trim())
      : undefined;
    const ambitionBox = job.ambitionBoxData ?? {};

    return {
      id: `nk-${jobId}`,
      title,
      company_name: company,
      company_url: companyUrl,
      location,
      is_remote: isRemote,
      date_posted: datePosted,
      job_url: jobUrl,
      compensation,
      description,
      emails: extractEmails(description ?? ""),
      company_logo: companyLogo,
      skills,
      experience_range: job.experienceText,
      company_rating: ambitionBox.AggregateRating
        ? parseFloat(ambitionBox.AggregateRating)
        : undefined,
      company_reviews_count: ambitionBox.ReviewsCount,
      vacancy_count: job.vacancy,
      work_from_home_type: this.inferWfhType(
        job.placeholders ?? [],
        title,
        description ?? "",
      ),
    };
  }

  private getLocation(placeholders: any[]): Location {
    for (const p of placeholders) {
      if (p.type === "location") {
        const parts = (p.label ?? "").split(", ");
        return {
          city: parts[0],
          state: parts[1],
          country: "india",
        };
      }
    }
    return { country: "india" };
  }

  private getCompensation(placeholders: any[]): Compensation | undefined {
    for (const p of placeholders) {
      if (p.type === "salary") {
        const text = (p.label ?? "").trim();
        if (text === "Not disclosed") return undefined;

        const m = text.match(
          /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(Lacs|Lakh|Cr)/i,
        );
        if (!m) return undefined;

        let min = parseFloat(m[1]);
        let max = parseFloat(m[2]);
        const unit = m[3].toLowerCase();

        if (unit === "lacs" || unit === "lakh") {
          min *= 100000;
          max *= 100000;
        } else if (unit === "cr") {
          min *= 10000000;
          max *= 10000000;
        }

        return {
          min_amount: Math.floor(min),
          max_amount: Math.floor(max),
          currency: "INR",
        };
      }
    }
    return undefined;
  }

  private parseDate(
    label: string | undefined,
    createdDate: number | undefined,
  ): string | undefined {
    const now = new Date();
    if (!label) {
      if (createdDate) {
        return new Date(createdDate).toISOString().split("T")[0];
      }
      return undefined;
    }
    const lower = label.toLowerCase();
    if (
      lower.includes("today") ||
      lower.includes("just now") ||
      lower.includes("few hours")
    ) {
      return now.toISOString().split("T")[0];
    }
    if (lower.includes("ago")) {
      const m = /(\d+)\s*day/.exec(lower);
      if (m) {
        const d = new Date(now);
        d.setDate(d.getDate() - parseInt(m[1]));
        return d.toISOString().split("T")[0];
      }
    }
    if (createdDate) {
      return new Date(createdDate).toISOString().split("T")[0];
    }
    return undefined;
  }

  private isJobRemote(
    title: string,
    description: string,
    location: Location,
  ): boolean {
    const keywords = ["remote", "work from home", "wfh"];
    const locStr = [location.city, location.state, location.country]
      .filter(Boolean)
      .join(" ");
    const full = `${title} ${description} ${locStr}`.toLowerCase();
    return keywords.some((k) => full.includes(k));
  }

  private inferWfhType(
    placeholders: any[],
    title: string,
    description: string,
  ): string | undefined {
    const locStr = (
      placeholders.find((p: any) => p.type === "location")?.label ?? ""
    ).toLowerCase();
    const combined = `${title} ${description} ${locStr}`.toLowerCase();

    if (combined.includes("hybrid")) return "Hybrid";
    if (combined.includes("remote")) return "Remote";
    if (
      combined.includes("work from office") ||
      (!combined.includes("remote") && !combined.includes("hybrid"))
    ) {
      return "Work from office";
    }
    return undefined;
  }
}
