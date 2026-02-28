import { Scraper } from "../base";
import { JOB_SEARCH_QUERY, API_HEADERS } from "./constants";
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
  getCompensationInterval,
  getCountry,
} from "../../types";
import {
  createLogger,
  markdownConverter,
  extractEmails,
} from "../../utils";

const log = createLogger("Indeed");

const JOB_DETAIL_QUERY = `
  query GetJobData {
    jobSearch(
      what: ""
      limit: 1
      filters: {
        keyword: { field: "key", keys: ["{jobKey}"] }
      }
    ) {
      results {
        job {
          key
          title
          datePublished
          description { html }
          location {
            countryName countryCode admin1Code city postalCode streetAddress
            formatted { short long }
          }
          compensation {
            estimated { currencyCode baseSalary { unitOfWork range { ... on Range { min max } } } }
            baseSalary { unitOfWork range { ... on Range { min max } } }
            currencyCode
          }
          attributes { key label }
          employer {
            relativeCompanyPageUrl name
            dossier {
              employerDetails {
                addresses industry employeesLocalizedLabel revenueLocalizedLabel
                briefDescription ceoName ceoPhotoUrl
              }
              images { headerImageUrl squareLogoUrl }
              links { corporateWebsite }
            }
          }
          recruit { viewJobUrl detailedSalary workSchedule }
        }
      }
    }
  }
`;

export class Indeed extends Scraper {
  private apiUrl = "https://apis.indeed.com/graphql";
  private baseUrl = "";
  private apiCountryCode = "";
  private seenUrls = new Set<string>();
  private scraper_input!: ScraperInput;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.INDEED, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession("safari_ios_16.5");
    this.scraper_input = input;
    const country = input.country;
    if (!country) throw new Error("Country required for Indeed");

    this.baseUrl = `https://${country.indeed_domain}.indeed.com`;
    this.apiCountryCode = country.indeed_api_code;
    this.seenUrls.clear();

    const jobList: JobPost[] = [];
    let page = 1;
    let cursor: string | null = null;
    const offset = input.offset ?? 0;
    const resultsWanted = input.results_wanted ?? 15;

    while (this.seenUrls.size < resultsWanted + offset) {
      log.info(
        `search page: ${page} / ${Math.ceil(resultsWanted / 100)}`,
      );
      const result = await this.scrapePage(cursor);
      if (!result.jobs.length) {
        log.info(`found no jobs on page: ${page}`);
        break;
      }
      jobList.push(...result.jobs);
      cursor = result.cursor;
      page++;
    }

