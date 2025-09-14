#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to show usage
usage() {
    echo -e "${BLUE}Usage: $0 <branch-name-or-issue-number-or-pr-number>${NC}"
    echo -e "${BLUE}Examples:${NC}"
    echo -e "${BLUE}  $0 feat/new-feature    ${NC}# Create branch with custom name"
    echo -e "${BLUE}  $0 30                  ${NC}# Create worktree for GitHub issue #30 OR PR #30"
    echo -e "${BLUE}  $0 #30                 ${NC}# Create worktree for GitHub issue #30 OR PR #30"
    echo ""
    echo -e "${YELLOW}This script will:${NC}"
    echo "  1. Create a new git branch (auto-named for issues, use existing for PRs)"
    echo "  2. Create a git worktree for that branch"
    echo "  3. Copy .env file to the new worktree"
    echo "  4. Install dependencies with --frozen-lockfile"
    echo "  5. Open a new terminal in the worktree directory"
    echo "  6. Start Claude Code with context (for issues/PRs)"
    echo ""
    echo -e "${YELLOW}GitHub Integration:${NC}"
    echo "  • Requires GitHub CLI (gh) for issue/PR features"
    echo "  • Auto-detects if number is a PR (checks first) or issue"
    echo "  • Uses Claude headless mode for branch naming (issues only)"
    echo "  • Provides issue/PR context to Claude Code"
    echo "  • PR worktrees get '_pr_<PR_NUM>' suffix for distinction"
    exit 1
}

# Check if input is provided, prompt if not
if [ -z "$1" ]; then
    echo -e "${YELLOW}No issue or PR number provided. Please enter:${NC}"
    read -p "Issue or PR#: " INPUT
    
    # Check if user provided input after prompting
    if [ -z "$INPUT" ]; then
        echo -e "${RED}❌ Error: Issue number is required${NC}"
        exit 1
    fi
else
    INPUT="$1"
fi
CURRENT_DIR="$(pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
IS_ISSUE=false
IS_PR=false
ISSUE_NUMBER=""
ISSUE_TITLE=""
ISSUE_CONTEXT=""
PR_NUMBER=""
PR_TITLE=""
PR_BRANCH=""
PR_CONTEXT=""

# Check if we're in a git repository
if [ -z "$REPO_ROOT" ]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Load environment variables from .env file
if [ -f "${REPO_ROOT}/.env" ]; then
    export $(grep -v '^#' "${REPO_ROOT}/.env" | grep -v '^$' | xargs)
fi

# Source the utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils/env-utils.sh"
source "$SCRIPT_DIR/utils/neon-utils.sh"

# Function to check if GitHub CLI is available
check_gh_cli() {
    if ! command -v gh >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Warning: GitHub CLI (gh) not found. Issue features disabled.${NC}"
        return 1
    fi
    return 0
}

# Function to check if Claude CLI is available
check_claude_cli() {
    if ! command -v claude >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Warning: Claude CLI not found. Auto-naming disabled.${NC}"
        return 1
    fi
    return 0
}


# Function to generate branch name from issue
generate_branch_name() {
    local issue_num="$1"
    local issue_title="$2"
    
    if check_claude_cli; then
        echo -e "${BLUE}🤖 Generating branch name using Claude...${NC}" >&2
        
        local prompt="Generate a concise 3-4 word branch name summary for this GitHub issue. Use lowercase, hyphen-separated words that capture the main purpose. Only output the summary, nothing else.

Issue #${issue_num}: ${issue_title}"
        
        local summary
        summary=$(echo "$prompt" | claude -p --model claude-3-5-haiku-20241022 2>/dev/null | tr -d '\n' | tr -d '\r')
        
        # Check if summary looks valid (no error messages or API errors)
        if [ -n "$summary" ] && [[ ! "$summary" =~ (error|Error|API|404|500|opusplan) ]]; then
            echo "feat/issue-${issue_num}-${summary}"
            return 0
        else
            echo -e "${YELLOW}⚠️  Claude failed to generate branch name (got: '$summary'), using fallback${NC}" >&2
        fi
    fi
    
    # Fallback to generic name
    echo "feat/issue-${issue_num}"
    return 0
}

