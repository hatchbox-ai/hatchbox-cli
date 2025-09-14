#!/bin/bash

# Worktree Utilities
# Shared functions for managing git worktrees and detecting PR context

# Colors for output (will be set by sourcing script)
if [ -z "$GREEN" ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
fi

# Function to check if a worktree path indicates a PR worktree
is_pr_worktree() {
    local worktree_path="$1"
    [[ "$(basename "$worktree_path")" =~ _pr_[0-9]+$ ]]
}

# Function to extract PR number from worktree path (returns empty if not a PR worktree)
get_pr_number_from_worktree() {
    local worktree_path="$1"
    local worktree_dir="$(basename "$worktree_path")"
    
    if [[ "$worktree_dir" =~ _pr_([0-9]+)$ ]]; then
        echo "${BASH_REMATCH[1]}"
    fi
}