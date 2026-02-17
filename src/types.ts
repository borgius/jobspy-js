export enum Site {
  LINKEDIN = "linkedin",
  INDEED = "indeed",
  ZIP_RECRUITER = "zip_recruiter",
  GLASSDOOR = "glassdoor",
  GOOGLE = "google",
  GOOGLE_CAREERS = "google_careers",
  BAYT = "bayt",
  NAUKRI = "naukri",
  BDJOBS = "bdjobs",
}

export enum JobType {
  FULL_TIME = "fulltime",
  PART_TIME = "parttime",
  CONTRACT = "contract",
  TEMPORARY = "temporary",
  INTERNSHIP = "internship",
  PER_DIEM = "perdiem",
  NIGHTS = "nights",
  OTHER = "other",
  SUMMER = "summer",
  VOLUNTEER = "volunteer",
}

const JOB_TYPE_ALIASES: Record<string, JobType> = {
  fulltime: JobType.FULL_TIME,
  "períodointegral": JobType.FULL_TIME,
  "estágio/trainee": JobType.FULL_TIME,
  "cunormăîntreagă": JobType.FULL_TIME,
  tiempocompleto: JobType.FULL_TIME,
  vollzeit: JobType.FULL_TIME,
  voltijds: JobType.FULL_TIME,
  tempointegral: JobType.FULL_TIME,
  "全职": JobType.FULL_TIME,
  "plnýúvazek": JobType.FULL_TIME,
  fuldtid: JobType.FULL_TIME,
  "دوامكامل": JobType.FULL_TIME,
  "kokopäivätyö": JobType.FULL_TIME,
  tempsplein: JobType.FULL_TIME,
  "πλήρηςαπασχόληση": JobType.FULL_TIME,
  "teljesmunkaidő": JobType.FULL_TIME,
  tempopieno: JobType.FULL_TIME,
  heltid: JobType.FULL_TIME,
  jornadacompleta: JobType.FULL_TIME,
  "pełnyetat": JobType.FULL_TIME,
  "정규직": JobType.FULL_TIME,
  "100%": JobType.FULL_TIME,
  "全職": JobType.FULL_TIME,
  "งานประจำ": JobType.FULL_TIME,
  "tamzamanlı": JobType.FULL_TIME,
  "повназайнятість": JobType.FULL_TIME,
  "toànthờigian": JobType.FULL_TIME,
  parttime: JobType.PART_TIME,
  teilzeit: JobType.PART_TIME,
  "částečnýúvazek": JobType.PART_TIME,
  deltid: JobType.PART_TIME,
  contract: JobType.CONTRACT,
  contractor: JobType.CONTRACT,
  temporary: JobType.TEMPORARY,
  internship: JobType.INTERNSHIP,
  "prácticas": JobType.INTERNSHIP,
  "ojt(onthejobtraining)": JobType.INTERNSHIP,
  praktikum: JobType.INTERNSHIP,
  praktik: JobType.INTERNSHIP,
  perdiem: JobType.PER_DIEM,
  nights: JobType.NIGHTS,
  other: JobType.OTHER,
  summer: JobType.SUMMER,
  volunteer: JobType.VOLUNTEER,
};

export function getJobTypeFromString(value: string): JobType | null {
  const normalized = value.replace(/[-\s]/g, "").toLowerCase();
  return JOB_TYPE_ALIASES[normalized] ?? null;
}

export enum CompensationInterval {
  YEARLY = "yearly",
  MONTHLY = "monthly",
  WEEKLY = "weekly",
  DAILY = "daily",
  HOURLY = "hourly",
}

export function getCompensationInterval(
  payPeriod: string,
): CompensationInterval | null {
  const mapping: Record<string, CompensationInterval> = {
    DAY: CompensationInterval.DAILY,
    DAILY: CompensationInterval.DAILY,
    YEAR: CompensationInterval.YEARLY,
    YEARLY: CompensationInterval.YEARLY,
    ANNUAL: CompensationInterval.YEARLY,
    HOUR: CompensationInterval.HOURLY,
    HOURLY: CompensationInterval.HOURLY,
    WEEK: CompensationInterval.WEEKLY,
    WEEKLY: CompensationInterval.WEEKLY,
    MONTH: CompensationInterval.MONTHLY,
    MONTHLY: CompensationInterval.MONTHLY,
  };
  return mapping[payPeriod.toUpperCase()] ?? null;
}

