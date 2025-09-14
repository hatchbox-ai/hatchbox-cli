#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to show usage
usage() {
    echo -e "${BLUE}Usage: $0 [options] <branch-name-or-issue-number>${NC}"
    echo -e "${BLUE}Examples:${NC}"
    echo -e "${BLUE}  $0 25                     ${NC}# Merge issue #25 branch"
    echo -e "${BLUE}  $0 --pr 148               ${NC}# Handle PR #148 (push if open, cleanup if closed)"
    echo -e "${BLUE}  $0 feat/issue-25-fix      ${NC}# Merge specific branch"
    echo -e "${BLUE}  $0 25 --force             ${NC}# Skip confirmations"
    echo -e "${BLUE}  $0 25 --dry-run           ${NC}# Preview actions"
    echo ""
    echo -e "${YELLOW}For Issues - This script will:${NC}"
    echo "  1. Navigate to the worktree for the branch"
    echo "  2. Check for uncommitted changes and auto-commit"
    echo "  3. Handle migration conflicts by removing branch-specific migrations"
    echo "  4. Rebase the branch on local main"
    echo "  5. Fast-forward merge into main (fails if not possible)"
    echo "  6. Regenerate migrations if schema changes are needed"
    echo "  7. Apply pending migrations to the development database"
    echo "  8. Clean up the worktree and branch"
    echo ""
    echo -e "${YELLOW}For PRs - This script will:${NC}"
    echo "  1. Check PR status on GitHub"
    echo "  2. If PR is closed/merged: Clean up worktree and branch"
    echo "  3. If PR is open: Push changes to remote and clean up locally"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  -f, --force     Skip confirmation prompts"
    echo "  -n, --dry-run   Preview actions without executing"
    echo "  --pr <number>   Handle as Pull Request instead of issue"
    echo "  -h, --help      Show this help"
    exit 1
}

# Parse arguments
FORCE=false
DRY_RUN=false
IS_PR=false
PR_NUMBER=""
INPUT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE=true
            shift
            ;;
        -n|--dry-run)
            DRY_RUN=true
            shift
            ;;
        --pr)
            IS_PR=true
            if [[ -n "$2" && "$2" != -* ]]; then
                PR_NUMBER="$2"
                INPUT="$2"
                shift 2
            else
                echo -e "${RED}❌ Error: --pr requires a PR number${NC}"
                usage
            fi
            ;;
        -h|--help)
            usage
            ;;
        -*)
            echo -e "${RED}❌ Error: Unknown option $1${NC}"
            usage
            ;;
        *)
            INPUT="$1"
            shift
            ;;
    esac
done

# Check if input is provided
if [ -z "$INPUT" ]; then
    echo -e "${RED}❌ Error: Branch name or issue number is required${NC}"
    usage
fi

CURRENT_DIR="$(pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
IS_ISSUE=false
ISSUE_NUMBER=""
BRANCH_NAME=""
WORKTREE_PATH=""

# Check if we're in a git repository
if [ -z "$REPO_ROOT" ]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Load environment variables from .env file
if [ -f "${REPO_ROOT}/.env" ]; then
    export $(grep -v '^#' "${REPO_ROOT}/.env" | grep -v '^$' | xargs)
fi

# Source the Neon utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils/neon-utils.sh"

# Function to check if GitHub CLI is available
check_gh_cli() {
    if ! command -v gh >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Warning: GitHub CLI (gh) not found. Issue features disabled.${NC}"
        return 1
    fi
    return 0
}