    await this.close();
    return { jobs: jobList.slice(offset, offset + resultsWanted) };
  }

  /**
   * Fetch a single Indeed job by its key (the part after "in-" in the job id).
   */
  async fetchJob(id: string, format: DescriptionFormat): Promise<JobPost | null> {
    const country = getCountry("usa");
    this.baseUrl = `https://${country!.indeed_domain}.indeed.com`;
    this.apiCountryCode = country!.indeed_api_code;
    this.scraper_input = { site_type: [], description_format: format };

    await this.initSession("safari_ios_16.5");

    const query = JOB_DETAIL_QUERY.replace("{jobKey}", id);
    const headers = { ...API_HEADERS, "indeed-co": this.apiCountryCode };

    try {
      const response = await this.session.fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as any;
      const results = data?.data?.jobSearch?.results ?? [];
      if (!results.length) return null;

      const job = results[0].job;

      // Also try to fetch full description from page
      let description = job.description?.html;
      if (format === DescriptionFormat.MARKDOWN) {
        description = markdownConverter(description);
      }

      const directUrl = job.recruit?.viewJobUrl;
      const pageUrl = `${this.baseUrl}/viewjob?jk=${job.key}`;
      try {
        const fullDesc = await this.fetchFullDescription(directUrl || pageUrl);
        if (fullDesc) description = fullDesc;
      } catch { /* ignore */ }

      const jobType = this.getJobType(job.attributes ?? []);
      const ts = job.datePublished / 1000;
      const datePosted = new Date(ts * 1000).toISOString().split("T")[0];
      const employer = job.employer?.dossier;
      const employerDetails = employer?.employerDetails ?? {};
      const relUrl = job.employer?.relativeCompanyPageUrl;
      const compensation = this.getCompensation(job.compensation);
      const location: Location = {
        city: job.location?.city,
        state: job.location?.admin1Code,
        country: job.location?.countryCode,
      };
      const industry = employerDetails.industry
        ? employerDetails.industry.replace(/Iv1/g, "").replace(/_/g, " ").trim()
            .split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
        : undefined;

      return {
        id: `in-${job.key}`,
        title: job.title,
        description,
        company_name: job.employer?.name,
        company_url: relUrl ? `${this.baseUrl}${relUrl}` : undefined,
        company_url_direct: employer?.links?.corporateWebsite,
        location,
        job_type: jobType.length > 0 ? jobType : undefined,
        compensation,
        date_posted: datePosted,
        job_url: pageUrl,
        job_url_direct: directUrl,
        emails: extractEmails(description),
        is_remote: this.isRemote(job, description ?? ""),
        company_addresses: employerDetails.addresses?.[0],
        company_industry: industry,
        company_num_employees: employerDetails.employeesLocalizedLabel,
        company_revenue: employerDetails.revenueLocalizedLabel,
        company_description: employerDetails.briefDescription,
        company_logo: employer?.images?.squareLogoUrl,
      };
    } catch (e: any) {
      log.error(`fetchJob failed: ${e.message}`);
      return null;
    } finally {
      await this.close().catch(() => {});
    }
  }

  private async scrapePage(
    cursor: string | null,
  ): Promise<{ jobs: JobPost[]; cursor: string | null }> {
    const filters = this.buildFilters();
    const searchTerm = this.scraper_input.search_term
      ? this.scraper_input.search_term.replace(/"/g, '\\"')
      : "";

    const query = JOB_SEARCH_QUERY.replace(
      "{what}",
      searchTerm ? `what: "${searchTerm}"` : "",
    )
      .replace(
        "{location}",
        this.scraper_input.location
          ? `location: {where: "${this.scraper_input.location}", radius: ${this.scraper_input.distance ?? 50}, radiusUnit: MILES}`
          : "",
      )
      .replace("{cursor}", cursor ? `cursor: "${cursor}"` : "")
      .replace("{filters}", filters);

    const headers = { ...API_HEADERS, "indeed-co": this.apiCountryCode };

    try {
      const response = await this.session.fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        log.info(`responded with status code: ${response.status}`);
        return { jobs: [], cursor: null };
      }

      const data = await response.json() as any;
      const results = data?.data?.jobSearch?.results ?? [];
      const nextCursor = data?.data?.jobSearch?.pageInfo?.nextCursor ?? null;

      const jobs: JobPost[] = [];
      for (const result of results) {
        const job = await this.processJob(result.job);
        if (job) jobs.push(job);
      }
      return { jobs, cursor: nextCursor };
    } catch (e: any) {
      log.error(`request failed: ${e.message}`);
      return { jobs: [], cursor: null };
    }
  }

  private buildFilters(): string {
    if (this.scraper_input.hours_old) {
      return `
        filters: {
          date: {
            field: "dateOnIndeed",
            start: "${this.scraper_input.hours_old}h"
          }
        }`;
    }
    if (this.scraper_input.easy_apply) {
      return `
        filters: {
          keyword: {
            field: "indeedApplyScope",
            keys: ["DESKTOP"]
          }
        }`;
    }
    if (this.scraper_input.job_type || this.scraper_input.is_remote) {
      const jobTypeMap: Record<string, string> = {
        [JobType.FULL_TIME]: "CF3CP",
        [JobType.PART_TIME]: "75GKK",
        [JobType.CONTRACT]: "NJXCK",
        [JobType.INTERNSHIP]: "VDTG7",
      };
      const keys: string[] = [];
      if (this.scraper_input.job_type) {
        const key = jobTypeMap[this.scraper_input.job_type];
        if (key) keys.push(key);
      }
      if (this.scraper_input.is_remote) keys.push("DSQF7");
      if (keys.length > 0) {
        return `
          filters: {
            composite: {
              filters: [{
                keyword: {
                  field: "attributes",
                  keys: [${keys.map((k) => `"${k}"`).join(", ")}]
                }
              }]
            }
          }`;
      }
    }
    return "";
  }

  private async processJob(job: any): Promise<JobPost | null> {
    const jobUrl = `${this.baseUrl}/viewjob?jk=${job.key}`;
    if (this.seenUrls.has(jobUrl)) return null;
    this.seenUrls.add(jobUrl);

    // base description from API (may be truncated)
    let description = job.description?.html;
    if (
      this.scraper_input.description_format === DescriptionFormat.MARKDOWN
    ) {
      description = markdownConverter(description);
    }

    // optionally fetch full description from job page or direct link
    if (this.scraper_input.indeed_fetch_description) {
      const targetUrl = job.recruit?.viewJobUrl || jobUrl;
      try {
        const fullDesc = await this.fetchFullDescription(targetUrl);
        if (fullDesc) {
          description = fullDesc;
        }
      } catch {
        // ignore failures
      }
    }

    const jobType = this.getJobType(job.attributes ?? []);
    const ts = job.datePublished / 1000;
    const datePosted = new Date(ts * 1000).toISOString().split("T")[0];

    const employer = job.employer?.dossier;
    const employerDetails = employer?.employerDetails ?? {};
    const relUrl = job.employer?.relativeCompanyPageUrl;

    const compensation = this.getCompensation(job.compensation);

    const location: Location = {
      city: job.location?.city,
      state: job.location?.admin1Code,
      country: job.location?.countryCode,
    };

    const industry = employerDetails.industry
      ? employerDetails.industry
          .replace(/Iv1/g, "")
          .replace(/_/g, " ")
          .trim()
          .split(" ")
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ")
      : undefined;

    return {
      id: `in-${job.key}`,
      title: job.title,
      description,
      company_name: job.employer?.name,
      company_url: relUrl ? `${this.baseUrl}${relUrl}` : undefined,
      company_url_direct: employer?.links?.corporateWebsite,
      location,
      job_type: jobType.length > 0 ? jobType : undefined,
      compensation,
      date_posted: datePosted,
      job_url: jobUrl,
      job_url_direct: job.recruit?.viewJobUrl,
      emails: extractEmails(description),
      is_remote: this.isRemote(job, description ?? ""),
      company_addresses: employerDetails.addresses?.[0],
      company_industry: industry,
      company_num_employees: employerDetails.employeesLocalizedLabel,
      company_revenue: employerDetails.revenueLocalizedLabel,
      company_description: employerDetails.briefDescription,
      company_logo: employer?.images?.squareLogoUrl,
    };
  }

  private async fetchFullDescription(url: string): Promise<string | undefined> {
    try {
      const res = await this.session.fetch(url, { timeout: 10000 });
      if (!res.ok) return undefined;
      const html = await res.text();
      // look for main description element using id commonly found on Indeed pages
      const match = html.match(/<div[^>]+id=["']?jobDescriptionText["']?[^>]*>([\s\S]*?)<\/div>/i);
      let desc = match ? match[1] : undefined;
      if (desc && this.scraper_input.description_format === DescriptionFormat.MARKDOWN) {
        desc = markdownConverter(desc);
      }
      return desc;
    } catch {
      return undefined;
    }
  }

  private getJobType(attributes: any[]): JobType[] {
    const types: JobType[] = [];
    for (const attr of attributes) {
      const str = attr.label.replace(/-/g, "").replace(/\s/g, "").toLowerCase();
      const jt = getJobTypeFromString(str);
      if (jt) types.push(jt);
    }
    return types;
  }

  private getCompensation(comp: any): Compensation | undefined {
    if (!comp?.baseSalary && !comp?.estimated) return undefined;
    const data = comp.baseSalary ?? comp.estimated?.baseSalary;
    if (!data) return undefined;
    const interval = getCompensationInterval(data.unitOfWork);
    if (!interval) return undefined;
    return {
      interval,
      min_amount: data.range?.min != null ? Math.floor(data.range.min) : undefined,
      max_amount: data.range?.max != null ? Math.floor(data.range.max) : undefined,
      currency: comp.estimated?.currencyCode ?? comp.currencyCode,
    };
  }

  private isRemote(job: any, description: string): boolean {
    const keywords = ["remote", "work from home", "wfh"];
    const inAttrs = (job.attributes ?? []).some((a: any) =>
      keywords.some((k) => a.label.toLowerCase().includes(k)),
    );
    const inDesc = keywords.some((k) => description.toLowerCase().includes(k));
    const inLoc = keywords.some((k) =>
      (job.location?.formatted?.long ?? "").toLowerCase().includes(k),
    );
    return inAttrs || inDesc || inLoc;
  }
}