export enum DescriptionFormat {
  MARKDOWN = "markdown",
  HTML = "html",
  PLAIN = "plain",
}

export enum SalarySource {
  DIRECT_DATA = "direct_data",
  DESCRIPTION = "description",
}

export interface Location {
  city?: string;
  state?: string;
  country?: string;
}

export interface Compensation {
  interval?: CompensationInterval;
  min_amount?: number;
  max_amount?: number;
  currency?: string;
}

export interface JobPost {
  id?: string;
  title: string;
  company_name?: string;
  job_url: string;
  job_url_direct?: string;
  location?: Location;
  description?: string;
  company_url?: string;
  company_url_direct?: string;
  job_type?: JobType[];
  compensation?: Compensation;
  date_posted?: string;
  emails?: string[];
  is_remote?: boolean;
  listing_type?: string;

  // LinkedIn specific
  job_level?: string;
  // LinkedIn and Indeed specific
  company_industry?: string;
  // Indeed specific
  company_addresses?: string;
  company_num_employees?: string;
  company_revenue?: string;
  company_description?: string;
  company_logo?: string;
  banner_photo_url?: string;
  // LinkedIn only
  job_function?: string;

  // Naukri specific
  skills?: string[];
  experience_range?: string;
  company_rating?: number;
  company_reviews_count?: number;
  vacancy_count?: number;
  work_from_home_type?: string;
}

export interface JobResponse {
  jobs: JobPost[];
}

export interface ScraperInput {
  site_type: Site[];
  search_term?: string;
  google_search_term?: string;
  location?: string;
  country?: Country;
  distance?: number;
  is_remote?: boolean;
  job_type?: JobType;
  easy_apply?: boolean;
  offset?: number;
  linkedin_fetch_description?: boolean;
  linkedin_company_ids?: number[];
  description_format?: DescriptionFormat;
  results_wanted?: number;
  hours_old?: number;
}

export interface ScrapeJobsParams {
  site_name?: string | string[] | Site | Site[];
  search_term?: string;
  google_search_term?: string;
  location?: string;
  distance?: number;
  is_remote?: boolean;
  job_type?: string;
  easy_apply?: boolean;
  results_wanted?: number;
  country_indeed?: string;
  proxies?: string | string[];
  description_format?: string;
  linkedin_fetch_description?: boolean;
  linkedin_company_ids?: number[];
  offset?: number;
  hours_old?: number;
  enforce_annual_salary?: boolean;
  verbose?: number;
}

export interface Country {
  name: string;
  indeed_domain: string;
  indeed_api_code: string;
  glassdoor_domain?: string;
}

export const COUNTRIES: Record<string, Country> = {};

function addCountry(
  names: string,
  indeedDomain: string,
  glassdoorDomain?: string,
) {
  const nameList = names.split(",").map((n) => n.trim().toLowerCase());
  const [domain, apiCode] = indeedDomain.includes(":")
    ? indeedDomain.split(":")
    : [indeedDomain, indeedDomain.toUpperCase()];

  let gdDomain: string | undefined;
  if (glassdoorDomain) {
    const [sub, tld] = glassdoorDomain.includes(":")
      ? glassdoorDomain.split(":")
      : ["www", glassdoorDomain];
    gdDomain = tld
      ? `${sub}.glassdoor.${tld}`
      : `www.glassdoor.${glassdoorDomain}`;
  }

  const country: Country = {
    name: nameList[0],
    indeed_domain: domain,
    indeed_api_code: apiCode.toUpperCase(),
    glassdoor_domain: gdDomain,
  };
  for (const n of nameList) {
    COUNTRIES[n] = country;
  }
}

