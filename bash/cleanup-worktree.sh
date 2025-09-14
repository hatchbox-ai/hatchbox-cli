#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Source the utility functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils/find-worktree-for-branch.sh"
source "$SCRIPT_DIR/utils/worktree-utils.sh"
source "$SCRIPT_DIR/utils/neon-utils.sh"

# Function to show usage
usage() {
    echo -e "${BLUE}Usage: $0 [options] [branch-name|issue-number]${NC}"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  -l, --list          List all worktrees"
    echo "  -a, --all           Remove all worktrees (interactive)"
    echo "  -i, --issue         Clean up by GitHub issue number"
    echo "  -f, --force         Force removal without confirmation"
    echo "  -h, --help          Show this help"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  $0 feat/new-feature     # Remove specific branch worktree"
    echo "  $0 25                   # Remove all worktrees for GitHub issue #25"
    echo "  $0 --issue 25           # Same as above (explicit)"
    echo "  $0 --list               # List all worktrees"
    echo "  $0 --all                # Remove all worktrees interactively"
    echo "  $0 --all --force        # Remove all worktrees without confirmation"
    exit 1
}

# Function to list all worktrees
list_worktrees() {
    echo -e "${BLUE}📋 Current git worktrees:${NC}"
    echo ""
    git worktree list --porcelain | while IFS= read -r line; do
        if [[ $line == worktree* ]]; then
            worktree_path="${line#worktree }"
            echo -n -e "${GREEN}📁 ${worktree_path}${NC}"
        elif [[ $line == branch* ]]; then
            branch_name="${line#branch refs/heads/}"
            echo -e " → ${YELLOW}${branch_name}${NC}"
        fi
    done
    echo ""
}

# Function to confirm action
confirm() {
    local message="$1"
    local default="${2:-y}"
    
    if [ "$FORCE" = true ]; then
        return 0
    fi
    
    echo -n -e "${YELLOW}${message} [Y/n]: ${NC}"
    read -r response
    case "${response:-$default}" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}


# Function to remove a single worktree
remove_worktree() {
    local branch_name="$1"
    
    # Use utility function to find the actual worktree path
    local worktree_path=$(find_worktree_for_branch "$branch_name")
    
    if [ -z "$worktree_path" ]; then
        echo -e "${YELLOW}⚠️  Warning: Worktree for branch '$branch_name' not found${NC}"
        echo -e "${YELLOW}Available worktrees:${NC}"
        git worktree list
        echo ""
        echo -e "${BLUE}🔍 Checking for database branch cleanup only...${NC}"
        
        # Still try to clean up the database branch even if worktree is missing
        delete_neon_database_branch "$branch_name" false
        return 0
    fi
    
    echo -e "${BLUE}🗑️  Removing worktree for branch: ${branch_name}${NC}"
    echo -e "${BLUE}📁 Path: ${worktree_path}${NC}"
    
    if confirm "Remove this worktree?"; then
        if git worktree remove "$worktree_path"; then
            echo -e "${GREEN}✅ Worktree removed successfully!${NC}"
            
            # Delete associated Neon database branch (detect PR from worktree path)
            delete_neon_database_branch "$branch_name" "$(is_pr_worktree "$worktree_path" && echo true || echo false)"
            
            # Ask if they want to delete the branch too
            if git show-ref --verify --quiet "refs/heads/$branch_name"; then
                if confirm "Also delete the branch '$branch_name'?"; then
                    if git branch -D "$branch_name"; then
                        echo -e "${GREEN}✅ Branch deleted successfully!${NC}"
                    else
                        echo -e "${YELLOW}⚠️  Failed to delete branch${NC}"
                    fi
                fi
            fi
        else
            echo -e "${RED}❌ Failed to remove worktree${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}🚫 Cancelled${NC}"
    fi
}

# Function to find branches related to a GitHub issue
find_issue_branches() {
    local issue_number="$1"
    local branches=()
    
    # Find all branches that contain the issue number in various formats
    while IFS= read -r branch; do
        # Remove 'origin/' prefix if present and clean any git status markers
        local clean_branch="${branch#origin/}"
        clean_branch=$(echo "$clean_branch" | sed 's/^[+* ] *//')
        if [[ "$clean_branch" =~ ^(main|master|develop)$ ]]; then
            continue
        fi
        
        # Check if branch name contains the issue number in common patterns:
        # - issue-25, issue/25, 25-feature, feat-25, feat/issue-25, etc.
        if [[ "$clean_branch" =~ (^|[^0-9])$issue_number([^0-9]|$) ]]; then
            branches+=("$clean_branch")
        fi
    done < <(git branch -a | sed 's/^[ *]*//' | grep -v '^remotes/origin/HEAD')
    
    printf '%s\n' "${branches[@]}"
}

