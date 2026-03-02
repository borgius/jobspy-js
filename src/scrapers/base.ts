import type { Session } from "wreq-js";
import type { DescriptionFormat, JobPost, JobResponse, ProviderCredentials, ProviderCreds, ScraperInput, Site } from "../types";
import { ProxyRotator, createHttpSession } from "../utils";

export abstract class Scraper {
  readonly site: Site;
  protected proxyRotator: ProxyRotator;
  protected session!: Session;
  /** Resolved credentials for all providers (populated by scraper.ts). */
  protected credentials: ProviderCredentials;
  /** When true, use credentials as fallback if anonymous scraping fails. */
  protected useCreds: boolean;

  constructor(
    site: Site,
    options: { proxies?: string | string[] | null; credentials?: ProviderCredentials; useCreds?: boolean } = {},
  ) {
    this.site = site;
    this.proxyRotator = new ProxyRotator(options.proxies);
    this.credentials = options.credentials ?? {};
    this.useCreds = options.useCreds ?? false;
  }

  /** Convenience – returns creds for this scraper's provider key, if any. */
  protected get providerCreds(): ProviderCreds | undefined {
    const key = (this.site as string).replace(/-/g, "_") as keyof ProviderCredentials;
    return this.credentials[key];
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
