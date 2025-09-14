#!/bin/bash

# Environment File Utilities
# Shared functions for manipulating .env files

# Colors for output (will be set by sourcing script)
if [ -z "$GREEN" ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
fi

# Function to set or update an environment variable in .env file
setEnvVar() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"
    
    if [ -z "$var_name" ] || [ -z "$env_file" ]; then
        echo -e "${RED}❌ Error: Variable name and env file are required${NC}" >&2
        return 1
    fi
    
    local env_line="${var_name}=${var_value}"
    
    if [ -f "$env_file" ]; then
        # File exists, check if variable already exists
        if grep -q "^${var_name}=" "$env_file"; then
            # Variable exists, replace it
            echo -e "${BLUE}📝 Updating ${var_name} in $env_file...${NC}"
            
            # Create temporary file with replacement
            grep -v "^${var_name}=" "$env_file" > "${env_file}.tmp"
            echo "$env_line" >> "${env_file}.tmp"
            mv "${env_file}.tmp" "$env_file"
            
            echo -e "${GREEN}✅ ${var_name} updated successfully${NC}"
        else
            # Variable doesn't exist, add it
            echo -e "${BLUE}📝 Adding ${var_name} to $env_file...${NC}"
            echo "$env_line" >> "$env_file"
            echo -e "${GREEN}✅ ${var_name} added successfully${NC}"
        fi
    else
        # File doesn't exist, create it
        echo -e "${BLUE}📝 Creating $env_file with ${var_name}...${NC}"
        echo "$env_line" > "$env_file"
        echo -e "${GREEN}✅ $env_file created with ${var_name}${NC}"
    fi
    
    return 0
}