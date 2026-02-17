import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scrapeJobs } from "../../src/scraper";

const OUT_DIR = join(import.meta.dirname, "../../tmp/test-results");

describe("Glassdoor integration", () => {
  it("searches for react jobs and saves results", async () => {
    const result = await scrapeJobs({
      site_name: ["glassdoor"],
      search_term: "react",
      results_wanted: 5,
      country_indeed: "usa",
    });

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      join(OUT_DIR, "glassdoor.json"),
      JSON.stringify(result, null, 2),
    );

    console.log(`Glassdoor: found ${result.jobs.length} jobs`);
    expect(result.jobs.length).toBeGreaterThan(0);
    for (const job of result.jobs) {
      expect(job.title).toBeTruthy();
      expect(job.job_url).toBeTruthy();
    }
  }, 60_000);
});
