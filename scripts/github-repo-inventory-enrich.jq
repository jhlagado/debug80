# Input: gh repo list --json [...] raw array (one invocation per stdin)
map(
  ([ .repositoryTopics[]? | .name ] | map(ascii_downcase)) as $topics
  | (
      try
        (.pushedAt // "" | sub("\\.[0-9]+Z?$"; "Z") | fromdateiso8601) as $pusht
        | ((((now | floor) - ($pusht | floor)) / 86400 | floor))
      catch
        null
    ) as $days
  | (
      (($topics | index("lifecycle:active") != null) | if . then 2 else 0 end)
      + (($topics | index("maturity:maintained") != null) | if . then 2 else 0 end)
      + (($topics | index("priority:must-keep") != null) | if . then 3 else 0 end)
      - (($topics | index("lifecycle:experiment") != null) | if . then 1 else 0 end)
      - (($topics | index("priority:candidate-delete") != null) | if . then 3 else 0 end)
      + (if ($days != null and ($days | type) == "number") then
          if $days <= 180 then 2 elif $days <= 365 then 0 else -2 end
        else
          0
        end)
      + ((.description // "") | length
          | if . >= 120 then 1 elif . >= 40 then 0 elif . >= 10 then -1 else -3 end)
      + (if (.isArchived // false) then -6 else 0 end)
      + (if (.isFork // false) then -2 else 0 end)
      + (if (.licenseInfo != null and ((.licenseInfo.spdxId // "") != "")) then 2 else -1 end)
      + ((.primaryLanguage // null | (.name // "") | ascii_downcase) as $pl
          | if $pl == "jupyter notebook" then 0 elif $pl != "" then 1 else -1 end)
    ) as $score
  |
  . + {
    audit_topic_names: (.repositoryTopics | map(.name)),
    audit_days_since_push: $days,
    audit_score_triage: $score,
    audit_primary_language: (.primaryLanguage // null | .name // "")
  }
)
