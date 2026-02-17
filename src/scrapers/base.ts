import type { Session } from "wreq-js";
import type { JobResponse, ScraperInput, Site } from "../types";
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

  protected async initSession(browser?: string) {
    const proxy = this.proxyRotator.next();
    this.session = await createHttpSession({
      proxies: proxy ? [proxy] : undefined,
      browser,
    });
  }

  protected async fetchWithProxy(
    url: string,
    init?: any,
  ): Promise<any> {
    return this.session.fetch(url, init);
  }

  abstract scrape(input: ScraperInput): Promise<JobResponse>;

  async close() {
    if (this.session) {
      await this.session.close();
    }
  }
}
