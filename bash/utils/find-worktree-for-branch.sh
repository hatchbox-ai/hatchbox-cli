#!/bin/bash

# Utility script to find worktree path for a given branch name
# Can be sourced by other scripts or called directly
# Usage: 
#   Direct call: ./find-worktree-for-branch.sh <branch-name>
#   Source and call: find_worktree_for_branch <branch-name>

# Function to find worktree path for a given branch name
find_worktree_for_branch() {
    local branch_name="$1"
    
    if [ -z "$branch_name" ]; then
        echo ""
        return 1
    fi
    
    # Use git worktree list to find the worktree that contains our branch
    local worktree_path=""
    while read -r line; do
        # Extract branch name from the format: "worktree_path commit_hash [branch_name]"
        if [[ "$line" =~ \[([^\]]+)\] ]]; then
            local worktree_branch="${BASH_REMATCH[1]}"
            if [ "$worktree_branch" = "$branch_name" ]; then
                # Extract the path (everything before the first space after a non-space character)
                worktree_path=$(echo "$line" | awk '{print $1}')
                break
            fi
        fi
    done < <(git worktree list)
    
    echo "$worktree_path"
    return 0
}

# If script is called directly (not sourced), run the function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ $# -eq 0 ]; then
        echo "Usage: $0 <branch-name>"
        exit 1
    fi
    
    find_worktree_for_branch "$1"
fi