import { createSession, type Session } from "wreq-js";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import {
  CompensationInterval,
  JobType,
  getJobTypeFromString,
} from "./types";

// ─── Logger ──────────────────────────────────────────────────────────────────

export type LogLevel = "error" | "warn" | "info" | "debug";

let globalLogLevel: LogLevel = "error";

const LOG_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function setLogLevel(verbose: number) {
  const map: Record<number, LogLevel> = { 0: "error", 1: "warn", 2: "info" };
  globalLogLevel = map[verbose] ?? "info";
}

export function createLogger(name: string) {
  const prefix = `JobSpy:${name}`;
  const shouldLog = (level: LogLevel) =>
    LOG_PRIORITY[level] <= LOG_PRIORITY[globalLogLevel];

  return {
    error: (msg: string) =>
      shouldLog("error") &&
      console.error(`${new Date().toISOString()} - ERROR - ${prefix} - ${msg}`),
    warn: (msg: string) =>
      shouldLog("warn") &&
      console.warn(`${new Date().toISOString()} - WARN - ${prefix} - ${msg}`),
    info: (msg: string) =>
      shouldLog("info") &&
      console.info(`${new Date().toISOString()} - INFO - ${prefix} - ${msg}`),
    debug: (msg: string) =>
      shouldLog("debug") &&
      console.debug(
        `${new Date().toISOString()} - DEBUG - ${prefix} - ${msg}`,
      ),
  };
}

// ─── Proxy rotation ──────────────────────────────────────────────────────────

function formatProxy(proxy: string): string {
  if (
    proxy.startsWith("http://") ||
    proxy.startsWith("https://") ||
    proxy.startsWith("socks5://")
  ) {
    return proxy;
  }
  return `http://${proxy}`;
}

export class ProxyRotator {
  private proxies: string[];
  private index = 0;

  constructor(proxies?: string | string[] | null) {
    if (!proxies) {
      this.proxies = [];
    } else if (typeof proxies === "string") {
      this.proxies = [formatProxy(proxies)];
    } else {
      this.proxies = proxies.map(formatProxy);
    }
  }

  next(): string | undefined {
    if (this.proxies.length === 0) return undefined;
    const proxy = this.proxies[this.index % this.proxies.length];
    this.index++;
    if (proxy === "http://localhost") return undefined;
    return proxy;
  }
}

// ─── Session factory ─────────────────────────────────────────────────────────

export interface CreateHttpSessionOptions {
  proxies?: string | string[] | null;
  browser?: string;
  os?: string;
  insecure?: boolean;
}

export async function createHttpSession(
  opts: CreateHttpSessionOptions = {},
): Promise<Session> {
  const proxyRotator = new ProxyRotator(opts.proxies);
  const proxy = proxyRotator.next();
  return createSession({
    browser: (opts.browser as any) ?? "chrome_131",
    os: (opts.os as any) ?? "macos",
    ...(proxy ? { proxy } : {}),
    ...(opts.insecure ? { insecure: true } : {}),
  });
}

// ─── HTML / Markdown ─────────────────────────────────────────────────────────

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export function markdownConverter(html: string | null | undefined): string | undefined {
  if (!html) return undefined;
  return turndown.turndown(html).trim();
}

export function plainConverter(html: string | null | undefined): string | undefined {
  if (!html) return undefined;
  const $ = cheerio.load(html);
  return $.text().replace(/\s+/g, " ").trim();
}

export function removeAttributes(html: string): string {
  const $ = cheerio.load(html, null, false);
  $("*").each((_, el) => {
    const elem = $(el);
    const attribs = (el as any).attribs || {};
    for (const attr of Object.keys(attribs)) {
      elem.removeAttr(attr);
    }
  });
  return $.html();
}

// ─── Email extraction ────────────────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function extractEmails(text: string | null | undefined): string[] | undefined {
  if (!text) return undefined;
  const matches = text.match(EMAIL_REGEX);
  return matches && matches.length > 0 ? matches : undefined;
}

// ─── Job type extraction from text ───────────────────────────────────────────

