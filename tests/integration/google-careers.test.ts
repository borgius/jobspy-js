import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scrapeJobs } from "../../src/scraper";

const OUT_DIR = join(import.meta.dirname, "../../tmp/test-results");

describe("Google Careers integration", () => {
  it("searches for software engineer jobs and saves results", async () => {
    const result = await scrapeJobs({
      site_name: ["google_careers"],
      search_term: "software engineer",
      location: "USA",
      results_wanted: 5,
    });

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      join(OUT_DIR, "google-careers.json"),
      JSON.stringify(result, null, 2),
    );

    console.log(`Google Careers: found ${result.jobs.length} jobs`);
    expect(result.jobs.length).toBeGreaterThan(0);
    for (const job of result.jobs) {
      expect(job.title).toBeTruthy();
      expect(job.job_url).toBeTruthy();
    }
  }, 30_000);
});
