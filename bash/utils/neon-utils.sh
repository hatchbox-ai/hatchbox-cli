#!/bin/bash

# Neon Database Utilities
# Shared functions for managing Neon database branches across workflow scripts

# Colors for output (will be set by sourcing script)
if [ -z "$GREEN" ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
fi

# Source the env utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/env-utils.sh"

# Function to sanitize branch name for Neon (replace slashes with underscores)
sanitize_neon_branch_name() {
    local branch_name="$1"
    echo "${branch_name//\//_}"
}

# Function to check if Neon CLI is available
check_neon_cli() {
    if ! command -v neon >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

# Function to check if a Neon branch exists
check_neon_branch_exists() {
    local branch_name="$1"
    
    if ! check_neon_cli; then
        return 1
    fi
    
    if [ -z "$NEON_PROJECT_ID" ]; then
        return 1
    fi
    
    # Sanitize branch name for Neon (replace slashes with underscores)
    local neon_branch_name=$(sanitize_neon_branch_name "$branch_name")
    
    # Check if the database branch exists using list_neon_branches
    local branches_json=$(list_neon_branches)
    if [ -z "$branches_json" ]; then
        return 1
    fi
    
    if echo "$branches_json" | jq -e ".[] | select(.name == \"$neon_branch_name\")" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to list all Neon branches
list_neon_branches() {
    if ! check_neon_cli; then
        return 1
    fi
    
    if [ -z "$NEON_PROJECT_ID" ]; then
        return 1
    fi
    
    neon branches list --project-id "$NEON_PROJECT_ID" --output json 2>/dev/null
}

# Function to get connection string for a Neon branch
get_neon_connection_string() {
    local branch_name="$1"
    
    if ! check_neon_cli; then
        return 1
    fi
    
    if [ -z "$NEON_PROJECT_ID" ]; then
        return 1
    fi
    
    # Sanitize branch name for Neon (replace slashes with underscores)
    local neon_branch_name=$(sanitize_neon_branch_name "$branch_name")
    
    neon connection-string --branch "$neon_branch_name" --project-id "$NEON_PROJECT_ID" 2>/dev/null
}

# Function to find preview database branch for PRs
# Vercel creates preview branches with pattern: preview/<branch-name>
find_preview_database_branch() {
    local pr_branch="$1"
    local preview_pattern="preview/$(sanitize_neon_branch_name "$pr_branch")"
    
    echo -e "${BLUE}🔍 Looking for Vercel preview database: ${preview_pattern}${NC}" >&2
    
    if ! check_neon_cli; then
        echo -e "${YELLOW}⚠️  Neon CLI not available${NC}" >&2
        return 1
    fi
    
    if [ -z "$NEON_PROJECT_ID" ]; then
        echo -e "${YELLOW}⚠️  NEON_PROJECT_ID not set${NC}" >&2
        return 1
    fi
    
    # Check for exact preview branch match
    if check_neon_branch_exists "$preview_pattern"; then
        echo "$preview_pattern"
        return 0
    fi
    
    # Also check for variations (with underscores)
    local alt_pattern="preview_$(sanitize_neon_branch_name "$pr_branch")"
    if check_neon_branch_exists "$alt_pattern"; then
        echo "$alt_pattern"
        return 0
    fi
    
    return 1
}

# Function to create a new Neon database branch
create_neon_database_branch() {
    local branch_name="$1"
    
    if ! check_neon_cli; then
        echo -e "${YELLOW}⚠️  Skipping database branch creation (Neon CLI not available)${NC}"
        return 0
    fi
    
    # Check if required environment variables are set
    if [ -z "$NEON_API_KEY" ] || [ -z "$NEON_PROJECT_ID" ] || [ -z "$NEON_PARENT_BRANCH" ]; then
        echo -e "${YELLOW}⚠️  Warning: Neon environment variables not set. Skipping database branching.${NC}"
        echo -e "${YELLOW}     Required: NEON_API_KEY, NEON_PROJECT_ID, NEON_PARENT_BRANCH${NC}"
        return 0
    fi
    
    # Always check for existing Vercel preview database first
    local preview_branch=$(find_preview_database_branch "$branch_name")
    if [ -n "$preview_branch" ]; then
        local connection_string=$(get_neon_connection_string "$preview_branch")
        if [ -n "$connection_string" ]; then
            echo -e "${GREEN}🎉 Found existing Vercel preview database: ${preview_branch}${NC}"
            echo "$connection_string"
            return 0
        fi
    fi
    
    # Sanitize branch name for Neon (replace slashes with underscores)
    local neon_branch_name=$(sanitize_neon_branch_name "$branch_name")
    
    echo -e "${BLUE}🗂️  Creating Neon database branch...${NC}"
    echo -e "${BLUE}   Source branch: ${NEON_PARENT_BRANCH}${NC}"
    echo -e "${BLUE}   New branch: ${neon_branch_name}${NC}"
    
    # Create the database branch
    if ! neon branches create --name "$neon_branch_name" --parent "$NEON_PARENT_BRANCH" --project-id "$NEON_PROJECT_ID" >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Warning: Failed to create Neon database branch${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Database branch created successfully${NC}"
    
    # Get the connection string for the new branch
    echo -e "${BLUE}🔗 Getting connection string for new database branch...${NC}"
    local connection_string=$(get_neon_connection_string "$neon_branch_name")
    
    if [ -z "$connection_string" ]; then
        echo -e "${YELLOW}⚠️  Warning: Failed to get connection string for new database branch${NC}"
        return 1
    fi
    
    # Return the connection string for the caller to handle
    echo "$connection_string"
    return 0
}


# Function to execute Neon branch deletion
execute_neon_branch_deletion() {
    local branch_name="$1"
    local description="${2:-database branch}"
    
    if neon branches delete "$branch_name" --project-id "$NEON_PROJECT_ID" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ ${description} deleted successfully${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  Warning: Failed to delete ${description}${NC}"
        return 1
    fi
}

# Function to delete Neon database branch
delete_neon_database_branch() {
    local branch_name="$1"
    local is_preview="${2:-false}"
    
    if ! check_neon_cli; then
        return 0  # Silently skip if Neon CLI not available
    fi
    
    # Check if required environment variables are set
    if [ -z "$NEON_API_KEY" ] || [ -z "$NEON_PROJECT_ID" ]; then
        return 0  # Silently skip if environment not configured
    fi
    
    # Sanitize branch name for Neon (replace slashes with underscores)
    local neon_branch_name=$(sanitize_neon_branch_name "$branch_name")
    
    # For preview contexts, check for preview databases first
    if [ "$is_preview" = true ]; then
        local preview_branch=$(find_preview_database_branch "$branch_name")
        if [ -n "$preview_branch" ]; then
            echo -e "${YELLOW}⚠️  Found Vercel preview database: ${preview_branch}${NC}"
            echo -e "${YELLOW}💡 Preview databases are managed by Vercel and will be cleaned up automatically${NC}"
            echo -e "${YELLOW}⚠️  Manual deletion may interfere with Vercel's preview deployments${NC}"
            
            read -p "Delete preview database anyway? [y/N]: " -r
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${BLUE}🗑️  Deleting Vercel preview database: ${preview_branch}${NC}"
                execute_neon_branch_deletion "$preview_branch" "Preview database"
                return $?
            else
                echo -e "${BLUE}ℹ️  Skipping preview database deletion${NC}"
                return 0
            fi
        fi
        # If no preview database found, fall through to check regular branch
    fi
    
    # Check for regular branch (either as fallback for preview context, or primary for non-preview)
    echo -e "${BLUE}🗂️  Checking for Neon database branch: ${neon_branch_name}${NC}"
    if ! check_neon_branch_exists "$neon_branch_name"; then
        echo -e "${YELLOW}ℹ️  No database branch found for '${branch_name}'${NC}"
        return 0
    fi
    
    echo -e "${BLUE}🗑️  Deleting Neon database branch: ${neon_branch_name}${NC}"
    
    # Delete the database branch
    execute_neon_branch_deletion "$neon_branch_name" "Database branch"return $?
    return $?
}


# Function to get branch name from Neon CLI using endpoint ID
get_neon_branch_name() {
    local endpoint_id="$1"
    
    # Check if NEON_PROJECT_ID is set
    if [ -z "$NEON_PROJECT_ID" ]; then
        # Try to get project ID from neon CLI (if user is logged in)
        NEON_PROJECT_ID=$(neon projects list --output json 2>/dev/null | jq -r '.[0].id' 2>/dev/null)
        
        if [ -z "$NEON_PROJECT_ID" ] || [ "$NEON_PROJECT_ID" = "null" ]; then
            return 1
        fi
    fi
    
    # Get all branches
    local branches_json=$(list_neon_branches)
    
    if [ -z "$branches_json" ]; then
        return 1
    fi
    
    # For each branch, get its connection string and compare endpoints
    local branches=($(echo "$branches_json" | jq -r '.[].name' 2>/dev/null))
    
    for branch in "${branches[@]}"; do
        if [ -n "$branch" ]; then
            # Get connection string for this branch
            local conn_string=$(get_neon_connection_string "$branch")
            
            if [ -n "$conn_string" ]; then
                # Extract endpoint from this connection string
                local branch_endpoint=""
                if [[ "$conn_string" =~ @(ep-[a-z0-9-]+)(-pooler)?\..*\.neon\.tech ]]; then
                    branch_endpoint="${BASH_REMATCH[1]}"
                    
                    # Compare with the target endpoint
                    if [ "$branch_endpoint" = "$endpoint_id" ]; then
                        echo "$branch"
                        return 0
                    fi
                fi
            fi
        fi
    done
    
    return 1
}