export function extractJobTypeFromText(
  description: string | null | undefined,
): JobType[] | undefined {
  if (!description) return undefined;
  const keywords: [JobType, RegExp][] = [
    [JobType.FULL_TIME, /full\s?time/i],
    [JobType.PART_TIME, /part\s?time/i],
    [JobType.INTERNSHIP, /internship/i],
    [JobType.CONTRACT, /contract/i],
  ];
  const found: JobType[] = [];
  for (const [jt, re] of keywords) {
    if (re.test(description)) found.push(jt);
  }
  return found.length > 0 ? found : undefined;
}

export { getJobTypeFromString };

// ─── Salary extraction from description ──────────────────────────────────────

interface ExtractedSalary {
  interval: string;
  min_amount: number;
  max_amount: number;
  currency: string;
}

export function extractSalary(
  text: string | null | undefined,
  opts: {
    lowerLimit?: number;
    upperLimit?: number;
    hourlyThreshold?: number;
    monthlyThreshold?: number;
    enforceAnnual?: boolean;
  } = {},
): ExtractedSalary | null {
  if (!text) return null;

  const {
    lowerLimit = 1000,
    upperLimit = 700000,
    hourlyThreshold = 350,
    monthlyThreshold = 30000,
    enforceAnnual = false,
  } = opts;

  const pattern =
    /\$(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)\s*[-—–]\s*(?:\$)?(\d+(?:,\d+)?(?:\.\d+)?)([kK]?)/;
  const match = text.match(pattern);
  if (!match) return null;

  const toNum = (s: string) => parseFloat(s.replace(/,/g, ""));
  let minSalary = toNum(match[1]);
  let maxSalary = toNum(match[3]);

  if (
    match[2].toLowerCase() === "k" ||
    match[4].toLowerCase() === "k"
  ) {
    minSalary *= 1000;
    maxSalary *= 1000;
  }

  let interval: string;
  let annualMin: number;
  let annualMax: number | undefined;

  if (minSalary < hourlyThreshold) {
    interval = CompensationInterval.HOURLY;
    annualMin = minSalary * 2080;
    annualMax = maxSalary < hourlyThreshold ? maxSalary * 2080 : undefined;
  } else if (minSalary < monthlyThreshold) {
    interval = CompensationInterval.MONTHLY;
    annualMin = minSalary * 12;
    annualMax = maxSalary < monthlyThreshold ? maxSalary * 12 : undefined;
  } else {
    interval = CompensationInterval.YEARLY;
    annualMin = minSalary;
    annualMax = maxSalary;
  }

  if (annualMax === undefined) return null;
  if (
    annualMin < lowerLimit ||
    annualMin > upperLimit ||
    annualMax < lowerLimit ||
    annualMax > upperLimit ||
    annualMin >= annualMax
  ) {
    return null;
  }

  return {
    interval,
    min_amount: enforceAnnual ? annualMin : minSalary,
    max_amount: enforceAnnual ? annualMax : maxSalary,
    currency: "USD",
  };
}

// ─── Annual salary conversion ────────────────────────────────────────────────

export function convertToAnnual(jobData: Record<string, any>) {
  const multipliers: Record<string, number> = {
    hourly: 2080,
    monthly: 12,
    weekly: 52,
    daily: 260,
  };
  const m = multipliers[jobData.interval];
  if (m) {
    jobData.min_amount *= m;
    jobData.max_amount *= m;
    jobData.interval = "yearly";
  }
}

// ─── Currency parsing ────────────────────────────────────────────────────────

export function parseCurrency(cur: string): number {
  let cleaned = cur.replace(/[^-0-9.,]/g, "");
  cleaned = cleaned.slice(0, -3).replace(/[.,]/g, "") + cleaned.slice(-3);
  if (cleaned.slice(-3).includes(".")) return parseFloat(cleaned);
  if (cleaned.slice(-3).includes(","))
    return parseFloat(cleaned.replace(",", "."));
  return parseFloat(cleaned);
}

// ─── Sleep helper ────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomSleep(min: number, max: number): Promise<void> {
  return sleep((min + Math.random() * (max - min)) * 1000);
}
