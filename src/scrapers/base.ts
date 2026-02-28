import type { Session } from "wreq-js";
import type { DescriptionFormat, JobPost, JobResponse, ScraperInput, Site } from "../types";
import { ProxyRotator, createHttpSession } from "../utils";

export abstract class Scraper {
  readonly site: Site;
  protected proxyRotator: ProxyRotator;
  protected session!: Session;

  constructor(
    site: Site,
    options: { proxies?: string | string[] | null } = {},
  ) {
    this.site = site;
    this.proxyRotator = new ProxyRotator(options.proxies);
  }

  async initSession(browser?: string, insecure?: boolean) {
    const proxy = this.proxyRotator.next();
    this.session = await createHttpSession({
      proxies: proxy ? [proxy] : undefined,
      browser,
      insecure,
    });
  }

  protected async fetchWithProxy(
    url: string,
    init?: any,
  ): Promise<any> {
    return this.session.fetch(url, init);
  }

  abstract scrape(input: ScraperInput): Promise<JobResponse>;

  /**
   * Fetch full details for a single job by its provider-specific ID.
   * Subclasses should override this to provide per-provider implementation.
   */
  async fetchJob(
    _id: string,
    _format: DescriptionFormat,
  ): Promise<JobPost | null> {
    throw new Error(`fetchJob not supported for ${this.site}`);
  }

  async close() {
    if (this.session) {
      await this.session.close();
    }
  }
}
