import * as cheerio from "cheerio";
import { Scraper } from "../base";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Location,
  Site,
} from "../../types";
import { createLogger, randomSleep } from "../../utils";

const log = createLogger("Bayt");

export class Bayt extends Scraper {
  private baseUrl = "https://www.bayt.com";
  private delay = 2;
  private bandDelay = 3;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.BAYT, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession();
    const jobList: JobPost[] = [];
    let page = 1;
    const resultsWanted = input.results_wanted ?? 10;

    while (jobList.length < resultsWanted) {
      log.info(`Fetching Bayt jobs page ${page}`);
      const elements = await this.fetchJobs(input.search_term ?? "", page);
      if (!elements.length) break;

      const initialCount = jobList.length;
      for (const el of elements) {
        const job = this.extractJobInfo(el);
        if (job) {
          jobList.push(job);
          if (jobList.length >= resultsWanted) break;
        }
      }

      if (jobList.length === initialCount) {
        log.info(`No new jobs found on page ${page}. Ending pagination.`);
        break;
      }

      page++;
      await randomSleep(this.delay, this.delay + this.bandDelay);
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async fetchJobs(
    query: string,
    page: number,
  ): Promise<cheerio.Cheerio<any>[]> {
    try {
      const url = `${this.baseUrl}/en/international/jobs/${encodeURIComponent(query)}-jobs/?page=${page}`;
      const res = await this.session.fetch(url);
      if (!res.ok) return [];
      const html = await res.text();
      const $ = cheerio.load(html);
      const listings: cheerio.Cheerio<any>[] = [];
      $('li[data-js-job]').each((_, el) => { listings.push($(el)); });
      return listings;
    } catch (e: any) {
      log.error(`Bayt: Error fetching jobs - ${e.message}`);
      return [];
    }
  }

  private extractJobInfo(el: cheerio.Cheerio<any>): JobPost | null {
    const h2 = el.find("h2");
    if (!h2.length) return null;

    const title = h2.text().trim();
    const aTag = h2.find("a");
    if (!aTag.length || !aTag.attr("href")) return null;
    const jobUrl = this.baseUrl + aTag.attr("href")!.trim();

    const companyTag = el.find("div.t-nowrap.p10l");
    const companyName = companyTag.find("span").first().text().trim() || undefined;

    const locationTag = el.find("div.t-mute.t-small");
    const locationText = locationTag.text().trim() || undefined;

    const location: Location = {
      city: locationText,
      country: "worldwide",
    };

    return {
      id: `bayt-${Math.abs(hashCode(jobUrl))}`,
      title,
      company_name: companyName,
      location,
      job_url: jobUrl,
    };
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