# Detect if input is a number (could be PR or issue)
if [[ "$INPUT" =~ ^#?([0-9]+)$ ]]; then
    INPUT_NUMBER="${BASH_REMATCH[1]}"
    
    if check_gh_cli; then
        # First try to fetch as a PR
        echo -e "${BLUE}🔍 Checking if #${INPUT_NUMBER} is a pull request...${NC}"
        if PR_DETAILS=$(gh pr view "$INPUT_NUMBER" --json number,title,headRefName,state 2>/dev/null); then
            # It's a PR!
            IS_PR=true
            PR_NUMBER="$INPUT_NUMBER"
            PR_TITLE=$(echo "$PR_DETAILS" | jq -r '.title')
            PR_BRANCH=$(echo "$PR_DETAILS" | jq -r '.headRefName')
            PR_STATE=$(echo "$PR_DETAILS" | jq -r '.state')
            
            echo -e "${GREEN}📋 Found Pull Request #${PR_NUMBER}: ${PR_TITLE}${NC}"
            echo -e "${BLUE}🌿 PR Branch: ${PR_BRANCH}${NC}"
            
            if [ "$PR_STATE" = "CLOSED" ] || [ "$PR_STATE" = "MERGED" ]; then
                echo -e "${YELLOW}⚠️  Warning: PR #${PR_NUMBER} is ${PR_STATE}.${NC}"
                read -p "Continue anyway? [y/N]: " -r
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    echo -e "${YELLOW}🚫 Cancelled${NC}"
                    exit 1
                fi
            fi
            
            # Use the PR's branch name
            BRANCH_NAME="$PR_BRANCH"
            PR_CONTEXT="Pull Request #${PR_NUMBER}: ${PR_TITLE}"
            
        else
            # Not a PR, try as an issue
            echo -e "${BLUE}🔍 Not a PR, checking if #${INPUT_NUMBER} is an issue...${NC}"
            ISSUE_NUMBER="$INPUT_NUMBER"
            IS_ISSUE=true
            
            echo -e "${BLUE}📋 Fetching issue details...${NC}"
            
            # Get issue details
            if ! ISSUE_DETAILS=$(gh issue view "$ISSUE_NUMBER" --json title,body,state 2>/dev/null); then
                echo -e "${RED}❌ Error: Could not fetch issue or PR #${INPUT_NUMBER}. Check if it exists.${NC}"
                exit 1
            fi
            
            ISSUE_TITLE=$(echo "$ISSUE_DETAILS" | jq -r '.title')
            ISSUE_STATE=$(echo "$ISSUE_DETAILS" | jq -r '.state')
            
            if [ "$ISSUE_STATE" = "CLOSED" ]; then
                echo -e "${YELLOW}⚠️  Warning: Issue #${ISSUE_NUMBER} is closed.${NC}"
                read -p "Continue anyway? [y/N]: " -r
                if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                    echo -e "${YELLOW}🚫 Cancelled${NC}"
                    exit 1
                fi
            fi
            
            echo -e "${GREEN}📄 Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}${NC}"
            
            # Generate branch name
            BRANCH_NAME=$(generate_branch_name "$ISSUE_NUMBER" "$ISSUE_TITLE")
            
            # Create issue context for Claude
            ISSUE_CONTEXT="GitHub Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}"
        fi
        
    else
        echo -e "${RED}❌ Error: GitHub CLI required for issue integration${NC}"
        exit 1
    fi
else
    # Input is a regular branch name
    BRANCH_NAME="$INPUT"
    
    # Validate branch name (basic validation)
    if [[ ! "$BRANCH_NAME" =~ ^[a-zA-Z0-9/_-]+$ ]]; then
        echo -e "${RED}❌ Error: Invalid branch name. Use only letters, numbers, hyphens, underscores, and slashes${NC}"
        exit 1
    fi
fi

# Create worktree directory name (replace slashes with dashes for directory name)
WORKTREE_DIR_NAME="${BRANCH_NAME//\//-}"
# Add _pr_<PR_NUM> suffix for pull requests to distinguish from regular issue branches
if [ "$IS_PR" = true ]; then
    WORKTREE_DIR_NAME="${WORKTREE_DIR_NAME}_pr_${PR_NUMBER}"
fi
WORKTREE_PATH="${REPO_ROOT}/../${WORKTREE_DIR_NAME}"

echo -e "${BLUE}🚀 Starting branch workflow...${NC}"
echo -e "${BLUE}Branch: ${BRANCH_NAME}${NC}"
echo -e "${BLUE}Worktree: ${WORKTREE_PATH}${NC}"

# Check if branch already exists locally
if git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
    echo -e "${YELLOW}⚠️  Branch '$BRANCH_NAME' already exists locally${NC}"
    echo -e "${BLUE}🔄 Using existing branch (auto-selected)${NC}"
    
    # Check if we're currently on this branch - if so, switch away
    current_branch=$(git branch --show-current)
    if [ "$current_branch" = "$BRANCH_NAME" ]; then
        echo -e "${BLUE}🔄 Currently on target branch, switching to main to create worktree${NC}"
        if ! git checkout main 2>/dev/null && ! git checkout master 2>/dev/null; then
            echo -e "${RED}❌ Error: Failed to switch away from branch ${BRANCH_NAME}${NC}"
            exit 1
        fi
        echo -e "${GREEN}✅ Switched to main branch${NC}"
    fi
fi

# Check if worktree directory already exists
if [ -d "$WORKTREE_PATH" ]; then
    echo -e "${RED}❌ Error: Worktree directory '$WORKTREE_PATH' already exists${NC}"
    exit 1
fi

# Create the branch (only if it doesn't exist or we deleted it)
if ! git show-ref --verify --quiet refs/heads/"$BRANCH_NAME"; then
    echo -e "${GREEN}📝 Creating branch '$BRANCH_NAME'...${NC}"
    if ! git checkout -b "$BRANCH_NAME"; then
        echo -e "${RED}❌ Error: Failed to create branch${NC}"
        exit 1
    fi

    # Go back to the original branch (usually main or master)
    echo -e "${GREEN}🔄 Switching back to original branch...${NC}"
    git checkout -
else
    echo -e "${BLUE}📝 Branch '$BRANCH_NAME' already exists, will use it for worktree${NC}"
fi

# For PRs, fetch the remote branch first
if [ "$IS_PR" = true ]; then
    echo -e "${GREEN}🔄 Fetching PR branch from remote...${NC}"
    if ! git fetch origin "$BRANCH_NAME"; then
        echo -e "${RED}❌ Error: Failed to fetch PR branch '$BRANCH_NAME' from remote${NC}"
        echo -e "${YELLOW}💡 Make sure the PR branch exists and you have access to the repository${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Successfully fetched PR branch${NC}"
fi

# Create the worktree
echo -e "${GREEN}🌳 Creating git worktree at '$WORKTREE_PATH'...${NC}"
if ! git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"; then
    echo -e "${RED}❌ Error: Failed to create worktree${NC}"
    # Clean up the branch we created (only for issues, not PRs)
    if [ "$IS_ISSUE" = true ]; then
        git branch -D "$BRANCH_NAME" 2>/dev/null
    fi
    exit 1
fi

echo -e "${GREEN}✅ Worktree created successfully!${NC}"

# For PRs, pull the latest changes from remote and set upstream
if [ "$IS_PR" = true ]; then
    echo -e "${GREEN}🔄 Pulling latest changes from remote and setting upstream...${NC}"
    cd "${WORKTREE_PATH}"
    if ! git pull -u origin "$BRANCH_NAME"; then
        echo -e "${RED}❌ Error: Failed to pull latest changes for PR branch${NC}"
        echo -e "${YELLOW}💡 Continuing with current state, but you may not have the latest changes${NC}"
    else
        echo -e "${GREEN}✅ Successfully pulled latest changes and set upstream${NC}"
    fi
    cd "${REPO_ROOT}"
fi

# Copy .env file if it exists
if [ -f "${REPO_ROOT}/.env" ]; then
    echo -e "${GREEN}📋 Copying .env file...${NC}"
    if cp "${REPO_ROOT}/.env" "${WORKTREE_PATH}/.env"; then
        echo -e "${GREEN}✅ .env file copied successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: Failed to copy .env file${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Warning: No .env file found in repo root${NC}"
fi

# Update NEXT_PUBLIC_SERVER_URL for issue/PR-based branches (port 3000 + number)
WORKTREE_ENV_FILE="${WORKTREE_PATH}/.env"
if [ -n "$ISSUE_NUMBER" ]; then
    local_port=$((3000 + ISSUE_NUMBER))
    echo -e "${BLUE}🔗 Setting up dev server on port $local_port for issue #$ISSUE_NUMBER...${NC}"
    setEnvVar "$WORKTREE_ENV_FILE" "NEXT_PUBLIC_SERVER_URL" "http://localhost:$local_port"
    echo -e "${GREEN}✅ Dev server URL configured for port $local_port${NC}"
elif [ -n "$PR_NUMBER" ]; then
    local_port=$((3000 + PR_NUMBER))
    echo -e "${BLUE}🔗 Setting up dev server on port $local_port for PR #$PR_NUMBER...${NC}"
    setEnvVar "$WORKTREE_ENV_FILE" "NEXT_PUBLIC_SERVER_URL" "http://localhost:$local_port"
    echo -e "${GREEN}✅ Dev server URL configured for port $local_port${NC}"
else
    echo -e "${BLUE}🔗 Using default dev server configuration...${NC}"
    setEnvVar "$WORKTREE_ENV_FILE" "NEXT_PUBLIC_SERVER_URL" "http://localhost:3000"
fi

# Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
cd "${WORKTREE_PATH}"
if command -v pnpm >/dev/null 2>&1; then
    if pnpm install --frozen-lockfile; then
        echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: Failed to install dependencies${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Warning: pnpm not found, skipping dependency installation${NC}"
fi
cd "${CURRENT_DIR}"

# Create Neon database branch
echo -e "${GREEN}🗂️  Setting up database branch...${NC}"
connection_string=$(create_neon_database_branch "$BRANCH_NAME")
if [ -n "$connection_string" ]; then
    echo -e "${BLUE}🔗 Setting up database connection in worktree .env...${NC}"
    setEnvVar "${WORKTREE_PATH}/.env" "DATABASE_URL" "$connection_string"
    echo -e "${GREEN}✅ Database branch is ready to use (contains complete schema and data from parent)${NC}"
else
    echo -e "${YELLOW}⚠️  No database connection string returned, skipping .env setup${NC}"
fi

# Function to open terminal and start Claude
open_terminal_with_claude() {
    local worktree_path="$1"
    local absolute_path="$(cd "$worktree_path" && pwd)"
    
    if [ "$IS_ISSUE" = true ] && [ -n "$ISSUE_CONTEXT" ]; then
        # Calculate port number for issue (3000 + issue number)
        local issue_port=$((3000 + ISSUE_NUMBER))
        
        # Issue-based branch: Start Claude with issue context and proper permissions
        osascript -e "tell application \"Terminal\" to do script \"DISABLE_AUTO_UPDATE=true && cd '$absolute_path' && echo 'Working on issue #$ISSUE_NUMBER' && claude --add-dir '$absolute_path' --model opusplan --permission-mode plan 'You are a senior software engineer. Please read GitHub issue #$ISSUE_NUMBER and its comments using: gh issue view $ISSUE_NUMBER without and then with the --comments flag, then think deeply to analyze and fix the issue. When fixed, start a dev server using port $issue_port so that the user can verify.'\""
        osascript -e "tell application \"Terminal\" to activate"
    elif [ "$IS_PR" = true ] && [ -n "$PR_CONTEXT" ]; then
        # Calculate port number for PR (3000 + PR number)
        local pr_port=$((3000 + PR_NUMBER))
        
        # PR-based branch: Start Claude with PR context and proper permissions
        osascript -e "tell application \"Terminal\" to do script \"DISABLE_AUTO_UPDATE=true && cd '$absolute_path' && echo 'Working on PR #$PR_NUMBER' && claude --add-dir '$absolute_path' --model opusplan --permission-mode plan 'You are a senior software engineer. Please read Pull Request #$PR_NUMBER and its comments using: gh pr view $PR_NUMBER without and then with the --comments flag to understand the current state of the work. Also check if the branch name contains an issue number (like issue-123) and if so, read that issue using: gh issue view \$ISSUE_NUMBER without and then with the --comments flag to understand the original requirements. Since this is an existing PR, the issue may be partially addressed or in an unknown state. After reading both the PR and any referenced issue, wait for the user to provide guidance on what they would like you to work on next. If you need to start a dev server for testing, use port $pr_port.'\""
        osascript -e "tell application \"Terminal\" to activate"
    else
        # Regular branch: Start Claude with senior engineer context
        osascript -e "tell application \"Terminal\" to do script \"DISABLE_AUTO_UPDATE=true && cd '$absolute_path' && claude 'You are a senior software engineer responsible for well-architected, easy to maintain and understandable code.'\""
        osascript -e "tell application \"Terminal\" to activate"
    fi
}

# Open new terminal and start Claude
echo -e "${GREEN}🖥️  Opening new terminal in worktree directory...${NC}"
if ! open_terminal_with_claude "$WORKTREE_PATH"; then
    echo -e "${YELLOW}⚠️  Warning: Failed to open terminal automatically${NC}"
    echo -e "${YELLOW}📋 Manual commands to run:${NC}"
    echo -e "${BLUE}cd '$WORKTREE_PATH'${NC}"
    if [ "$IS_ISSUE" = true ]; then
        issue_port=$((3000 + ISSUE_NUMBER))
        echo -e "${BLUE}claude 'You are a senior software engineer responsible for well-architected, easy to maintain and understandable code. Please read GitHub issue #$ISSUE_NUMBER using: gh issue view $ISSUE_NUMBER, then analyze and fix the issue. If you need to start a dev server, use port $issue_port (3000 + issue number).'${NC}"
    elif [ "$IS_PR" = true ]; then
        pr_port=$((3000 + PR_NUMBER))
        echo -e "${BLUE}claude 'You are a senior software engineer responsible for well-architected, easy to maintain and understandable code. Please read Pull Request #$PR_NUMBER using: gh pr view $PR_NUMBER to understand the current state of the work. Also check if the branch name contains an issue number (like issue-123) and if so, read that issue using: gh issue view \$ISSUE_NUMBER to understand the original requirements. Since this is an existing PR, the issue may be partially addressed or in an unknown state. After reading both the PR and any referenced issue, wait for the user to provide guidance on what they would like you to work on next. If you need to start a dev server for testing, use port $pr_port (3000 + PR number).'${NC}"
    else
        echo -e "${BLUE}claude 'You are a senior software engineer responsible for well-architected, easy to maintain and understandable code.'${NC}"
    fi
else
    echo -e "${GREEN}✅ Terminal opened and Claude started!${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Workflow completed successfully!${NC}"
echo -e "${BLUE}Branch: ${BRANCH_NAME}${NC}"
echo -e "${BLUE}Worktree: ${WORKTREE_PATH}${NC}"

if [ "$IS_ISSUE" = true ]; then
    echo -e "${BLUE}Issue: #${ISSUE_NUMBER} - ${ISSUE_TITLE}${NC}"
elif [ "$IS_PR" = true ]; then
    echo -e "${BLUE}Pull Request: #${PR_NUMBER} - ${PR_TITLE}${NC}"
fi

echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "  • Your new branch is ready in a separate worktree"
echo "  • Claude should be starting with the appropriate context"

if [ "$IS_ISSUE" = true ]; then
    local issue_port=$((3000 + ISSUE_NUMBER))
    echo "  • Claude will automatically read and analyze the GitHub issue"
    echo "  • Claude has permissions to run 'gh issue view $ISSUE_NUMBER'"
    echo "  • Use port $issue_port for any dev server (3000 + issue number)"
elif [ "$IS_PR" = true ]; then
    local pr_port=$((3000 + PR_NUMBER))
    echo "  • Claude will automatically read and analyze the Pull Request"
    echo "  • Claude has permissions to run 'gh pr view $PR_NUMBER'"
    echo "  • Use port $pr_port for any dev server (3000 + PR number)"
    echo "  • Worktree has '_pr_${PR_NUMBER}' suffix to distinguish from issue branches"
fi

echo ""
echo -e "${YELLOW}🧹 Cleanup commands:${NC}"
echo "  • Remove this worktree: ./scripts/cleanup-worktree.sh $BRANCH_NAME"
echo "  • List all worktrees: ./scripts/cleanup-worktree.sh --list"
echo "  • Remove all worktrees: ./scripts/cleanup-worktree.sh --all"
echo "  • Manual removal: git worktree remove '$WORKTREE_PATH'"