# Function to remove worktrees by issue number
remove_worktrees_by_issue() {
    local issue_number="$1"
    echo -e "${BLUE}🔍 Finding branches related to GitHub issue #${issue_number}...${NC}"
    echo ""
    
    local branches=()
    while IFS= read -r branch; do
        if [[ -n "$branch" ]]; then
            branches+=("$branch")
        fi
    done < <(find_issue_branches "$issue_number")
    
    if [ ${#branches[@]} -eq 0 ]; then
        echo -e "${YELLOW}ℹ️  No branches found for GitHub issue #${issue_number}${NC}"
        echo -e "${YELLOW}💡 Searched for patterns like: issue-${issue_number}, ${issue_number}-*, feat-${issue_number}, etc.${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}Found ${#branches[@]} branch(es) related to issue #${issue_number}:${NC}"
    for branch in "${branches[@]}"; do
        local worktree_dir_name="${branch//\//-}"
        local repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"
        local worktree_path="${repo_root}/../${worktree_dir_name}"
        local has_worktree=false
        
        # Check if this branch has a worktree
        if git worktree list | grep -q "$worktree_path"; then
            has_worktree=true
            echo -e "${BLUE}  🌿 $branch ${GREEN}(has worktree)${NC}"
        else
            echo -e "${BLUE}  🌿 $branch ${YELLOW}(branch only)${NC}"
        fi
    done
    echo ""
    
    local removed_worktrees=0
    local removed_branches=0
    local failed=0
    
    for branch in "${branches[@]}"; do
        # Clean the branch name (remove any git status prefixes like +, *, etc.)
        clean_branch=$(echo "$branch" | sed 's/^[+* ] *//')
        echo -e "${GREEN}🗑️  Processing branch: $clean_branch${NC}"
        
        # Find and remove worktree if it exists
        local worktree_path=$(git worktree list --porcelain | grep -B2 "branch refs/heads/$clean_branch" | grep "worktree" | cut -d' ' -f2)
        
        if [ -n "$worktree_path" ]; then
            echo -e "${BLUE}  🔍 Worktree found at: $worktree_path${NC}"
            if git worktree remove "$worktree_path"; then
                ((removed_worktrees++))
                echo -e "${GREEN}  ✅ Worktree removed${NC}"
                
                # Delete associated Neon database branch (detect PR from worktree path)
                delete_neon_database_branch "$clean_branch" "$(is_pr_worktree "$worktree_path" && echo true || echo false)"
            else
                ((failed++))
                echo -e "${RED}  ❌ Failed to remove worktree${NC}"
            fi
        else
            echo -e "${YELLOW}  ℹ️  No worktree found for this branch${NC}"
        fi
        
        # Remove branch if it exists locally (safe delete - only if merged)
        if git show-ref --verify --quiet "refs/heads/$clean_branch"; then
            echo -e "${BLUE}  🔍 Local branch found, attempting safe deletion...${NC}"
            if git branch -d "$clean_branch"; then
                ((removed_branches++))
                echo -e "${GREEN}  ✅ Branch deleted${NC}"
            else
                echo -e "${YELLOW}  ⚠️  Branch not fully merged, skipping deletion${NC}"
                echo -e "${YELLOW}  💡 Use 'git branch -D $clean_branch' to force delete if needed${NC}"
            fi
        else
            echo -e "${YELLOW}  ℹ️  No local branch found${NC}"
        fi
        echo ""
    done
        
    echo -e "${GREEN}✅ Completed cleanup for issue #${issue_number}:${NC}"
    echo -e "${GREEN}   📁 Worktrees removed: $removed_worktrees${NC}"
    echo -e "${GREEN}   🌿 Branches deleted: $removed_branches${NC}"
    if [ $failed -gt 0 ]; then
        echo -e "${RED}   ❌ Failed operations: $failed${NC}"
    fi
}

# Function to remove all worktrees
remove_all_worktrees() {
    echo -e "${BLUE}🗑️  Removing all worktrees...${NC}"
    echo ""
    
    # Get all worktrees except the main one
    local worktrees=()
    while IFS= read -r line; do
        if [[ $line == worktree* ]]; then
            worktree_path="${line#worktree }"
            # Skip the main worktree (the one that's bare or in the main repo)
            if [[ "$worktree_path" != "$(git rev-parse --show-toplevel)" ]]; then
                worktrees+=("$worktree_path")
            fi
        fi
    done < <(git worktree list --porcelain)
    
    if [ ${#worktrees[@]} -eq 0 ]; then
        echo -e "${YELLOW}ℹ️  No additional worktrees found${NC}"
        return 0
    fi
    
    echo -e "${YELLOW}Found ${#worktrees[@]} worktree(s) to remove:${NC}"
    for worktree in "${worktrees[@]}"; do
        echo -e "${BLUE}  📁 $worktree${NC}"
    done
    echo ""
    
    if confirm "Remove all ${#worktrees[@]} worktree(s)?"; then
        local removed=0
        local failed=0
        
        for worktree in "${worktrees[@]}"; do
            echo -e "${GREEN}🗑️  Removing: $worktree${NC}"
            
            # Extract branch name from worktree path for database cleanup
            local branch_name=""
            while IFS= read -r line; do
                if [[ $line == "worktree $worktree" ]]; then
                    # Found the matching worktree, get the next branch line
                    read -r next_line
                    if [[ $next_line == branch* ]]; then
                        branch_name="${next_line#branch refs/heads/}"
                        break
                    fi
                fi
            done < <(git worktree list --porcelain)
            
            if git worktree remove "$worktree"; then
                ((removed++))
                echo -e "${GREEN}✅ Removed successfully${NC}"
                
                # Delete associated Neon database branch (detect PR from worktree path)  
                if [ -n "$branch_name" ]; then
                    delete_neon_database_branch "$branch_name" "$(is_pr_worktree "$worktree" && echo true || echo false)"
                fi
            else
                ((failed++))
                echo -e "${RED}❌ Failed to remove${NC}"
            fi
            echo ""
        done
        
        echo -e "${GREEN}✅ Completed: $removed removed, $failed failed${NC}"
        
        # Ask about cleaning up branches
        if [ $removed -gt 0 ] && confirm "Also clean up any merged branches?"; then
            echo -e "${BLUE}🧹 Cleaning up merged branches...${NC}"
            git branch --merged | grep -v "\*\|main\|master\|develop" | xargs -n 1 git branch -d 2>/dev/null || true
            echo -e "${GREEN}✅ Branch cleanup completed${NC}"
        fi
    else
        echo -e "${YELLOW}🚫 Cancelled${NC}"
    fi
}

# Parse command line arguments
LIST=false
ALL=false
ISSUE=false
FORCE=false
BRANCH_NAME=""
ISSUE_NUMBER=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -l|--list)
            LIST=true
            shift
            ;;
        -a|--all)
            ALL=true
            shift
            ;;
        -i|--issue)
            ISSUE=true
            if [[ -n "$2" && "$2" != -* ]]; then
                ISSUE_NUMBER="$2"
                shift 2
            else
                echo -e "${RED}❌ Error: --issue requires an issue number${NC}"
                usage
            fi
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        -*)
            echo -e "${RED}❌ Error: Unknown option $1${NC}"
            usage
            ;;
        *)
            if [ "$ISSUE" = true ] && [ -z "$ISSUE_NUMBER" ]; then
                ISSUE_NUMBER="$1"
            else
                # Auto-detect if argument is numeric (issue number) or branch name
                if [[ "$1" =~ ^[0-9]+$ ]]; then
                    ISSUE=true
                    ISSUE_NUMBER="$1"
                else
                    BRANCH_NAME="$1"
                fi
            fi
            shift
            ;;
    esac
done

# Check if we're in a git repository
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Load environment variables from .env file
if [ -f "${REPO_ROOT}/.env" ]; then
    export $(grep -v '^#' "${REPO_ROOT}/.env" | grep -v '^$' | xargs)
fi

# Execute based on options
if [ "$LIST" = true ]; then
    list_worktrees
elif [ "$ALL" = true ]; then
    remove_all_worktrees
elif [ "$ISSUE" = true ]; then
    if [ -z "$ISSUE_NUMBER" ]; then
        echo -e "${RED}❌ Error: Issue number is required${NC}"
        usage
    fi
    # Validate issue number is numeric
    if ! [[ "$ISSUE_NUMBER" =~ ^[0-9]+$ ]]; then
        echo -e "${RED}❌ Error: Issue number must be a positive integer${NC}"
        usage
    fi
    remove_worktrees_by_issue "$ISSUE_NUMBER"
elif [ -n "$BRANCH_NAME" ]; then
    remove_worktree "$BRANCH_NAME"
else
    echo -e "${YELLOW}ℹ️  No action specified${NC}"
    echo ""
    list_worktrees
    echo -e "${BLUE}💡 Use --help for usage information${NC}"
fi