# Function to extract issue number from branch name
extract_issue_from_branch() {
    local branch="$1"
    if [[ "$branch" =~ issue-([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo ""
    fi
}

# Function to generate commit message and commit changes
generate_and_commit() {
    local issue_number="$1"  # Optional - only passed for issues
    
    if check_claude_cli; then
        echo -e "${BLUE}🤖 Generating commit message using Claude...${NC}"
        
        if git diff --staged --quiet; then
            echo -e "${YELLOW}⚠️  No staged changes found${NC}"
            return 0
        fi
        
        COMMIT_PROMPT="You are a software engineer writing a commit message. Please examine the uncommitted changes in this repository and generate a concise commit message. Do not say things like 'Looking at the unchanged files...'. Use imperative mood (e.g., 'Add feature' not 'Added feature'). Be specific about what was changed. Your output is being used directly as the commit message."
        
        if [ -n "$issue_number" ]; then
            COMMIT_PROMPT="${COMMIT_PROMPT} Include 'Fixes #${issue_number}' at the end if this appears to resolve the issue."
        fi
        
        COMMIT_PROMPT="${COMMIT_PROMPT} Only output the commit message, nothing else."
        
        GENERATED_MSG=$(claude "$COMMIT_PROMPT" 2>/dev/null | tr -d '\n' | tr -d '\r')
        
        if [ -n "$GENERATED_MSG" ] && [[ ! "$GENERATED_MSG" =~ (error|Error|API|prompt.*too.*long) ]]; then
            echo -e "${GREEN}📄 Generated commit message: ${GENERATED_MSG}${NC}"
            
            # Allow user to edit the commit message
            echo -e "${BLUE}💬 Opening editor to review/edit commit message...${NC}"
            git commit -e -m "$GENERATED_MSG" || {
                echo -e "${RED}❌ Error: Commit failed or was aborted${NC}"
                exit 1
            }
        else
            echo -e "${YELLOW}⚠️  Claude failed to generate commit message, using manual commit${NC}"
            git commit || {
                echo -e "${RED}❌ Error: Commit failed or was aborted${NC}"
                exit 1
            }
        fi
    else
        echo -e "${BLUE}💬 Opening editor for commit message...${NC}"
        git commit || {
            echo -e "${RED}❌ Error: Commit failed or was aborted${NC}"
            exit 1
        }
    fi
}

# Source the worktree utility function
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils/find-worktree-for-branch.sh"

# Function to clean up worktree and branch
cleanup_worktree() {
    local branch_name="$1"
    local input_ref="${2:-$1}"  # Use branch_name if input_ref not provided
    local is_pr_context="${3:-false}"
    
    echo -e "${BLUE}🧹 Cleaning up worktree and branch...${NC}"
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would run: ./scripts/cleanup-worktree.sh ${input_ref}${NC}"
        return 0
    fi
    
    # Ensure we're back in the repo root for cleanup
    cd "$REPO_ROOT" || {
        echo -e "${RED}❌ Error: Failed to navigate to repository root for cleanup${NC}"
        exit 1
    }
    
    # Check if cleanup script exists
    CLEANUP_SCRIPT="./scripts/cleanup-worktree.sh"
    if [ ! -f "$CLEANUP_SCRIPT" ]; then
        if [ "$is_pr_context" = true ]; then
            echo -e "${YELLOW}⚠️  Cleanup script not found, manual cleanup needed${NC}"
            echo -e "${YELLOW}💡 You may need to clean up manually:${NC}"
            echo -e "${YELLOW}   git worktree remove ${WORKTREE_PATH}${NC}"
            echo -e "${YELLOW}   git branch -D ${branch_name}${NC}"
            return 1
        else
            echo -e "${RED}❌ Error: Cleanup script not found: ${CLEANUP_SCRIPT}${NC}"
            exit 1
        fi
    fi
    
    # Run cleanup script with the same argument we received
    echo -e "${BLUE}🗑️  Running cleanup script...${NC}"
    
    if [ "$FORCE" = true ]; then
        "$CLEANUP_SCRIPT" "$input_ref" --force
    else
        "$CLEANUP_SCRIPT" "$input_ref"
    fi
    
    local cleanup_exit_code=$?
    
    if [ $cleanup_exit_code -eq 0 ]; then
        echo -e "${GREEN}✅ Cleanup completed successfully${NC}"
        return 0
    else
        if [ "$is_pr_context" = true ]; then
            echo -e "${YELLOW}⚠️  Cleanup script failed${NC}"
            echo -e "${YELLOW}💡 You may need to clean up manually:${NC}"
            echo -e "${YELLOW}   git worktree remove ${WORKTREE_PATH}${NC}"
            echo -e "${YELLOW}   git branch -D ${branch_name}${NC}"
            return 1
        else
            echo -e "${YELLOW}⚠️  Warning: Cleanup script failed, but merge was successful${NC}"
            echo -e "${YELLOW}💡 You may need to clean up manually:${NC}"
            echo -e "${YELLOW}   git worktree remove ${WORKTREE_PATH}${NC}"
            echo -e "${YELLOW}   git branch -D ${branch_name}${NC}"
            exit 1
        fi
    fi
}

echo -e "${BLUE}🔄 Starting merge and cleanup workflow...${NC}"

# Handle PR workflow if --pr flag is used
if [ "$IS_PR" = true ]; then
    echo -e "${BLUE}🔍 Processing Pull Request #${PR_NUMBER}...${NC}"
    
    if check_gh_cli; then
        echo -e "${BLUE}📋 Fetching PR status...${NC}"
        
        if ! PR_DETAILS=$(gh pr view "$PR_NUMBER" --json state,headRefName,title 2>/dev/null); then
            echo -e "${RED}❌ Error: Could not fetch PR #${PR_NUMBER}. Check if it exists.${NC}"
            exit 1
        fi
        
        PR_STATE=$(echo "$PR_DETAILS" | jq -r '.state')
        PR_BRANCH=$(echo "$PR_DETAILS" | jq -r '.headRefName')
        PR_TITLE=$(echo "$PR_DETAILS" | jq -r '.title')
        BRANCH_NAME="$PR_BRANCH"
        
        echo -e "${GREEN}📄 PR #${PR_NUMBER}: ${PR_TITLE}${NC}"
        echo -e "${BLUE}🌿 Branch: ${PR_BRANCH}${NC}"
        echo -e "${BLUE}📊 Status: ${PR_STATE}${NC}"
        
        if [ "$PR_STATE" = "CLOSED" ] || [ "$PR_STATE" = "MERGED" ]; then
            echo -e "${YELLOW}🔒 PR is ${PR_STATE} - skipping to cleanup${NC}"
            
            # Skip all merge steps, go straight to cleanup
            if ! cleanup_worktree "$BRANCH_NAME" "$BRANCH_NAME" true; then
                echo -e "${YELLOW}⚠️  Cleanup failed, manual cleanup may be needed${NC}"
            else
                echo -e "${GREEN}✅ Worktree cleanup completed${NC}"
            fi
            
            echo ""
            echo -e "${GREEN}🎉 Closed PR cleanup completed!${NC}"
            echo -e "${BLUE}Summary:${NC}"
            echo -e "${BLUE}  • PR: #${PR_NUMBER} - ${PR_TITLE}${NC}"
            echo -e "${BLUE}  • Status: ${PR_STATE}${NC}"
            echo -e "${BLUE}  • Worktree and branch cleaned up${NC}"
            
            exit 0
        else
            echo -e "${GREEN}🔓 PR is ${PR_STATE} - will push changes and clean up locally${NC}"
            
            # Find worktree for the PR branch
            echo -e "${BLUE}🔍 Looking for worktree for PR branch: ${BRANCH_NAME}${NC}"
            
            WORKTREE_PATH=$(find_worktree_for_branch "$BRANCH_NAME")
            if [ -z "$WORKTREE_PATH" ]; then
                echo -e "${RED}❌ Error: No worktree found for PR branch '${BRANCH_NAME}'${NC}"
                echo -e "${YELLOW}💡 Available worktrees:${NC}"
                git worktree list
                exit 1
            fi
            
            echo -e "${GREEN}📁 Found worktree: ${WORKTREE_PATH}${NC}"
            
            # Navigate to worktree and push changes
            echo -e "${BLUE}📂 Navigating to worktree directory...${NC}"
            cd "$WORKTREE_PATH" || {
                echo -e "${RED}❌ Error: Failed to navigate to worktree directory: ${WORKTREE_PATH}${NC}"
                exit 1
            }
            
            # Check for uncommitted changes and commit them
            UNCOMMITTED_CHANGES=$(git status --porcelain)
            if [ -n "$UNCOMMITTED_CHANGES" ]; then
                echo -e "${YELLOW}⚠️  Found uncommitted changes in PR worktree${NC}"
                git status --short
                echo ""
                
                if [ "$DRY_RUN" = true ]; then
                    echo -e "${BLUE}[DRY RUN] Would commit and push uncommitted changes${NC}"
                else
                    echo -e "${BLUE}📝 Staging and committing changes...${NC}"
                    git add -A
                    
                    # Auto-generate commit message for PR using shared function
                    if ! generate_and_commit; then
                        echo -e "${RED}❌ Error: Failed to create commit${NC}"
                        exit 1
                    fi
                    
                    echo -e "${GREEN}✅ Changes committed${NC}"
                fi
            fi
            
            # Push changes to remote
            if [ "$DRY_RUN" = true ]; then
                echo -e "${BLUE}[DRY RUN] Would push changes to origin/${BRANCH_NAME}${NC}"
            else
                echo -e "${BLUE}⬆️  Pushing changes to remote...${NC}"
                if git push origin "$BRANCH_NAME"; then
                    echo -e "${GREEN}✅ Successfully pushed changes to PR${NC}"
                else
                    echo -e "${RED}❌ Error: Failed to push changes${NC}"
                    exit 1
                fi
            fi
            
            echo ""
            echo -e "${GREEN}🎉 PR changes pushed successfully!${NC}"
            echo -e "${BLUE}Summary:${NC}"
            echo -e "${BLUE}  • PR: #${PR_NUMBER} - ${PR_TITLE}${NC}"
            echo -e "${BLUE}  • Status: ${PR_STATE}${NC}"
            echo -e "${BLUE}  • Changes pushed to remote${NC}"
            echo -e "${BLUE}  • Worktree remains active for continued work${NC}"
            echo ""
            echo -e "${YELLOW}💡 Next steps:${NC}"
            echo "  • Continue working in this worktree as needed"
            echo "  • Check the PR on GitHub to see your updates"
            echo "  • When PR is closed/merged, run again to clean up"
            
            exit 0
        fi
    else
        echo -e "${RED}❌ Error: GitHub CLI required for PR workflow${NC}"
        exit 1
    fi
fi

# Detect if input is an issue number
if [[ "$INPUT" =~ ^#?([0-9]+)$ ]]; then
    ISSUE_NUMBER="${BASH_REMATCH[1]}"
    IS_ISSUE=true
    
    echo -e "${BLUE}🔍 Detected GitHub issue number: #${ISSUE_NUMBER}${NC}"
    
    # Find branch matching this issue
    PATTERN="feat/issue-${ISSUE_NUMBER}-*"
    MATCHING_BRANCHES=$(git branch --format='%(refname:short)' | grep "issue-${ISSUE_NUMBER}-" || true)
    
    if [ -z "$MATCHING_BRANCHES" ]; then
        echo -e "${RED}❌ Error: No branch found for issue #${ISSUE_NUMBER}${NC}"
        echo -e "${YELLOW}Looking for branches matching pattern: ${PATTERN}${NC}"
        exit 1
    fi
    
    # If multiple matches, use the first one
    BRANCH_NAME=$(echo "$MATCHING_BRANCHES" | head -1)
    echo -e "${GREEN}📄 Found branch: ${BRANCH_NAME}${NC}"
else
    # Input is a regular branch name
    BRANCH_NAME="$INPUT"
    
    # Try to extract issue number from branch name
    EXTRACTED_ISSUE=$(extract_issue_from_branch "$BRANCH_NAME")
    if [ -n "$EXTRACTED_ISSUE" ]; then
        ISSUE_NUMBER="$EXTRACTED_ISSUE"
        IS_ISSUE=true
        echo -e "${BLUE}🔍 Extracted issue number from branch: #${ISSUE_NUMBER}${NC}"
    fi
fi

echo -e "${BLUE}Branch: ${BRANCH_NAME}${NC}"
if [ "$IS_ISSUE" = true ]; then
    echo -e "${BLUE}Issue: #${ISSUE_NUMBER}${NC}"
fi

# Find worktree path for the branch
echo -e "${BLUE}🔍 Looking for worktree for branch: ${BRANCH_NAME}${NC}"

WORKTREE_PATH=$(find_worktree_for_branch "$BRANCH_NAME")
if [ -z "$WORKTREE_PATH" ]; then
    echo -e "${RED}❌ Error: No worktree found for branch '${BRANCH_NAME}'${NC}"
    echo -e "${YELLOW}💡 Available worktrees:${NC}"
    git worktree list
    exit 1
fi

echo -e "${GREEN}📁 Found worktree: ${WORKTREE_PATH}${NC}"

# Navigate to worktree directory
echo -e "${BLUE}📂 Navigating to worktree directory...${NC}"
cd "$WORKTREE_PATH" || {
    echo -e "${RED}❌ Error: Failed to navigate to worktree directory: ${WORKTREE_PATH}${NC}"
    exit 1
}

echo -e "${GREEN}✅ Now in worktree: $(pwd)${NC}"

# Verify we're on the correct branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    echo -e "${YELLOW}⚠️  Currently on branch: ${CURRENT_BRANCH}, switching to: ${BRANCH_NAME}${NC}"
    git checkout "$BRANCH_NAME" || {
        echo -e "${RED}❌ Error: Failed to checkout branch: ${BRANCH_NAME}${NC}"
        exit 1
    }
fi

# Check if we're trying to merge main into itself
if [ "$BRANCH_NAME" = "main" ]; then
    echo -e "${RED}❌ Error: Cannot merge main branch into itself${NC}"
    exit 1
fi

# Run typecheck and build before starting merge process
echo -e "${BLUE}🔍 Running typecheck and build before merge...${NC}"

if command -v pnpm >/dev/null 2>&1; then
    # Run typecheck first
    echo -e "${BLUE}📋 Running typecheck...${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would run: pnpm typecheck${NC}"
    else
        pnpm typecheck || {
            echo -e "${RED}❌ Error: Typecheck failed.${NC}"
            
            # Launch Claude to help fix typecheck errors
            if check_claude_cli; then
                echo -e "${BLUE}🤖 Launching Claude to help fix typecheck errors...${NC}"
                claude "There are TypeScript errors in this codebase. Please analyze the typecheck output, identify all type errors, and fix them. Run 'pnpm typecheck' to see the errors, then make the necessary code changes to resolve all type issues."
                
                # Verify typecheck passes after Claude's help
                echo -e "${BLUE}🔍 Re-running typecheck after Claude's fixes...${NC}"
                pnpm typecheck || {
                    echo -e "${RED}❌ Error: Typecheck still failing after Claude's attempt. Please review and fix manually.${NC}"
                    exit 1
                }
                echo -e "${GREEN}✅ Typecheck now passes after Claude's fixes${NC}"
            else
                echo -e "${RED}Fix type errors before merging.${NC}"
                exit 1
            fi
        }
        echo -e "${GREEN}✅ Typecheck passed${NC}"
    fi

    # Run lint
    echo -e "${BLUE}🏗️  Running lint...${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would run: pnpm lint${NC}"
    else
        pnpm lint || {
            echo -e "${RED}❌ Error: Linting failed.${NC}"
            
            # Launch Claude to help fix linting errors
            if check_claude_cli; then
                echo -e "${BLUE}🤖 Launching Claude to help fix linting errors...${NC}"
                claude "There are ESLint errors in this codebase. Please analyze the linting output, identify all linting issues, and fix them. Run 'pnpm lint' to see the errors, then make the necessary code changes to resolve all linting issues. Focus on code quality, consistency, and following the project's linting rules."
                
                # Verify lint passes after Claude's help
                echo -e "${BLUE}🔍 Re-running lint after Claude's fixes...${NC}"
                pnpm lint || {
                    echo -e "${RED}❌ Error: Linting still failing after Claude's attempt. Please review and fix manually.${NC}"
                    exit 1
                }
                echo -e "${GREEN}✅ Linting now passes after Claude's fixes${NC}"
            else
                echo -e "${RED}Fix linting errors before merging.${NC}"
                exit 1
            fi
        }
        echo -e "${GREEN}✅ Linting completed successfully${NC}"
    fi
    
    # Run tests
    echo -e "${BLUE}🧪 Running tests...${NC}"
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would run: pnpm vitest run${NC}"
    else
        # Run tests with minimal output (only show failures)
        TEST_OUTPUT=$(pnpm vitest run 2>&1)
        TEST_EXIT_CODE=$?
        
        if [ $TEST_EXIT_CODE -eq 0 ]; then
            echo -e "${GREEN}✅ All tests passed${NC}"
        else
            echo -e "${RED}❌ Error: Tests failed${NC}"
            # Show only the failure summary and error details
            echo "$TEST_OUTPUT" | grep -A 10 -E "(FAIL|Failed Tests|AssertionError)" | head -50
            
            # Launch Claude to help fix test failures
            if check_claude_cli; then
                echo -e "${BLUE}🤖 Launching Claude to help fix test failures...${NC}"
                claude "There are unit test failures in this codebase. Please analyze the test output to understand what's failing, then fix the issues. This might involve updating test code, fixing bugs in the source code, or updating tests to match new behavior. Run 'pnpm vitest run' to see the detailed test failures, then make the necessary changes to get all tests passing."
                
                # Verify tests pass after Claude's help
                echo -e "${BLUE}🔍 Re-running tests after Claude's fixes...${NC}"
                TEST_RERUN_OUTPUT=$(pnpm vitest run 2>&1)
                TEST_RERUN_EXIT_CODE=$?
                
                if [ $TEST_RERUN_EXIT_CODE -eq 0 ]; then
                    echo -e "${GREEN}✅ All tests now pass after Claude's fixes${NC}"
                else
                    echo -e "${RED}❌ Error: Tests still failing after Claude's attempt.${NC}"
                    echo "$TEST_RERUN_OUTPUT" | grep -A 10 -E "(FAIL|Failed Tests|AssertionError)" | head -50
                    echo -e "${RED}Please review and fix manually.${NC}"
                    exit 1
                fi
            else
                exit 1
            fi
        fi
    fi
else
    echo -e "${YELLOW}⚠️  pnpm not found, skipping typecheck, build, and tests${NC}"
fi

echo ""

# Function to check if Claude CLI is available
check_claude_cli() {
    if ! command -v claude >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Warning: Claude CLI not found. Auto-commit disabled.${NC}"
        return 1
    fi
    return 0
}

# Function to extract branch ID from DATABASE_URL
extract_branch_from_url() {
    local url="$1"
    
    # Neon URLs typically look like:
    # postgresql://user:pass@ep-branch-name-123456.us-east-2.aws.neon.tech/dbname
    # or with pooler:
    # postgresql://user:pass@ep-branch-name-123456-pooler.us-east-2.aws.neon.tech/dbname
    
    # Extract the endpoint ID (including -pooler if present)
    if [[ "$url" =~ @(ep-[a-z0-9-]+)(-pooler)?\..*\.neon\.tech ]]; then
        local endpoint_id="${BASH_REMATCH[1]}"
        if [ -n "${BASH_REMATCH[2]}" ]; then
            endpoint_id="${endpoint_id}${BASH_REMATCH[2]}"
        fi
        echo "$endpoint_id"
        return 0
    else
        return 1
    fi
}

# Function to check if branch is protected (main/production)
is_protected_branch() {
    local branch_name="$1"
    
    case "$branch_name" in
        "main"|"production")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to verify database safety before migration removal
check_database_safety() {
    echo -e "${BLUE}🔍 Checking database safety before removing migrations...${NC}"
    
    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        echo -e "${YELLOW}⚠️  DATABASE_URL not set, skipping database safety check${NC}"
        return 0
    fi
    
    # Check if Neon CLI is available
    if ! check_neon_cli; then
        echo -e "${YELLOW}⚠️  Skipping database safety check (Neon CLI not available)${NC}"
        return 0
    fi
    
    # Extract endpoint ID from DATABASE_URL
    local endpoint_id=$(extract_branch_from_url "$DATABASE_URL")
    if [ -z "$endpoint_id" ]; then
        echo -e "${YELLOW}⚠️  Could not extract endpoint from DATABASE_URL, skipping safety check${NC}"
        return 0
    fi
    
    # Get branch name from Neon
    local db_branch_name=$(get_neon_branch_name "$endpoint_id")
    if [ -z "$db_branch_name" ]; then
        echo -e "${YELLOW}⚠️  Could not determine database branch, skipping safety check${NC}"
        return 0
    fi
    
    # Check if database branch is protected
    if is_protected_branch "$db_branch_name"; then
        echo -e "${RED}❌ SAFETY CHECK FAILED: Connected to protected database branch '${db_branch_name}'${NC}"
        echo -e "${RED}⚠️  Cannot remove migrations when connected to ${db_branch_name} database${NC}"
        echo -e "${YELLOW}💡 This prevents accidental migration removal from shared databases${NC}"
        echo -e "${YELLOW}💡 Switch to a feature branch database before running this script${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Database safety check passed: Connected to feature branch '${db_branch_name}'${NC}"
        return 0
    fi
}

# Check for uncommitted changes
echo -e "${BLUE}📋 Checking for uncommitted changes...${NC}"

UNCOMMITTED_CHANGES=$(git status --porcelain)
if [ -n "$UNCOMMITTED_CHANGES" ]; then
    echo -e "${YELLOW}⚠️  Found uncommitted changes:${NC}"
    git status --short
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would commit uncommitted changes${NC}"
    else
        # Stage all changes
        echo -e "${BLUE}📝 Staging all changes...${NC}"
        git add -A
        
        # Auto-generate commit message using shared function
        if [ "$IS_ISSUE" = true ]; then
            if ! generate_and_commit "$ISSUE_NUMBER"; then
                echo -e "${RED}❌ Error: Failed to create commit${NC}"
                exit 1
            fi
        else
            if ! generate_and_commit; then
                echo -e "${RED}❌ Error: Failed to create commit${NC}"
                exit 1
            fi
        fi
        
        echo -e "${GREEN}✅ Changes committed successfully${NC}"
    fi
else
    echo -e "${GREEN}✅ No uncommitted changes found${NC}"
fi

# Function to detect and handle migration conflicts
handle_migration_conflicts() {
    echo -e "${BLUE}🔍 Checking for potential migration conflicts...${NC}"
    
    # Get the merge base to understand when this branch diverged
    MERGE_BASE=$(git merge-base main HEAD 2>/dev/null || echo "")
    
    if [ -z "$MERGE_BASE" ]; then
        echo -e "${YELLOW}⚠️  Warning: Could not determine branch point, skipping migration conflict detection${NC}"
        return 0
    fi
    
    # Find migrations created since branch diverged from main
    BRANCH_MIGRATIONS=$(git diff --name-only --diff-filter=A "$MERGE_BASE"..HEAD -- src/migrations/*.ts src/migrations/*.json 2>/dev/null | sort | uniq || true)
    
    if [ -z "$BRANCH_MIGRATIONS" ]; then
        echo -e "${GREEN}✅ No branch-specific migrations found${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}📋 Branch-specific migrations detected:${NC}"
    echo "$BRANCH_MIGRATIONS" | while read -r migration_file; do
        if [ -n "$migration_file" ]; then
            echo -e "${YELLOW}   • $migration_file${NC}"
        fi
    done
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would remove branch-specific migration pairs for conflict resolution${NC}"
        echo -e "${BLUE}[DRY RUN] After merge, would regenerate migrations as needed${NC}"
        return 0
    fi
    
    # Store branch-specific migration pairs for potential recreation
    MIGRATION_PAIRS=()
    while IFS= read -r migration_file; do
        if [ -n "$migration_file" ] && [[ "$migration_file" == *.ts ]]; then
            # Extract the timestamp base (e.g., "20250905_174706" from "20250905_174706.ts")
            MIGRATION_BASE=$(basename "$migration_file" .ts)
            
            # Check if both .ts and .json files exist
            TS_FILE="src/migrations/${MIGRATION_BASE}.ts"
            JSON_FILE="src/migrations/${MIGRATION_BASE}.json"
            
            if [ -f "$TS_FILE" ] && [ -f "$JSON_FILE" ]; then
                MIGRATION_PAIRS+=("$MIGRATION_BASE")
                echo -e "${BLUE}📝 Found migration pair: ${MIGRATION_BASE}${NC}"
            fi
        fi
    done <<< "$BRANCH_MIGRATIONS"
    
    if [ ${#MIGRATION_PAIRS[@]} -eq 0 ]; then
        echo -e "${GREEN}✅ No complete migration pairs found to remove${NC}"
        return 0
    fi
    
    # Perform database safety check before removing migrations
    if ! check_database_safety; then
        echo -e "${RED}❌ Aborting migration removal due to safety check failure${NC}"
        exit 1
    fi
    
    # Ask for confirmation unless in force mode
    if [ "$FORCE" != true ]; then
        echo -e "${YELLOW}⚠️  To resolve potential migration conflicts, we need to remove these migration pairs:${NC}"
        for pair in "${MIGRATION_PAIRS[@]}"; do
            echo -e "${YELLOW}   • ${pair}.ts and ${pair}.json${NC}"
        done
        echo ""
        echo -e "${BLUE}These migrations will be regenerated automatically after the merge if needed.${NC}"
        read -p "Remove branch-specific migrations to prevent conflicts? [Y/n]: " -r
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo -e "${YELLOW}🚫 Keeping migrations - merge conflicts may occur${NC}"
            return 0
        fi
    fi
    
    # Remove branch-specific migration pairs
    echo -e "${BLUE}🗑️  Removing branch-specific migration pairs...${NC}"
    for pair in "${MIGRATION_PAIRS[@]}"; do
        TS_FILE="src/migrations/${pair}.ts"
        JSON_FILE="src/migrations/${pair}.json"
        
        echo -e "${BLUE}   Removing: ${pair}.*${NC}"
        git rm "$TS_FILE" "$JSON_FILE" 2>/dev/null || {
            echo -e "${YELLOW}⚠️  Warning: Could not git rm migration files for ${pair}, removing manually${NC}"
            rm -f "$TS_FILE" "$JSON_FILE"
        }
    done
    
    # Clean up migrations/index.ts by reverting to main branch version
    if [ ${#MIGRATION_PAIRS[@]} -gt 0 ]; then
        MIGRATIONS_INDEX_FILE="src/migrations/index.ts"
        if [ -f "$MIGRATIONS_INDEX_FILE" ]; then
            echo -e "${BLUE}📝 Reverting migrations/index.ts to main branch version...${NC}"
            git show main:src/migrations/index.ts > "$MIGRATIONS_INDEX_FILE"
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}   ✅ Successfully reverted migrations/index.ts to main branch state${NC}"
            else
                echo -e "${RED}   ❌ Failed to revert migrations/index.ts${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}⚠️  migrations/index.ts not found, skipping cleanup${NC}"
        fi
    fi
    
    # Commit the migration removal if there are changes to commit
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${BLUE}📝 Committing migration removal...${NC}"
        git add -A
        
        # Generate commit message
        MIGRATION_LIST=""
        for pair in "${MIGRATION_PAIRS[@]}"; do
            MIGRATION_LIST="${MIGRATION_LIST}- ${pair}
"
        done
        
        COMMIT_MSG="Remove branch-specific migrations before merge (${BRANCH_NAME})

Removed migration pairs to prevent conflicts during merge:
${MIGRATION_LIST}These migrations will be regenerated after merge if schema changes are needed."
        
        git commit -m "$COMMIT_MSG" || {
            echo -e "${RED}❌ Error: Failed to commit migration removal${NC}"
            exit 1
        }
        
        echo -e "${GREEN}✅ Branch-specific migrations removed and committed${NC}"
    else
        echo -e "${GREEN}✅ No changes to commit after migration removal${NC}"
    fi
}

# Handle migration conflicts before rebase
echo ""
handle_migration_conflicts

# Rebase on main
echo -e "${BLUE}🔄 Rebasing branch on main...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}[DRY RUN] Would rebase ${BRANCH_NAME} on main${NC}"
    
    # Show what commits would be rebased
    COMMITS_TO_REBASE=$(git log --oneline main..HEAD)
    if [ -n "$COMMITS_TO_REBASE" ]; then
        echo -e "${BLUE}[DRY RUN] Commits to be rebased:${NC}"
        echo "$COMMITS_TO_REBASE"
    else
        echo -e "${BLUE}[DRY RUN] No commits to rebase (already up to date)${NC}"
    fi
else
    # Check if main branch exists
    if ! git show-ref --verify --quiet refs/heads/main; then
        echo -e "${RED}❌ Error: Main branch does not exist${NC}"
        exit 1
    fi
    
    # Check for uncommitted changes before rebase
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${RED}❌ Error: Cannot rebase with uncommitted changes${NC}"
        echo -e "${YELLOW}💡 This should not happen as changes were committed above${NC}"
        exit 1
    fi
    
    # Show what will be rebased
    COMMITS_TO_REBASE=$(git log --oneline main..HEAD)
    if [ -n "$COMMITS_TO_REBASE" ]; then
        echo -e "${BLUE}📝 Commits to be rebased:${NC}"
        echo "$COMMITS_TO_REBASE"
        echo ""
        
        if [ "$FORCE" != true ]; then
            read -p "Continue with rebase? [Y/n]: " -r
            if [[ $REPLY =~ ^[Nn]$ ]]; then
                echo -e "${YELLOW}🚫 Rebase cancelled${NC}"
                exit 1
            fi
        fi
        
        # Perform the rebase
        echo -e "${BLUE}🔄 Rebasing...${NC}"
        git rebase main || {
            echo -e "${RED}❌ Error: Rebase failed${NC}"
            
            # Check if there are conflicts
            CONFLICTED_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
            if [ -n "$CONFLICTED_FILES" ]; then
                echo -e "${YELLOW}⚠️ Merge conflicts detected in:${NC}"
                echo "$CONFLICTED_FILES" | while read -r file; do
                    echo -e "${YELLOW}   • $file${NC}"
                done
                echo ""
                
                # Launch Claude if available
                if check_claude_cli; then
                    echo -e "${BLUE}🤖 Launching Claude to help resolve conflicts...${NC}"
                    
                    # Launch Claude to handle the entire conflict resolution workflow
                    echo -e "${BLUE}🤖 Asking Claude to resolve conflicts and continue rebase...${NC}"
                    claude "Please help resolve the git rebase conflicts in this repository. Analyze the conflicted files, understand the changes from both branches, fix the conflicts, then run 'git add .' to stage the resolved files, and finally run 'git rebase --continue' to continue the rebase process. Handle the entire workflow for me."
                    
                    echo ""
                    echo -e "${BLUE}🔍 Checking if Claude successfully resolved the conflicts...${NC}"
                    
                    # Check if there are still any conflicts
                    REMAINING_CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
                    
                    # Check if we're still in a rebase state
                    REBASE_IN_PROGRESS=false
                    if [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ]; then
                        REBASE_IN_PROGRESS=true
                    fi
                    
                    if [ -n "$REMAINING_CONFLICTS" ]; then
                        echo -e "${RED}❌ Claude was not successful - conflicts still exist in:${NC}"
                        echo "$REMAINING_CONFLICTS" | while read -r file; do
                            echo -e "${RED}   • $file${NC}"
                        done
                        echo -e "${YELLOW}💡 You may need to resolve conflicts manually:${NC}"
                        echo -e "${YELLOW}   1. Fix conflicts in the files${NC}"
                        echo -e "${YELLOW}   2. Stage resolved files: git add <files>${NC}"
                        echo -e "${YELLOW}   3. Continue rebase: git rebase --continue${NC}"
                        echo -e "${YELLOW}   4. Or abort rebase: git rebase --abort${NC}"
                        exit 1
                    elif [ "$REBASE_IN_PROGRESS" = true ]; then
                        echo -e "${YELLOW}⚠️ Claude may have resolved conflicts but rebase is still in progress${NC}"
                        echo -e "${YELLOW}💡 Next steps:${NC}"
                        echo -e "${YELLOW}   1. Check if Claude resolved files: git status${NC}"
                        echo -e "${YELLOW}   2. If files are resolved, stage them: git add <resolved-files>${NC}"
                        echo -e "${YELLOW}   3. Continue the rebase: git rebase --continue${NC}"
                        echo -e "${YELLOW}   4. Or abort if problems persist: git rebase --abort${NC}"
                        echo -e "${YELLOW}   5. Then re-run this script: ${0} ${INPUT}${NC}"
                        exit 1
                    else
                        echo -e "${GREEN}✅ Claude successfully resolved conflicts and completed rebase!${NC}"
                        
                        # Ask user if they want to continue or stop to review Claude's changes
                        if [ "$FORCE" != true ]; then
                            echo ""
                            echo -e "${BLUE}Claude has successfully resolved the conflicts and completed the rebase.${NC}"
                            read -p "Continue with merge process or stop to review Claude's changes? [Continue/stop]: " -r
                            if [[ $REPLY =~ ^[Ss]$ ]] || [[ $REPLY =~ ^[Ss]top$ ]]; then
                                echo -e "${YELLOW}🛑 Stopping to allow review of Claude's conflict resolution${NC}"
                                echo -e "${BLUE}💡 When ready to continue, run: ${0} ${INPUT}${NC}"
                                exit 1
                            fi
                        fi
                        
                        echo -e "${BLUE}Continuing with merge workflow...${NC}"
                    fi
                else
                    echo -e "${YELLOW}💡 You may need to resolve conflicts manually:${NC}"
                    echo -e "${YELLOW}   1. Fix conflicts in the files${NC}"
                    echo -e "${YELLOW}   2. Stage resolved files: git add <files>${NC}"
                    echo -e "${YELLOW}   3. Continue rebase: git rebase --continue${NC}"
                    echo -e "${YELLOW}   4. Or abort rebase: git rebase --abort${NC}"
                    exit 1
                fi
            else
                echo -e "${YELLOW}💡 Rebase failed for non-conflict reasons. Check the error above.${NC}"
                exit 1
            fi
        }
        
        echo -e "${GREEN}✅ Rebase completed successfully${NC}"
    else
        echo -e "${GREEN}✅ Branch is already up to date with main${NC}"
    fi
fi

# Switch to main and merge
echo -e "${BLUE}🔀 Switching to main and merging branch...${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}[DRY RUN] Would switch to main branch${NC}"
    echo -e "${BLUE}[DRY RUN] Would merge ${BRANCH_NAME} with fast-forward only${NC}"
    
    # Check if fast-forward would be possible
    MERGE_BASE=$(git merge-base main HEAD)
    MAIN_HEAD=$(git rev-parse main)
    
    if [ "$MERGE_BASE" = "$MAIN_HEAD" ]; then
        echo -e "${BLUE}[DRY RUN] Fast-forward merge would succeed${NC}"
    else
        echo -e "${YELLOW}[DRY RUN] Fast-forward merge would fail - branch is not ahead of main${NC}"
    fi
else
    # Navigate back to repo root to access main branch
    cd "$REPO_ROOT" || {
        echo -e "${RED}❌ Error: Failed to navigate to repository root${NC}"
        exit 1
    }
    
    # Switch to main branch
    echo -e "${BLUE}📂 Switching to main branch...${NC}"
    git checkout main || {
        echo -e "${RED}❌ Error: Failed to checkout main branch${NC}"
        exit 1
    }
    
    # Verify we're on main
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        echo -e "${RED}❌ Error: Failed to switch to main branch (currently on: ${CURRENT_BRANCH})${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Now on main branch${NC}"
    
    # Show merge preview
    echo -e "${BLUE}📝 Preparing to merge ${BRANCH_NAME} into main...${NC}"
    
    # Check if fast-forward merge is possible
    MERGE_BASE=$(git merge-base main "$BRANCH_NAME")
    MAIN_HEAD=$(git rev-parse main)
    
    if [ "$MERGE_BASE" != "$MAIN_HEAD" ]; then
        echo -e "${RED}❌ Error: Cannot perform fast-forward merge${NC}"
        echo -e "${YELLOW}💡 This usually means:${NC}"
        echo -e "${YELLOW}   • Main branch has moved forward since branch was created${NC}"
        echo -e "${YELLOW}   • Rebase may have failed or was incomplete${NC}"
        echo -e "${YELLOW}   • Try rebasing the branch again on main${NC}"
        exit 1
    fi
    
    # Show what commits will be merged
    COMMITS_TO_MERGE=$(git log --oneline main.."$BRANCH_NAME")
    if [ -n "$COMMITS_TO_MERGE" ]; then
        echo -e "${BLUE}📝 Commits to be merged:${NC}"
        echo "$COMMITS_TO_MERGE"
        echo ""
        
        if [ "$FORCE" != true ]; then
            read -p "Continue with fast-forward merge? [Y/n]: " -r
            if [[ $REPLY =~ ^[Nn]$ ]]; then
                echo -e "${YELLOW}🚫 Merge cancelled${NC}"
                exit 1
            fi
        fi
        
        # Perform fast-forward only merge
        echo -e "${BLUE}🔀 Merging with fast-forward only...${NC}"
        git merge --ff-only "$BRANCH_NAME" || {
            echo -e "${RED}❌ Error: Fast-forward merge failed${NC}"
            echo -e "${YELLOW}💡 This indicates the branch cannot be cleanly fast-forwarded${NC}"
            echo -e "${YELLOW}   Try rebasing the branch on main first${NC}"
            exit 1
        }
        
        echo -e "${GREEN}✅ Merge completed successfully${NC}"
        
        # Install dependencies in case new packages were added
        echo -e "${BLUE}📦 Installing dependencies...${NC}"
        if command -v pnpm >/dev/null 2>&1; then
            pnpm install
            echo -e "${GREEN}✅ Dependencies installed${NC}"
        else
            echo -e "${YELLOW}⚠️  pnpm not found, skipping dependency installation${NC}"
        fi
        
        # Function to handle post-merge migration regeneration
        handle_post_merge_migrations() {
            echo -e "${BLUE}🔍 Checking if schema migrations need to be regenerated...${NC}"
            
            if ! command -v pnpm >/dev/null 2>&1; then
                echo -e "${YELLOW}⚠️  pnpm not found, skipping migration regeneration${NC}"
                return 0
            fi
            
            # Generate migrations using --skip-empty and check for new files
            echo -e "${BLUE}🔄 Attempting to generate migrations...${NC}"
            pnpm payload migrate:create --skip-empty >/dev/null 2>&1
            
            # Check if any untracked migration files were created
            NEW_MIGRATION_FILES=$(git ls-files --others src/migrations/*.ts 2>/dev/null | head -1)
            
            if [ -n "$NEW_MIGRATION_FILES" ]; then
                echo -e "${YELLOW}📋 New migrations were generated after merge${NC}"
                
                # Ask user if they want to run and commit the migrations
                if [ "$FORCE" = true ]; then
                    RUN_MIGRATIONS=true
                else
                    echo -e "${BLUE}The merge is complete, and new migrations are needed to sync the schema.${NC}"
                    echo -e "${BLUE}This is expected when the merged branch contained migrations that were${NC}"
                    echo -e "${BLUE}removed before merge, or when collection definitions have changed.${NC}"
                    echo ""
                    read -p "Run the generated migrations and commit them? [Y/n]: " -r
                    if [[ $REPLY =~ ^[Nn]$ ]]; then
                        RUN_MIGRATIONS=false
                        echo -e "${YELLOW}⚠️  Skipping migration execution${NC}"
                        echo -e "${YELLOW}💡 You can run migrations later with: pnpm payload migrate${NC}"
                    else
                        RUN_MIGRATIONS=true
                    fi
                fi
                
                if [ "$RUN_MIGRATIONS" = true ]; then
                    # Run the migrations first, then commit if successful
                    echo -e "${BLUE}🔄 Running the generated migrations...${NC}"
                    
                    MIGRATION_RUN_OUTPUT=$(pnpm payload migrate 2>&1)
                    MIGRATION_RUN_EXIT_CODE=$?
                    
                    if [ $MIGRATION_RUN_EXIT_CODE -eq 0 ]; then
                        echo -e "${GREEN}✅ Migrations ran successfully${NC}"
                        
                        # Now commit the migrations since they were successful
                        if [ -n "$(git status --porcelain src/migrations/)" ]; then
                            echo -e "${BLUE}📝 Committing regenerated migrations...${NC}"
                            git add src/migrations/
                            
                            REGEN_COMMIT_MSG="Regenerate migrations after merge (${BRANCH_NAME})

Generated new migrations to sync schema changes after merge completion.
This ensures database schema matches the current collection definitions."
                            
                            git commit -m "$REGEN_COMMIT_MSG" || {
                                echo -e "${YELLOW}⚠️  Warning: Failed to commit regenerated migrations${NC}"
                                echo -e "${YELLOW}💡 Please commit them manually: git add src/migrations/ && git commit${NC}"
                            }
                            
                            echo -e "${GREEN}✅ Regenerated migrations committed${NC}"
                        fi
                    else
                        echo -e "${RED}❌ Error: Generated migrations failed to run${NC}"
                        echo -e "${RED}Error details:${NC}"
                        echo "$MIGRATION_RUN_OUTPUT" | tail -10
                        echo -e "${YELLOW}💡 You may need to:${NC}"
                        echo -e "${YELLOW}   1. Fix the migration error above${NC}"
                        echo -e "${YELLOW}   2. Run migrations manually: pnpm payload migrate${NC}"
                        echo -e "${YELLOW}   3. Check database connection settings${NC}"
                        echo -e "${YELLOW}⚠️  Migrations were not committed due to execution failure${NC}"
                    fi
                fi
            else
                echo -e "${GREEN}✅ No new migrations needed - schema is in sync${NC}"
            fi
        }
        
        # Handle post-merge migrations
        handle_post_merge_migrations
    else
        echo -e "${GREEN}✅ No commits to merge (branch is already merged)${NC}"
    fi
fi

# Kill dev server if running (for issues and PRs)
if [ "$IS_ISSUE" = true ]; then
    DEV_SERVER_PORT=$((3000 + ISSUE_NUMBER))
    echo -e "${BLUE}🔍 Checking for dev server on port ${DEV_SERVER_PORT} (issue #${ISSUE_NUMBER})...${NC}"
elif [ "$IS_PR" = true ]; then
    DEV_SERVER_PORT=$((3000 + PR_NUMBER))
    echo -e "${BLUE}🔍 Checking for dev server on port ${DEV_SERVER_PORT} (PR #${PR_NUMBER})...${NC}"
fi

if [ "$IS_ISSUE" = true ] || [ "$IS_PR" = true ]; then
    
    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}[DRY RUN] Would check for and kill dev server on port ${DEV_SERVER_PORT}${NC}"
    else
        # Check if a process is running on the port and get details (LISTEN only)
        PORT_INFO=$(lsof -i:${DEV_SERVER_PORT} -P 2>/dev/null | grep LISTEN || true)
        
        if [ -n "$PORT_INFO" ]; then
            # Extract process details from the LISTEN process
            DEV_SERVER_PID=$(echo "$PORT_INFO" | awk '{print $2}' | head -1)
            PROCESS_NAME=$(echo "$PORT_INFO" | awk '{print $1}' | head -1)
            
            # Get full command line for better detection
            FULL_COMMAND=$(ps -p "$DEV_SERVER_PID" -o command= 2>/dev/null || echo "")
            
            echo -e "${YELLOW}🔍 Found process on port ${DEV_SERVER_PORT}: ${PROCESS_NAME} (PID: ${DEV_SERVER_PID})${NC}"
            echo -e "${BLUE}📋 Command: ${FULL_COMMAND}${NC}"
            
            # Enhanced dev server detection: check process name AND command line
            if [[ "$PROCESS_NAME" =~ ^(node|npm|pnpm|yarn|next|next-server|vite|webpack|dev-server)$ ]] || 
               [[ "$FULL_COMMAND" =~ (next dev|npm.*dev|pnpm.*dev|yarn.*dev|vite|webpack.*serve|turbo.*dev|dev.*server) ]]; then
                echo -e "${YELLOW}🛑 Confirmed: This appears to be a dev server${NC}"
                echo -e "${BLUE}⚡ Force killing dev server...${NC}"
                
                kill -9 "$DEV_SERVER_PID" 2>/dev/null || {
                    echo -e "${YELLOW}⚠️  Warning: Failed to kill dev server on port ${DEV_SERVER_PORT}${NC}"
                    return 1
                }
                
                # Wait a moment for the process to die
                sleep 1
                
                # Verify it's dead
                if ! lsof -ti:${DEV_SERVER_PORT} >/dev/null 2>&1; then
                    echo -e "${GREEN}✅ Dev server stopped successfully${NC}"
                else
                    echo -e "${YELLOW}⚠️  Warning: Dev server may still be running on port ${DEV_SERVER_PORT}${NC}"
                fi
            else
                echo -e "${YELLOW}⚠️  Warning: Process doesn't appear to be a dev server, skipping${NC}"
                echo -e "${BLUE}💡 If this is actually a dev server, you may need to stop it manually${NC}"
            fi
        else
            echo -e "${GREEN}✅ No dev server running on port ${DEV_SERVER_PORT}${NC}"
        fi
    fi
fi

# Cleanup worktree and branch
echo -e "${BLUE}🧹 Cleaning up worktree and branch...${NC}"

if ! cleanup_worktree "$BRANCH_NAME" "$INPUT" false; then
    echo -e "${YELLOW}⚠️  Warning: Cleanup failed, but merge was successful${NC}"
fi

echo -e "${GREEN}✅ Cleanup completed successfully${NC}"

echo ""
echo -e "${GREEN}🎉 Merge and cleanup workflow completed successfully!${NC}"
echo -e "${BLUE}Summary:${NC}"
echo -e "${BLUE}  • Branch: ${BRANCH_NAME}${NC}"
if [ "$IS_ISSUE" = true ]; then
    echo -e "${BLUE}  • Issue: #${ISSUE_NUMBER}${NC}"
fi
if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}  • Mode: Dry run (no changes made)${NC}"
else
    echo -e "${BLUE}  • Merged into main with fast-forward${NC}"
    echo -e "${BLUE}  • Worktree and branch cleaned up${NC}"
fi
echo ""
echo -e "${YELLOW}💡 Next steps:${NC}"
if [ "$DRY_RUN" != true ]; then
    echo "  • Push main to origin: git push origin main"
    echo "  • Verify the merge in GitHub"
fi
echo "  • Continue with your next feature or issue"