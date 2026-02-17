import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scrapeJobs } from "../../src/scraper";

const OUT_DIR = join(import.meta.dirname, "../../tmp/test-results");

describe("Google integration", () => {
  it("searches for react jobs and saves results", async () => {
    const result = await scrapeJobs({
      site_name: ["google"],
      search_term: "react",
      results_wanted: 5,
    });

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      join(OUT_DIR, "google.json"),
      JSON.stringify(result, null, 2),
    );

    console.log(`Google: found ${result.jobs.length} jobs`);
    expect(result.jobs.length).toBeGreaterThan(0);
    for (const job of result.jobs) {
      expect(job.title).toBeTruthy();
      expect(job.job_url).toBeTruthy();
    }
  }, 60_000);
});
