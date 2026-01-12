#!/usr/bin/env bash
#
# Claude Worker - Headless Claude Code Runner
#
# Runs Claude Code in non-interactive mode to work on a GitHub issue.
# Designed to be called from GitHub Actions or other CI systems.
#
# Usage:
#   ./scripts/claude-worker.sh <issue-number> [options]
#
# Options:
#   --dry-run       Print prompt without running Claude
#   --branch NAME   Override branch name
#   --no-commit     Don't commit changes
#   --no-pr         Don't create PR
#   --timeout MINS  Set timeout in minutes (default: 30)
#
# Environment Variables:
#   ANTHROPIC_API_KEY  Required for Claude API access
#   GITHUB_TOKEN       Required for gh CLI operations
#   REPO_OWNER         Repository owner (auto-detected if not set)
#   REPO_NAME          Repository name (auto-detected if not set)
#
# Exit Codes:
#   0 - Success
#   1 - Invalid arguments
#   2 - Missing dependencies
#   3 - GitHub API error
#   4 - Claude execution error
#   5 - Git operation error
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
ISSUE_NUMBER=""
DRY_RUN=false
BRANCH_NAME=""
DO_COMMIT=true
DO_PR=true
TIMEOUT_MINS=30

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Print usage
usage() {
    cat << EOF
Usage: $0 <issue-number> [options]

Runs Claude Code to work on a GitHub issue.

Options:
  --dry-run       Print prompt without running Claude
  --branch NAME   Override branch name
  --no-commit     Don't commit changes
  --no-pr         Don't create PR
  --timeout MINS  Set timeout in minutes (default: 30)
  -h, --help      Show this help message

Environment Variables:
  ANTHROPIC_API_KEY  Required for Claude API access
  GITHUB_TOKEN       Required for gh CLI operations

Examples:
  $0 42                    # Work on issue #42
  $0 42 --dry-run          # Preview prompt for issue #42
  $0 42 --branch fix-auth  # Use custom branch name
EOF
}

# Parse command line arguments
parse_args() {
    if [[ $# -lt 1 ]]; then
        log_error "Issue number required"
        usage
        exit 1
    fi

    # First argument should be issue number
    if [[ "$1" =~ ^[0-9]+$ ]]; then
        ISSUE_NUMBER="$1"
        shift
    else
        log_error "First argument must be an issue number"
        usage
        exit 1
    fi

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --branch)
                BRANCH_NAME="$2"
                shift 2
                ;;
            --no-commit)
                DO_COMMIT=false
                shift
                ;;
            --no-pr)
                DO_PR=false
                shift
                ;;
            --timeout)
                TIMEOUT_MINS="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Check required dependencies
check_dependencies() {
    local missing=()

    if ! command -v gh &> /dev/null; then
        missing+=("gh (GitHub CLI)")
    fi

    if ! command -v git &> /dev/null; then
        missing+=("git")
    fi

    if ! command -v claude &> /dev/null; then
        missing+=("claude (Claude Code CLI)")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies:"
        for dep in "${missing[@]}"; do
            echo "  - $dep"
        done
        exit 2
    fi

    # Check authentication
    if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
        log_warn "ANTHROPIC_API_KEY not set - Claude may prompt for auth"
    fi

    if ! gh auth status &> /dev/null; then
        log_error "GitHub CLI not authenticated. Run: gh auth login"
        exit 2
    fi

    log_success "All dependencies available"
}

# Fetch issue details from GitHub
fetch_issue() {
    log_info "Fetching issue #${ISSUE_NUMBER}..."

    ISSUE_JSON=$(gh issue view "$ISSUE_NUMBER" --json number,title,body,labels,state)

    if [[ -z "$ISSUE_JSON" ]]; then
        log_error "Failed to fetch issue #${ISSUE_NUMBER}"
        exit 3
    fi

    ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r '.title')
    ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r '.body')
    ISSUE_STATE=$(echo "$ISSUE_JSON" | jq -r '.state')

    if [[ "$ISSUE_STATE" != "OPEN" ]]; then
        log_warn "Issue #${ISSUE_NUMBER} is ${ISSUE_STATE}, not OPEN"
    fi

    log_success "Fetched: $ISSUE_TITLE"
}

# Generate branch name from issue
generate_branch_name() {
    if [[ -n "$BRANCH_NAME" ]]; then
        return
    fi

    # Try to extract feature ID from title
    FEATURE_ID=$(echo "$ISSUE_TITLE" | grep -oE '\[([A-Z]+-[0-9]+)\]' | tr -d '[]' || true)

    if [[ -n "$FEATURE_ID" ]]; then
        BRANCH_NAME="claude-worker/${FEATURE_ID,,}"  # lowercase
    else
        BRANCH_NAME="claude-worker/issue-${ISSUE_NUMBER}"
    fi

    log_info "Using branch: $BRANCH_NAME"
}

