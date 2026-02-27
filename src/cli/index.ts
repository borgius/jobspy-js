import { Command } from "commander";
import { scrapeJobs, fetchLinkedInJob } from "../scraper";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

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
  .option("--profile <name>", "Named search profile from jobspy.json")
  .option("--all", "Skip dedup for this run (still updates state)")
  .option("--list-profiles", "List saved profiles and their last run time")
  .option("--init", "Generate a jobspy.json with sample profiles")
  .option("--describe <jobId>", "Fetch full LinkedIn job details by ID or URL")
  .action(async (opts) => {
    if (opts.init) {
      const filePath = resolve(process.cwd(), "jobspy.json");
      if (existsSync(filePath)) {
        console.error(`File already exists: ${filePath}`);
        process.exit(1);
      }
      const defaultFile = {
        config: {
          profiles: {
            frontend: {
              site: ["linkedin", "indeed", "zip_recruiter", "glassdoor", "google", "bayt", "naukri", "bdjobs"],
              search_term: "react frontend developer",
              google_search_term: "react frontend developer jobs near New York NY",
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
              output: "frontend-jobs.csv",
            },
            backend: {
              site: ["linkedin", "indeed", "zip_recruiter", "glassdoor", "google", "bayt", "naukri", "bdjobs"],
              search_term: "node.js backend engineer",
              google_search_term: "node.js backend engineer jobs near New York NY",
              location: "New York, NY",
              distance: 25,
              remote: true,
              job_type: "fulltime",
              easy_apply: false,
              results: 50,
              country: "usa",
              proxies: [],
              format: "markdown",
              linkedin_fetch_description: true,
              linkedin_company_ids: [],
              offset: 0,
              hours_old: 48,
              enforce_annual_salary: true,
              verbose: 1,
              output: "backend-jobs.json",
            },
          },
        },
        state: {
          version: 1,
          profiles: {},
        },
      };
      writeFileSync(filePath, JSON.stringify(defaultFile, null, 2) + "\n");
      console.log(`Created ${filePath}`);
      return;
    }

    if (opts.describe) {
      try {
        const details = await fetchLinkedInJob(opts.describe, {
          format: opts.format,
        });
        console.log(JSON.stringify(details, null, 2));
      } catch (e: unknown) {
        console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
      return;
    }

    if (opts.listProfiles) {
      const { findJobspyPath, loadFile } = await import("../state");
      const filePath = findJobspyPath();
      const file = loadFile(filePath);
      const configNames = Object.keys(file.config.profiles);
      const stateNames = Object.keys(file.state.profiles ?? {});
      const allNames = [...new Set([...configNames, ...stateNames])].sort();
      if (allNames.length === 0) {
        console.log(`No profiles in ${filePath}. Run --init to create one.`);
      } else {
        console.log(`Profiles in ${filePath}:`);
        for (const name of allNames) {
          const cfg = file.config.profiles[name];
          const st = file.state.profiles?.[name];
          const last = st?.lastRunAt ? new Date(st.lastRunAt).toLocaleString() : "never";
          const sites = cfg?.site
            ? (Array.isArray(cfg.site) ? cfg.site.join(", ") : cfg.site)
            : "all";
          const term = cfg?.search_term ?? "";
          console.log(`  ${name.padEnd(20)} last run: ${last}  sites: ${sites}  term: ${term}`);
        }
      }
      return;
    }

    // Load config profile defaults from jobspy.json (if profile specified)
    let cfg: Record<string, any> = {};
    if (opts.profile) {
      const { findJobspyPath, loadFile } = await import("../state");
      const filePath = findJobspyPath();
      const file = loadFile(filePath);
      const profileConfig = file.config.profiles[opts.profile];
      if (profileConfig) {
        cfg = profileConfig;
      }
    }

    // Merge: CLI flags override config profile defaults
    const cliSet = program.opts();
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
      profile: opts.profile,
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