// Register all countries
addCountry("argentina", "ar", "com.ar");
addCountry("australia", "au", "com.au");
addCountry("austria", "at", "at");
addCountry("bahrain", "bh");
addCountry("bangladesh", "bd");
addCountry("belgium", "be", "fr:be");
addCountry("brazil", "br", "com.br");
addCountry("canada", "ca", "ca");
addCountry("chile", "cl");
addCountry("china", "cn");
addCountry("colombia", "co");
addCountry("costa rica", "cr");
addCountry("czech republic,czechia", "cz");
addCountry("denmark", "dk");
addCountry("ecuador", "ec");
addCountry("egypt", "eg");
addCountry("finland", "fi");
addCountry("france", "fr", "fr");
addCountry("germany", "de", "de");
addCountry("greece", "gr");
addCountry("hong kong", "hk", "com.hk");
addCountry("hungary", "hu");
addCountry("india", "in", "co.in");
addCountry("indonesia", "id");
addCountry("ireland", "ie", "ie");
addCountry("israel", "il");
addCountry("italy", "it", "it");
addCountry("japan", "jp");
addCountry("kuwait", "kw");
addCountry("luxembourg", "lu");
addCountry("malaysia", "malaysia:my", "com");
addCountry("mexico", "mx", "com.mx");
addCountry("morocco", "ma");
addCountry("netherlands", "nl", "nl");
addCountry("new zealand", "nz", "co.nz");
addCountry("nigeria", "ng");
addCountry("norway", "no");
addCountry("oman", "om");
addCountry("pakistan", "pk");
addCountry("panama", "pa");
addCountry("peru", "pe");
addCountry("philippines", "ph");
addCountry("poland", "pl");
addCountry("portugal", "pt");
addCountry("qatar", "qa");
addCountry("romania", "ro");
addCountry("saudi arabia", "sa");
addCountry("singapore", "sg", "sg");
addCountry("south africa", "za");
addCountry("south korea", "kr");
addCountry("spain", "es", "es");
addCountry("sweden", "se");
addCountry("switzerland", "ch", "de:ch");
addCountry("taiwan", "tw");
addCountry("thailand", "th");
addCountry("türkiye,turkey", "tr");
addCountry("ukraine", "ua");
addCountry("united arab emirates", "ae");
addCountry("uk,united kingdom", "uk:gb", "co.uk");
addCountry("usa,us,united states", "www:us", "com");
addCountry("uruguay", "uy");
addCountry("venezuela", "ve");
addCountry("vietnam", "vn", "com");
// Internal
addCountry("usa/ca", "www");
addCountry("worldwide", "www");

export function getCountry(name: string): Country {
  const key = name.trim().toLowerCase();
  const country = COUNTRIES[key];
  if (!country) {
    throw new Error(
      `Invalid country: '${name}'. Valid countries: ${Object.keys(COUNTRIES).join(", ")}`,
    );
  }
  return country;
}

export function displayLocation(loc: Location): string {
  const parts: string[] = [];
  if (loc.city) parts.push(loc.city);
  if (loc.state) parts.push(loc.state);
  if (loc.country) {
    const c = loc.country.toLowerCase();
    if (c === "usa" || c === "us" || c === "uk") {
      parts.push(c.toUpperCase());
    } else if (c !== "worldwide" && c !== "usa/ca") {
      parts.push(c.charAt(0).toUpperCase() + c.slice(1));
    }
  }
  return parts.join(", ");
}

export const DESIRED_COLUMNS = [
  "id",
  "site",
  "job_url",
  "job_url_direct",
  "title",
  "company",
  "location",
  "date_posted",
  "job_type",
  "salary_source",
  "interval",
  "min_amount",
  "max_amount",
  "currency",
  "is_remote",
  "job_level",
  "job_function",
  "listing_type",
  "emails",
  "description",
  "company_industry",
  "company_url",
  "company_logo",
  "company_url_direct",
  "company_addresses",
  "company_num_employees",
  "company_revenue",
  "company_description",
  "skills",
  "experience_range",
  "company_rating",
  "company_reviews_count",
  "vacancy_count",
  "work_from_home_type",
] as const;
