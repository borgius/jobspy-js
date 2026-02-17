import { Command } from "commander";
import { scrapeJobs } from "../scraper";
import { Site } from "../types";
import { writeFileSync } from "node:fs";

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
  .option("-n, --results <count>", "Number of results wanted", "15")
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
  .action(async (opts) => {
    try {
      const result = await scrapeJobs({
        site_name: opts.site,
        search_term: opts.searchTerm,
        google_search_term: opts.googleSearchTerm,
        location: opts.location,
        distance: parseInt(opts.distance),
        is_remote: opts.remote ?? false,
        job_type: opts.jobType,
        easy_apply: opts.easyApply,
        results_wanted: parseInt(opts.results),
        country_indeed: opts.country,
        proxies: opts.proxies,
        description_format: opts.format,
        linkedin_fetch_description: opts.linkedinFetchDescription,
        linkedin_company_ids: opts.linkedinCompanyIds?.map(Number),
        offset: parseInt(opts.offset),
        hours_old: opts.hoursOld ? parseInt(opts.hoursOld) : undefined,
        enforce_annual_salary: opts.enforceAnnualSalary ?? false,
        verbose: parseInt(opts.verbose),
      });

      console.log(`Found ${result.jobs.length} jobs`);

      if (opts.output) {
        const outPath = opts.output as string;
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
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
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
