import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scrapeJobs } from "../scraper";

const server = new McpServer({
  name: "jobspy",
  version: "1.0.0",
});

server.tool(
  "scrape_jobs",
  "Scrape job listings from multiple job boards (LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter, Bayt, Naukri, BDJobs)",
  {
    site_name: z
      .array(
        z.enum([
          "linkedin",
          "indeed",
          "zip_recruiter",
          "glassdoor",
          "google",
          "bayt",
          "naukri",
          "bdjobs",
        ]),
      )
      .optional()
      .describe(
        "Job boards to scrape. Defaults to all. Options: linkedin, indeed, zip_recruiter, glassdoor, google, bayt, naukri, bdjobs",
      ),
    search_term: z
      .string()
      .optional()
      .describe("Search term / job title to search for"),
    google_search_term: z
      .string()
      .optional()
      .describe("Google-specific search term (overrides search_term for Google)"),
    location: z.string().optional().describe("Job location (e.g. 'San Francisco, CA')"),
    distance: z
      .number()
      .optional()
      .default(50)
      .describe("Search radius in miles"),
    is_remote: z.boolean().optional().default(false).describe("Filter for remote jobs"),
    job_type: z
      .enum(["fulltime", "parttime", "contract", "internship"])
      .optional()
      .describe("Filter by job type"),
    results_wanted: z
      .number()
      .optional()
      .default(10)
      .describe("Number of results to return per site"),
    country_indeed: z
      .string()
      .optional()
      .default("usa")
      .describe("Country for Indeed/Glassdoor (e.g. 'usa', 'uk', 'canada')"),
    hours_old: z
      .number()
      .optional()
      .describe("Filter jobs posted within the last N hours"),
    description_format: z
      .enum(["markdown", "html", "plain"])
      .optional()
      .default("markdown")
      .describe("Format for job descriptions"),
    linkedin_fetch_description: z
      .boolean()
      .optional()
      .default(false)
      .describe("Fetch full descriptions from LinkedIn (slower)"),
  },
  async (params) => {
    try {
      const result = await scrapeJobs({
        site_name: params.site_name,
        search_term: params.search_term,
        google_search_term: params.google_search_term,
        location: params.location,
        distance: params.distance,
        is_remote: params.is_remote,
        job_type: params.job_type,
        results_wanted: params.results_wanted,
        country_indeed: params.country_indeed,
        hours_old: params.hours_old,
        description_format: params.description_format,
        linkedin_fetch_description: params.linkedin_fetch_description,
      });

      if (result.jobs.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No jobs found matching the search criteria.",
            },
          ],
        };
      }

      // Format jobs as a readable summary + structured data
      const summary = result.jobs
        .map((job, i) => {
          const parts = [
            `${i + 1}. **${job.title}**`,
            `   Company: ${job.company ?? "N/A"}`,
            `   Location: ${job.location ?? "N/A"}${job.is_remote ? " (Remote)" : ""}`,
            `   URL: ${job.job_url}`,
          ];
          if (job.date_posted) parts.push(`   Posted: ${job.date_posted}`);
          if (job.min_amount && job.max_amount) {
            parts.push(
              `   Salary: ${job.currency ?? "$"}${job.min_amount.toLocaleString()} - ${job.currency ?? "$"}${job.max_amount.toLocaleString()} (${job.interval ?? "yearly"})`,
            );
          }
          if (job.job_type) parts.push(`   Type: ${job.job_type}`);
          return parts.join("\n");
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${result.jobs.length} jobs:\n\n${summary}`,
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error scraping jobs: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("MCP server error:", e);
  process.exit(1);
});
