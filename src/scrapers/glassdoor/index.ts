import { Scraper } from "../base";
import { HEADERS, QUERY_TEMPLATE, FALLBACK_TOKEN } from "./constants";
import {
  type JobPost,
  type JobResponse,
  type ScraperInput,
  type Compensation,
  type Location,
  Site,
  CompensationInterval,
  DescriptionFormat,
  getCompensationInterval,
} from "../../types";
import {
  createLogger,
  markdownConverter,
  extractEmails,
} from "../../utils";

const log = createLogger("Glassdoor");

export class Glassdoor extends Scraper {
  private baseUrl = "";
  private scraper_input!: ScraperInput;
  private seenUrls = new Set<string>();
  private jobsPerPage = 30;
  private maxPages = 30;

  constructor(options: { proxies?: string | string[] | null } = {}) {
    super(Site.GLASSDOOR, options);
  }

  async scrape(input: ScraperInput): Promise<JobResponse> {
    await this.initSession("chrome_138");
    this.scraper_input = { ...input, results_wanted: Math.min(900, input.results_wanted ?? 15) };
    const country = input.country;
    if (!country?.glassdoor_domain) {
      throw new Error("Glassdoor not available for this country");
    }
    this.baseUrl = `https://${country.glassdoor_domain}/`;
    this.seenUrls.clear();

    // Do location lookup first — it sets/updates the bs session cookie.
    // CSRF token must be fetched AFTER so the session cookie state is settled.
    const [locationId, locationType] = await this.getLocation(
      input.location,
      !!input.is_remote,
      HEADERS,
    );
    if (!locationType) {
      log.error("location not parsed");
      await this.close();
      return { jobs: [] };
    }

    const token = await this.getCsrfToken();
    const headers = {
      ...HEADERS,
      "gd-csrf-token": token ?? FALLBACK_TOKEN,
    };

    const jobList: JobPost[] = [];
    let cursor: string | null = null;
    const resultsWanted = this.scraper_input.results_wanted!;
    const rangeStart = 1 + Math.floor((input.offset ?? 0) / this.jobsPerPage);
    const rangeEnd = Math.min(
      Math.floor(resultsWanted / this.jobsPerPage) + 2,
      this.maxPages + 1,
    );

    for (let page = rangeStart; page < rangeEnd; page++) {
      log.info(`search page: ${page} / ${rangeEnd - 1}`);
      try {
        const [jobs, nextCursor] = await this.fetchJobsPage(
          locationId,
          locationType,
          page,
          cursor,
          headers,
        );
        jobList.push(...jobs);
        cursor = nextCursor;
        if (!jobs.length || jobList.length >= resultsWanted) break;
      } catch (e: any) {
        log.error(`Glassdoor: ${e.message}`);
        break;
      }
    }

    await this.close();
    return { jobs: jobList.slice(0, resultsWanted) };
  }

