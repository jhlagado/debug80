#!/usr/bin/env bash
#
# Export GitHub repos to JSON + CSV for triage and topic-based taxonomy.
# Requires: gh, jq (bash 4+ recommended)
#
# Usage:
#   bash scripts/github-repo-inventory.sh
#   OWNER=my-org LIMIT=500 bash scripts/github-repo-inventory.sh
#   INCLUDE_FORKS=1 bash scripts/github-repo-inventory.sh
#
# Optional env:
#   GITHUB_REPO_AUDIT_OUT  output directory (default: ./github-repo-audit)
#   OWNER                   user or org (default: authenticated user login)
#   LIMIT                   max repos (default: 9999)
#   INCLUDE_FORKS           set nonempty to include forks (default: omit forks)
#   ENRICH_JQ               path to scoring jq program (default: github-repo-inventory-enrich.jq beside this script)
#
# Suggested GitHub Topics (add via UI or: gh repo edit OWNER/NAME --add-topic "lifecycle:active"):
#   lifecycle:experiment sandbox active paused archived
#   priority:must-keep nice-to-have candidate-archive candidate-delete
#   maturity:sketch usable maintained

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENRICH_JQ="${ENRICH_JQ:-$SCRIPT_DIR/github-repo-inventory-enrich.jq}"

OUT_DIR="${GITHUB_REPO_AUDIT_OUT:-./github-repo-audit}"
mkdir -p "$OUT_DIR"

if [[ -n "${OWNER:-}" ]]; then
  owner="$OWNER"
else
  owner="$(gh api user --jq '.login')"
fi

limit="${LIMIT:-9999}"

echo "Listing repos for: $owner (limit=$limit)" >&2

repo_args=(repo list "$owner" -L "$limit" --visibility all)
[[ -z "${INCLUDE_FORKS:-}" ]] && repo_args+=(--source)

fields=(
  name nameWithOwner url description homepageUrl
  isArchived isFork isPrivate isTemplate isInOrganization
  visibility stargazerCount forkCount watchers
  createdAt pushedAt updatedAt
  repositoryTopics primaryLanguage languages licenseInfo
  diskUsage viewerCanAdminister
)

IFS=','
joined_fields="${fields[*]}"
unset IFS

json_raw="$("${repo_args[@]}" --json "$joined_fields")"

ts="$(date -u +"%Y%m%dT%H%MZ")"
base="$OUT_DIR/repos-${owner}-${ts}"

echo "$json_raw" | jq '.' >"${base}.json"

echo "$json_raw" | jq --from-file "$ENRICH_JQ" >"${base}-enriched.json"

{
  printf '%s\n' 'nameWithOwner,url,audit_score_triage,audit_days_since_push,isArchived,isFork,isPrivate,pushedAt,stargazerCount,audit_primary_language,audit_topics_flat,license_spdxId,description'
  jq -r '.[] |
    [
      (.nameWithOwner // ""),
      (.url // ""),
      (.audit_score_triage | tostring),
      (if (.audit_days_since_push | type) == "number"
        then (.audit_days_since_push | tostring) else "" end),
      (.isArchived // false | tostring),
      (.isFork // false | tostring),
      (.isPrivate // false | tostring),
      (.pushedAt // ""),
      (.stargazerCount // 0 | tostring),
      (.audit_primary_language // ""),
      (.audit_topic_names | map(. // "") | join("; ")),
      (.licenseInfo // null | .spdxId // ""),
      (.description // "" | gsub("\n"; " ") | gsub("\r"; ""))
    ] | @csv' "${base}-enriched.json"
} >"${base}-triage.csv"

echo >&2 "Wrote:
  ${base}.json  (raw API shape)
  ${base}-enriched.json  (+ audit_* fields — tune scoring in \"$ENRICH_JQ\")
  ${base}-triage.csv  (open in a sheet; sort by audit_score_triage descending)"
