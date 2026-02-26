import { Command } from "commander";
import { scrapeJobs } from "../scraper";
import { Site } from "../types";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadConfigFile(): Record<string, any> {
  const configPath = resolve(process.cwd(), "jobspy.config.json");
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

const program = new Command();

program
  .name("jobspy")
  .description(
    "Job scraper for LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter, Bayt, Naukri & BDJobs",
  )
  .version("1.0.0")
  .option(
    "-s, --site <sites...>",
    "Job boards to scrape (linkedin, indeed, zip_recruiter, glassdoor, google, bayt, naukri, bdjobs)",
  )
  .option("-q, --search-term <term>", "Search term")
  .option("--google-search-term <term>", "Google-specific search term")
  .option("-l, --location <location>", "Job location")
  .option("-d, --distance <miles>", "Distance in miles", "50")
  .option("-r, --remote", "Filter for remote jobs")
  .option(
    "-t, --job-type <type>",
    "Job type (fulltime, parttime, contract, internship)",
  )
  .option("--easy-apply", "Filter for easy apply jobs")
  .option("-n, --results <count>", "Number of results wanted (alias: --limit)", "15")
  .option("--limit <count>", "Alias for --results")
  .option(
    "-c, --country <country>",
    "Country for Indeed/Glassdoor",
    "usa",
  )
  .option(
    "-p, --proxies <proxies...>",
    "Proxy servers (user:pass@host:port)",
  )
  .option(
    "--format <format>",
    "Description format (markdown, html, plain)",
    "markdown",
  )
  .option("--linkedin-fetch-description", "Fetch full LinkedIn descriptions")
  .option(
    "--linkedin-company-ids <ids...>",
    "LinkedIn company IDs to filter",
  )
  .option("--offset <offset>", "Start from offset", "0")
  .option(
    "--hours-old <hours>",
    "Filter jobs posted within N hours",
  )
  .option("--enforce-annual-salary", "Convert all salaries to annual")
  .option("-v, --verbose <level>", "Verbosity (0=errors, 1=warnings, 2=all)", "0")
  .option("-o, --output <file>", "Output file path (JSON or CSV based on extension)")
  .option("--profile <name>", "Named search profile — saves params and dedup state")
  .option("--all", "Skip dedup for this run (still updates state)")
  .option("--list-profiles", "List saved profiles and their last run time")
  .option("--init", "Generate a jobspy.config.json in the current directory with defaults")
  .action(async (opts) => {
    if (opts.init) {
      const configPath = resolve(process.cwd(), "jobspy.config.json");
      if (existsSync(configPath)) {
        console.error(`Config file already exists: ${configPath}`);
        process.exit(1);
      }
      const defaultConfig = {
        site: ["linkedin", "indeed", "zip_recruiter", "glassdoor", "google", "bayt", "naukri", "bdjobs"],
        search_term: "react developer",
        google_search_term: "react developer jobs near New York NY",
        location: "New York, NY",
        distance: 25,
        remote: false,
        job_type: "fulltime",
        easy_apply: false,
        results: 50,
        country: "usa",
        proxies: [],
        format: "markdown",
        linkedin_fetch_description: true,
        linkedin_company_ids: [],
        offset: 0,
        hours_old: 72,
        enforce_annual_salary: true,
        verbose: 1,
        output: "jobs.csv",
        profile: "react-ny",
      };
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + "\n");
      console.log(`Created ${configPath}`);
      return;
    }
    if (opts.listProfiles) {
      const { findStateFilePath, loadState } = await import("../state");
      const stateFilePath = findStateFilePath();
      const state = loadState(stateFilePath);
      const profiles = Object.entries(state.profiles ?? {});
      if (profiles.length === 0) {
        console.log(`No saved profiles in ${stateFilePath}. Run with --profile <name> to create one.`);
      } else {
        console.log(`Profiles in ${stateFilePath}:`);
        for (const [name, p] of profiles) {
          const last = p.lastRunAt ? new Date(p.lastRunAt).toLocaleString() : "never";
          const sites = (p.params.site_name as string[] | undefined)?.join(", ") ?? "all";
          console.log(`  ${name.padEnd(20)} last run: ${last}  sites: ${sites}  term: ${p.params.search_term ?? ""}`);
        }
      }
      return;
    }
    // Merge config file defaults — CLI flags take priority
    const cfg = loadConfigFile();
    const cliSet = program.opts(); // only flags explicitly passed
    const o = {
      site: opts.site ?? cfg.site,
      searchTerm: opts.searchTerm ?? cfg.search_term ?? undefined,
      googleSearchTerm: opts.googleSearchTerm ?? cfg.google_search_term ?? undefined,
      location: opts.location ?? cfg.location ?? undefined,
      distance: cliSet.distance !== undefined ? opts.distance : String(cfg.distance ?? 50),
      remote: opts.remote ?? cfg.remote ?? false,
      jobType: opts.jobType ?? cfg.job_type ?? undefined,
      easyApply: opts.easyApply ?? cfg.easy_apply ?? false,
      results: cliSet.results !== undefined ? opts.results : String(cfg.results ?? 15),
      limit: opts.limit,
      country: cliSet.country !== undefined ? opts.country : (cfg.country ?? "usa"),
      proxies: opts.proxies ?? cfg.proxies ?? undefined,
      format: cliSet.format !== undefined ? opts.format : (cfg.format ?? "markdown"),
      linkedinFetchDescription: opts.linkedinFetchDescription ?? cfg.linkedin_fetch_description ?? false,
      linkedinCompanyIds: opts.linkedinCompanyIds ?? cfg.linkedin_company_ids ?? undefined,
      offset: cliSet.offset !== undefined ? opts.offset : String(cfg.offset ?? 0),
      hoursOld: opts.hoursOld ?? (cfg.hours_old != null ? String(cfg.hours_old) : undefined),
      enforceAnnualSalary: opts.enforceAnnualSalary ?? cfg.enforce_annual_salary ?? false,
      verbose: cliSet.verbose !== undefined ? opts.verbose : String(cfg.verbose ?? 0),
      output: opts.output ?? cfg.output ?? undefined,
      profile: opts.profile ?? cfg.profile ?? undefined,
      all: opts.all ?? false,
    };

    if (o.all && !o.profile) {
      console.warn("Warning: --all has no effect without --profile");
    }
    try {
      const result = await scrapeJobs({
        site_name: o.site,
        search_term: o.searchTerm,
        google_search_term: o.googleSearchTerm,
        location: o.location,
        distance: parseInt(o.distance),
        is_remote: o.remote,
        job_type: o.jobType,
        easy_apply: o.easyApply,
        results_wanted: parseInt(o.limit ?? o.results),
        country_indeed: o.country,
        proxies: o.proxies,
        description_format: o.format,
        linkedin_fetch_description: o.linkedinFetchDescription,
        linkedin_company_ids: o.linkedinCompanyIds?.map(Number),
        offset: parseInt(o.offset),
        hours_old: o.hoursOld ? parseInt(o.hoursOld) : undefined,
        enforce_annual_salary: o.enforceAnnualSalary,
        verbose: parseInt(o.verbose),
        profile: o.profile,
        skip_dedup: o.all,
      });

      console.log(`Found ${result.jobs.length} jobs`);
      if (result.profile) {
        const runLabel = result.profile.lastRunAt ? "new since last run" : "first run";
        console.log(`  (${result.totalScraped} scraped, ${result.newCount} ${runLabel} — state: ${result.profile.stateFile})`);
      }

      if (o.output) {
        const outPath = o.output as string;
        if (outPath.endsWith(".csv")) {
          writeFileSync(outPath, jobsToCsv(result.jobs));
          console.log(`Results written to ${outPath}`);
        } else {
          writeFileSync(outPath, JSON.stringify(result.jobs, null, 2));
          console.log(`Results written to ${outPath}`);
        }
      } else {
        // Print summary table to stdout
        for (const job of result.jobs) {
          const line = [
            job.site?.padEnd(14),
            (job.title ?? "").slice(0, 40).padEnd(42),
            (job.company ?? "").slice(0, 20).padEnd(22),
            (job.location ?? "").slice(0, 25).padEnd(27),
            job.date_posted ?? "",
          ].join("");
          console.log(line);
        }
      }
    } catch (e: unknown) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

function jobsToCsv(jobs: any[]): string {
  if (jobs.length === 0) return "";
  const headers = Object.keys(jobs[0]);
  const escape = (val: any): string => {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(",")];
  for (const job of jobs) {
    lines.push(headers.map((h) => escape(job[h])).join(","));
  }
  return lines.join("\n");
}

program.parse();