# Create and checkout branch
setup_branch() {
    log_info "Setting up branch..."

    # Ensure we're on main/master and up to date
    DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@') || {
        log_error "Failed to determine default branch"
        exit 5
    }

    if ! git fetch origin "$DEFAULT_BRANCH"; then
        log_error "Failed to fetch from origin"
        exit 5
    fi

    if ! git checkout "$DEFAULT_BRANCH"; then
        log_error "Failed to checkout $DEFAULT_BRANCH"
        exit 5
    fi

    git pull origin "$DEFAULT_BRANCH" || {
        log_error "Failed to pull latest changes"
        exit 5
    }

    # Create new branch
    if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
        log_warn "Branch $BRANCH_NAME already exists, checking out"
        git checkout "$BRANCH_NAME" || exit 5
    else
        git checkout -b "$BRANCH_NAME" || exit 5
    fi

    # Configure git user if not set
    if [[ -z "$(git config user.email)" ]]; then
        git config user.email "claude-worker@github.actions"
        git config user.name "Claude Worker"
    fi

    log_success "Branch ready: $BRANCH_NAME"
}

# Generate prompt for Claude
generate_prompt() {
    cat << EOF
# Task: ${ISSUE_TITLE}

**Issue:** #${ISSUE_NUMBER}
**Branch:** \`${BRANCH_NAME}\`

## Issue Description

${ISSUE_BODY}

## Instructions

You are a Claude Worker processing GitHub issue #${ISSUE_NUMBER}.

1. **Analyze** the issue description and acceptance criteria
2. **Implement** the required changes
3. **Write tests** for new functionality
4. **Verify** all tests pass before finishing

## Constraints

- Focus ONLY on this issue - do not modify unrelated files
- Do NOT modify feature_list.json or orchestrator state files
- Keep changes minimal and focused
- Follow existing code patterns and conventions

## When Complete

Summarize what you implemented and any notes for reviewers.

Remember: Your commit message must include "Fixes #${ISSUE_NUMBER}" to link to this issue.
EOF
}

# Run Claude Code
run_claude() {
    local prompt
    prompt=$(generate_prompt)

    if [[ "$DRY_RUN" == true ]]; then
        log_info "DRY RUN - Would send this prompt to Claude:"
        echo "---"
        echo "$prompt"
        echo "---"
        return
    fi

    log_info "Running Claude Code (timeout: ${TIMEOUT_MINS}m)..."

    # Create temp file for prompt
    PROMPT_FILE=$(mktemp)
    echo "$prompt" > "$PROMPT_FILE"

    # Run Claude with timeout
    if timeout "${TIMEOUT_MINS}m" claude --print < "$PROMPT_FILE" 2>&1 | tee claude-output.log; then
        log_success "Claude completed successfully"
    else
        EXIT_CODE=$?
        if [[ $EXIT_CODE -eq 124 ]]; then
            log_error "Claude timed out after ${TIMEOUT_MINS} minutes"
        else
            log_error "Claude exited with code $EXIT_CODE"
        fi
        rm -f "$PROMPT_FILE"
        exit 4
    fi

    rm -f "$PROMPT_FILE"
}

# Check for changes and commit
commit_changes() {
    if [[ "$DO_COMMIT" != true ]]; then
        log_info "Skipping commit (--no-commit)"
        return
    fi

    # Check if there are any changes
    if git diff --quiet && git diff --cached --quiet; then
        log_warn "No changes to commit"
        return 1
    fi

    log_info "Committing changes..."

    git add -A

    # Generate commit message
    COMMIT_MSG="feat: ${ISSUE_TITLE}

Implements the changes requested in issue #${ISSUE_NUMBER}.

Fixes #${ISSUE_NUMBER}

Co-Authored-By: Claude <noreply@anthropic.com>"

    git commit -m "$COMMIT_MSG"

    log_success "Changes committed"
    return 0
}

# Push branch and create PR
create_pr() {
    if [[ "$DO_PR" != true ]]; then
        log_info "Skipping PR creation (--no-pr)"
        return
    fi

    log_info "Pushing branch..."
    git push -u origin "$BRANCH_NAME"

    log_info "Creating pull request..."

    PR_BODY="## Summary

Implements #${ISSUE_NUMBER}: ${ISSUE_TITLE}

## Changes

See commit history for details.

## Test Plan

- [ ] Tests pass
- [ ] Build succeeds
- [ ] Manual verification

---

*Automated by Claude Worker*

Fixes #${ISSUE_NUMBER}"

    local pr_output
    local pr_exit_code

    pr_output=$(gh pr create \
        --title "feat: ${ISSUE_TITLE}" \
        --body "$PR_BODY" \
        --base "$(git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@')" \
        --head "$BRANCH_NAME" 2>&1)
    pr_exit_code=$?

    if [[ $pr_exit_code -ne 0 ]]; then
        log_error "Failed to create PR: $pr_output"
        exit 1
    fi

    PR_URL="$pr_output"
    log_success "PR created: $PR_URL"

    # Comment on the issue
    gh issue comment "$ISSUE_NUMBER" --body "Claude Worker has created PR ${PR_URL} for this issue."
}

# Main execution
main() {
    parse_args "$@"

    log_info "Claude Worker starting for issue #${ISSUE_NUMBER}"

    check_dependencies
    fetch_issue
    generate_branch_name

    if [[ "$DRY_RUN" == true ]]; then
        generate_prompt
        exit 0
    fi

    setup_branch
    run_claude

    if commit_changes; then
        create_pr
    fi

    log_success "Claude Worker completed for issue #${ISSUE_NUMBER}"
}

main "$@"
