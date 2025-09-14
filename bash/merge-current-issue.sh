#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Merge Current Issue/PR Script${NC}"

# Get current branch name
CURRENT_BRANCH=$(git branch --show-current)
if [ -z "$CURRENT_BRANCH" ]; then
    echo -e "${RED}❌ Error: Could not determine current git branch${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Current branch: ${CURRENT_BRANCH}${NC}"

# Source worktree utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils/worktree-utils.sh"

# Detect if we're in a PR worktree by checking directory name for _pr_N suffix
CURRENT_DIR=$(basename "$(pwd)")
IS_PR_WORKTREE=false
PR_NUM=""
ISSUE_NUM=""

if is_pr_worktree "$CURRENT_DIR"; then
    # This is a PR worktree
    IS_PR_WORKTREE=true
    PR_NUM="$(get_pr_number_from_worktree "$CURRENT_DIR")"
    echo -e "${GREEN}🔍 Detected PR worktree for PR #${PR_NUM} from directory: ${CURRENT_DIR}${NC}"
else
    # Try to extract issue number from branch name (existing logic)
    ISSUE_NUM=$(echo "$CURRENT_BRANCH" | grep -o "issue-[0-9]*" | grep -o "[0-9]*")
    
    if [ -z "$ISSUE_NUM" ]; then
        echo -e "${RED}❌ Error: Could not detect issue number from current branch: ${CURRENT_BRANCH}${NC}"
        echo -e "${YELLOW}💡 Expected branch name pattern: feat/issue-XX-description OR PR worktree with _pr_N suffix${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}🔍 Detected issue #${ISSUE_NUM} from branch: ${CURRENT_BRANCH}${NC}"
fi

# Get the main worktree directory (first entry is always main)
MAIN_WORKTREE=$(git worktree list | head -n1 | awk '{print $1}')

if [ -z "$MAIN_WORKTREE" ]; then
    echo -e "${RED}❌ Error: Could not find main worktree directory${NC}"
    exit 1
fi

# Change to main worktree directory
echo -e "${BLUE}📂 Changing to main worktree directory...${NC}"
cd "$MAIN_WORKTREE" || {
    echo -e "${RED}❌ Error: Failed to change to main worktree directory: ${MAIN_WORKTREE}${NC}"
    exit 1
}

echo -e "${GREEN}✅ Now in repository root: $(pwd)${NC}"

# Check if merge script exists
MERGE_SCRIPT="./scripts/merge-and-clean.sh"
if [ ! -f "$MERGE_SCRIPT" ]; then
    echo -e "${RED}❌ Error: Merge script not found: ${MERGE_SCRIPT}${NC}"
    exit 1
fi

# Run the merge and clean script with appropriate arguments
if [ "$IS_PR_WORKTREE" = true ]; then
    echo -e "${BLUE}🚀 Running merge workflow for PR #${PR_NUM}...${NC}"
    echo ""
    
    "$MERGE_SCRIPT" --pr "$PR_NUM" || {
        echo -e "${RED}❌ Error: PR merge workflow failed${NC}"
        exit 1
    }
else
    echo -e "${BLUE}🚀 Running merge workflow for issue #${ISSUE_NUM}...${NC}"
    echo ""

    "$MERGE_SCRIPT" "$ISSUE_NUM" || {
        echo -e "${RED}❌ Error: Issue merge workflow failed${NC}"
        exit 1
    }
fi

echo ""
echo -e "${GREEN}🎉 Merge workflow completed successfully!${NC}"