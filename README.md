# github-maintenance-tools

Small helpers for tending a GitHub account or organization: inventories, taxonomy via topics, and room to grow (archival workflows, stale-repo reports, scripted topic edits).

## Requirements

- [GitHub CLI](https://cli.github.com/) (`gh`) with `gh auth login`
- [jq](https://stedolan.github.io/jq/)

## Repo inventory (`github-repo-inventory`)

Exports everything `gh repo list` can expose for triage JSON/CSV snapshots.

From the repo root:

```bash
bash scripts/github-repo-inventory.sh
```

Useful environment variables:

| Variable | Purpose |
|----------|---------|
| `OWNER` | User or organization (defaults to authenticated user) |
| `LIMIT` | Max repos (default `9999`) |
| `INCLUDE_FORKS` | Set to any value to include forks |
| `GITHUB_REPO_AUDIT_OUT` | Output directory (default `./github-repo-audit`) |
| `ENRICH_JQ` | Override path to the scoring/filter jq program |

Output files are dated: `repos-<OWNER>-<timestamp>.{json,-enriched.json,-triage.csv}`.

Tune the heuristic **`audit_score_triage`** in `scripts/github-repo-inventory-enrich.jq`.

## Suggested repo topics

Use GitHub topics as a taxonomy, for example:

- `lifecycle:active`, `lifecycle:experiment`, `lifecycle:paused`, …
- `priority:must-keep`, `priority:candidate-delete`, …
- `maturity:sketch`, `maturity:maintained`, …

Topics recognized by the scorer are documented in comments at the top of `scripts/github-repo-inventory-enrich.jq`.

## License

Unlicensed; add a `LICENSE` if you publish publicly.
