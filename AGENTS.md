# AGENTS.md — AI Agent Guidelines

This file instructs AI coding agents (GitHub Copilot, Cursor, Claude, etc.) on how to contribute to this project correctly.

---

## Mandatory: Update README and CHANGELOG on Every Meaningful Change

Whenever you make a change that affects user-visible behaviour — a new feature, a bug fix, a breaking change, a new CLI flag, a new API parameter, or a change to an existing interface — you **must** update both files as part of the same task:

1. **[CHANGELOG.md](CHANGELOG.md)** — record the change under `[Unreleased]`.
2. **[README.md](README.md)** — update any affected section (feature list, tables, examples, structure diagram).

Do not skip these updates. Do not leave them as a separate follow-up task.

---

## CHANGELOG Rules

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions:

- All unreleased work goes under `## [Unreleased]` at the top.
- Use these subsection headers: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, `Deprecated`.
- Write entries from the **user's point of view** — describe what they can now do, not what lines changed.
- When a version is released, rename `[Unreleased]` to `## [x.y.z] — YYYY-MM-DD` and add a new empty `[Unreleased]` block above it.
- Update the comparison links at the bottom of the file whenever a new version is cut.

### Entry format

```markdown
## [Unreleased]

### Added
- **Short feature name** — one-sentence description of what was added and why it is useful.

### Fixed
- Brief description of the bug and what was corrected.
```

---

## README Rules

The README is the primary user-facing documentation. Keep it accurate and complete:

| Section to update | When |
|---|---|
| **Features** bullet list | new capability added |
| **SDK — Parameters table** (`scrapeJobs` params) | new/changed param |
| **Authentication / Credentials** section | credential-related changes |
| **CLI — Quick Start** examples | new common use-case |
| **CLI — All CLI Options** table | new/changed CLI flag |
| **Config File — Profile Options** table | new/changed profile key |
| **Project Structure** tree | new source file added |
| **Supported Sites** table | new scraper |

Do not add a new CLI flag or SDK parameter without adding it to the corresponding table in README.md.

---

## Code Change Guidelines

### Types first
New user-facing features start in `src/types.ts`. Add interfaces and fields there before implementing them elsewhere, so TypeScript catches all callsites.

### Credential / auth changes
- Load credentials via `src/credentials.ts` — do not read `process.env` directly in scrapers.
- Credentials should only be *used* when `useCreds === true`. Never auto-login without explicit opt-in.
- Always test anonymous scraping first; authenticated fallback is a last resort.

### Scraper changes
- The constructor signature for scrapers is `{ proxies?, credentials?, useCreds? }` — maintain this shape.
- `SCRAPER_MAP` in `src/scraper.ts` must reflect the current constructor signature type.
- New scrapers must implement `scrape(input)` and should implement `fetchJob(id, format)` if single-job fetching is possible.

### CLI changes
- New options must be added in three places: the `program.option(...)` chain, the `o = { ... }` merge object, and the `scrapeJobs(...)` call.
- Profile config keys use `snake_case`; CLI flags use `--kebab-case`; the merge object uses `camelCase`.

### Testing
- Run `pnpm build` after changes to confirm TypeScript compiles cleanly.
- Add / update tests in `tests/` for any logic in `src/state.ts`, `src/credentials.ts`, or `src/utils.ts`.

---

## Release Checklist

When cutting a new version:

1. Move `[Unreleased]` entries in `CHANGELOG.md` to a new dated version block.
2. Bump `version` in `package.json`.
3. Update CHANGELOG comparison links at the bottom.
4. Commit with message: `chore: release vX.Y.Z`.
