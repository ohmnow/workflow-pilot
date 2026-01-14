#!/bin/bash

# Read JSON input from stdin
input=$(cat)

# 0. Claude Hero status (read from status file)
hero_status=""
if [ -f /tmp/claude-hero-status.json ]; then
  hero_short=$(jq -r '.shortStatus // ""' /tmp/claude-hero-status.json 2>/dev/null)
  if [ -n "$hero_short" ] && [ "$hero_short" != "null" ]; then
    hero_status="[Claude Hero $hero_short]"
  fi
fi

# 1. Model name
model_name=$(echo "$input" | jq -r '.model.display_name // "Claude"')

# 2. Context window usage percentage and token count
usage=$(echo "$input" | jq '.context_window.current_usage')
if [ "$usage" != "null" ]; then
  current=$(echo "$usage" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
  size=$(echo "$input" | jq '.context_window.context_window_size')
  pct=$((current * 100 / size))
  # Format as Xk (divide by 1000)
  current_k=$((current / 1000))
  size_k=$((size / 1000))
  ctx_display="${pct}% (${current_k}k/${size_k}k)"
else
  ctx_display="0%"
fi

# 3. Git branch with dirty indicator
git_info=""
if git rev-parse --git-dir > /dev/null 2>&1; then
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    git_info="${branch}*"
  else
    git_info="${branch}"
  fi
else
  git_info="-"
fi

# 4. Current directory
current_dir=$(basename "$(pwd)")

# 5. Time
current_time=$(date +%H:%M:%S)

# 6. Username
username=$(whoami)

# Output all components in order
if [ -n "$hero_status" ]; then
  printf "%s %s | %s | %s | %s | %s | %s" "$hero_status" "$model_name" "$ctx_display" "$git_info" "$current_dir" "$current_time" "$username"
else
  printf "%s | %s | %s | %s | %s | %s" "$model_name" "$ctx_display" "$git_info" "$current_dir" "$current_time" "$username"
fi