  private async getCsrfToken(): Promise<string | null> {
    // Glassdoor embeds the CSRF token as `"token": "..."` in the HTML of any page.
    // The token has the format xxx:yyy:zzz and must be sent as gd-csrf-token on API calls.
    // We must use browser-style navigation headers (Accept: text/html) so the server
    // returns a full HTML document containing the embedded JSON with the token.
    const browserHeaders = {
      "user-agent": HEADERS["user-agent"],
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": HEADERS["sec-ch-ua"],
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
    };
    try {
      const res = await this.session.fetch(this.baseUrl, { headers: browserHeaders });
      const text = await res.text();
      const htmlMatch = /"token":\s*"([^"]{20,})"/.exec(text);
      if (htmlMatch?.[1]) return htmlMatch[1];
      return null;
    } catch {
      return null;
    }
  }

  private async fetchJobsPage(
    locationId: string,
    locationType: string,
    pageNum: number,
    cursor: string | null,
    headers: Record<string, string>,
  ): Promise<[JobPost[], string | null]> {
    const filterParams: any[] = [];
    if (this.scraper_input.easy_apply) {
      filterParams.push({ filterKey: "applicationType", values: "1" });
    }
    if (this.scraper_input.hours_old) {
      const fromage = Math.max(Math.floor(this.scraper_input.hours_old / 24), 1);
      filterParams.push({ filterKey: "fromAge", values: String(fromage) });
    }
    if (this.scraper_input.job_type) {
      filterParams.push({
        filterKey: "jobType",
        values: this.scraper_input.job_type,
      });
    }

    const payload = [
      {
        operationName: "JobSearchResultsQuery",
        variables: {
          excludeJobListingIds: [],
          filterParams,
          keyword: this.scraper_input.search_term,
          numJobsToShow: 30,
          locationType,
          locationId: parseInt(locationId),
          parameterUrlInput: `IL.0,12_I${locationType}${locationId}`,
          pageNumber: pageNum,
          pageCursor: cursor,
          sort: "date",
        },
        query: QUERY_TEMPLATE,
      },
    ];

    const res = await this.session.fetch(`${this.baseUrl}graph`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      log.error(`bad response status code: ${res.status}`);
      return [[], null];
    }

    const json = (await res.json()) as any[];
    const data = json[0];
    if (data.errors) {
      log.error("Error in API response");
      return [[], null];
    }

    const listings = data.data?.jobListings?.jobListings ?? [];
    const jobs = await Promise.all(
      listings.map((l: any) => this.processJob(l, headers)),
    );

    const paginationCursors =
      data.data?.jobListings?.paginationCursors ?? [];
    const nextCursor =
      paginationCursors.find(
        (c: any) => c.pageNumber === pageNum + 1,
      )?.cursor ?? null;

    return [jobs.filter(Boolean) as JobPost[], nextCursor];
  }

  private async processJob(
    jobData: any,
    headers: Record<string, string>,
  ): Promise<JobPost | null> {
    const job = jobData.jobview;
    const jobId = job.job.listingId;
    const jobUrl = `${this.baseUrl}job-listing/j?jl=${jobId}`;
    if (this.seenUrls.has(jobUrl)) return null;
    this.seenUrls.add(jobUrl);

    const header = job.header;
    const title = job.job.jobTitleText;
    const companyName = header.employerNameFromSearch;
    const companyId = header.employer?.id;
    const locationName = header.locationName ?? "";
    const locType = header.locationType ?? "";
    const ageInDays = header.ageInDays;

    let isRemote = false;
    let location: Location | undefined;
    if (locType === "S") {
      isRemote = true;
    } else if (locationName) {
      const [city, state] = locationName.split(", ");
      location = { city, state };
    }

    let datePosted: string | undefined;
    if (ageInDays != null) {
      const d = new Date();
      d.setDate(d.getDate() - ageInDays);
      datePosted = d.toISOString().split("T")[0];
    }

    const compensation = this.parseCompensation(header);
    let description: string | undefined;
    try {
      description = await this.fetchDescription(jobId, headers);
    } catch {
      /* ignore */
    }

    return {
      id: `gd-${jobId}`,
      title,
      company_url: companyId
        ? `${this.baseUrl}Overview/W-EI_IE${companyId}.htm`
        : undefined,
      company_name: companyName,
      date_posted: datePosted,
      job_url: jobUrl,
      location,
      compensation,
      is_remote: isRemote,
      description,
      emails: extractEmails(description),
      company_logo: job.overview?.squareLogoUrl,
      listing_type: header.adOrderSponsorshipLevel?.toLowerCase(),
    };
  }

  private parseCompensation(header: any): Compensation | undefined {
    const payPeriod = header.payPeriod;
    const adjustedPay = header.payPeriodAdjustedPay;
    if (!payPeriod || !adjustedPay) return undefined;

    const interval =
      payPeriod === "ANNUAL"
        ? CompensationInterval.YEARLY
        : getCompensationInterval(payPeriod);
    if (!interval) return undefined;

    return {
      interval,
      min_amount: Math.floor(adjustedPay.p10),
      max_amount: Math.floor(adjustedPay.p90),
      currency: header.payCurrency ?? "USD",
    };
  }

  private async fetchDescription(
    jobId: number,
    headers: Record<string, string>,
  ): Promise<string | undefined> {
    const body = [
      {
        operationName: "JobDetailQuery",
        variables: {
          jl: jobId,
          queryString: "q",
          pageTypeEnum: "SERP",
        },
        query: `
          query JobDetailQuery($jl: Long!, $queryString: String, $pageTypeEnum: PageTypeEnum) {
            jobview: jobView(
              listingId: $jl
              contextHolder: {queryString: $queryString, pageTypeEnum: $pageTypeEnum}
            ) { job { description __typename } __typename }
          }`,
      },
    ];

    const res = await this.session.fetch(`${this.baseUrl}graph`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as any[];
    let desc = json[0]?.data?.jobview?.job?.description;
    if (
      desc &&
      this.scraper_input.description_format === DescriptionFormat.MARKDOWN
    ) {
      desc = markdownConverter(desc);
    }
    return desc;
  }

  private async getLocation(
    location: string | undefined,
    isRemote: boolean,
    headers: Record<string, string>,
  ): Promise<[string, string | null]> {
    if (!location || isRemote) return ["11047", "STATE"];

    const url = `${this.baseUrl}findPopularLocationAjax.htm?maxLocationsToReturn=10&term=${encodeURIComponent(location)}`;
    const res = await this.session.fetch(url, { headers });
    if (!res.ok) {
      log.error(`location lookup failed: ${res.status}`);
      return ["", null];
    }
    const items = (await res.json()) as any[];
    if (!items?.length) {
      throw new Error(`Location '${location}' not found on Glassdoor`);
    }

    const typeMap: Record<string, string> = {
      C: "CITY",
      S: "STATE",
      N: "COUNTRY",
    };
    return [
      String(items[0].locationId),
      typeMap[items[0].locationType] ?? items[0].locationType,
    ];
  }
}
