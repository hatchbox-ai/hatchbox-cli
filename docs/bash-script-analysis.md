# Bash Script Analysis

## Overview
This document provides a comprehensive analysis of the existing bash scripts that need to be ported to TypeScript for Hatchbox AI.

## Script Inventory

### Main Workflow Scripts

#### 1. `new-branch-workflow.sh` (425 lines)
**Purpose**: Creates isolated workspace for an issue or PR

**Key Functionality**:
- **Input Processing**: Handles issue numbers, PR numbers, or custom branch names
- **GitHub Integration**:
  - Detects if input is PR or issue using `gh pr view` and `gh issue view`
  - Fetches issue/PR details (title, state, branch name)
  - Validates issue/PR state (warns on closed/merged)
- **Branch Management**:
  - Auto-generates branch names using Claude AI for issues
  - Uses existing branch name for PRs
  - Creates new branch if doesn't exist
  - Handles branch switching conflicts
- **Worktree Operations**:
  - Creates worktree with sanitized directory name
  - Adds `_pr_N` suffix for PR worktrees
  - Handles existing worktree conflicts
- **Environment Setup**:
  - Copies `.env` file to worktree
  - Calculates unique port (3000 + issue/PR number)
  - Updates `NEXT_PUBLIC_SERVER_URL` with calculated port
- **Dependencies**: Installs with `pnpm install --frozen-lockfile`
- **Database Integration**: Creates Neon database branch
- **Claude Integration**:
  - Launches Claude with issue/PR context
  - Uses different prompts for issues vs PRs
  - Sets permission mode and model
  - Provides detailed context about the workspace

**Dependencies**:
- GitHub CLI (`gh`)
- Claude CLI (`claude`)
- `pnpm`
- Neon CLI
- `jq` for JSON parsing

**Environment Variables**:
- `DISABLE_AUTO_UPDATE`
- Database environment variables

#### 2. `merge-and-clean.sh` (1211 lines)
**Purpose**: Completes work and cleans up workspace

**Key Functionality**:
- **Argument Parsing**: Supports `--force`, `--dry-run`, `--pr <number>` flags
- **PR Workflow**:
  - Fetches PR status from GitHub
  - If closed/merged: cleans up worktree only
  - If open: commits changes and pushes to remote
- **Issue Workflow**:
  - Auto-detects issue number from branch name
  - Finds and validates worktree
  - Pre-merge validation (typecheck, lint, tests)
  - Claude-assisted error fixing for failed checks
- **Migration Handling** (Payload CMS specific):
  - Detects branch-specific migrations
  - Removes conflicting migrations before merge
  - Database safety checks
  - Post-merge migration regeneration
- **Merge Process**:
  - Auto-commits uncommitted changes with Claude-generated messages
  - Rebases branch on main
  - Claude-assisted conflict resolution
  - Fast-forward only merge validation
  - Dependency installation after merge
- **Cleanup**:
  - Kills dev servers on calculated ports
  - Removes worktrees and branches
  - Cleans up database branches

**Dependencies**:
- All from `new-branch-workflow.sh`
- `lsof` for port checking
- `ps` for process inspection

#### 3. `cleanup-worktree.sh` (399 lines)
**Purpose**: Removes workspaces and associated resources

**Key Functionality**:
- **Multiple Modes**:
  - `--list`: Show all worktrees
  - `--all`: Remove all worktrees
  - `--issue N`: Remove by issue number
  - `--force`: Skip confirmations
- **Issue-based Cleanup**:
  - Finds all branches matching issue number patterns
  - Removes both worktrees and local branches
  - Handles branch-only and worktree-only scenarios
- **Safety Features**:
  - Interactive confirmations
  - Safe branch deletion (merged only)
  - Database branch cleanup integration
- **Batch Operations**:
  - Processes multiple worktrees
  - Reports success/failure counts
  - Offers branch cleanup after worktree removal

#### 4. `merge-current-issue.sh` (93 lines)
**Purpose**: Merges current work from within a worktree

**Key Functionality**:
- **Context Detection**:
  - Detects current branch and issue/PR number
  - Identifies if in PR worktree by `_pr_N` suffix
  - Extracts issue number from branch name patterns
- **Navigation**: Changes to main worktree directory
- **Delegation**: Calls `merge-and-clean.sh` with appropriate arguments

### Utility Scripts

#### 1. `utils/find-worktree-for-branch.sh` (44 lines)
**Purpose**: Locates worktree path for a given branch

**Key Functionality**:
- Parses `git worktree list` output
- Matches branch names exactly
- Returns worktree path or empty string
- Can be sourced or called directly

#### 2. `utils/worktree-utils.sh` (29 lines)
**Purpose**: PR worktree detection utilities

**Key Functionality**:
- `is_pr_worktree()`: Detects PR worktrees by `_pr_N` suffix
- `get_pr_number_from_worktree()`: Extracts PR number from path
- Shared color definitions

#### 3. `utils/env-utils.sh` (54 lines)
**Purpose**: Environment file manipulation

**Key Functionality**:
- `setEnvVar()`: Updates or adds variables to .env files
- Handles existing variable replacement
- Creates .env file if doesn't exist
- Uses temporary files for atomic updates

#### 4. `utils/neon-utils.sh` (296 lines)
**Purpose**: Database isolation utilities

**Key Functionality**:
- **Branch Management**:
  - `create_neon_database_branch()`: Creates isolated database branches
  - `delete_neon_database_branch()`: Cleans up database branches
  - `check_neon_branch_exists()`: Validates branch existence
- **Neon CLI Integration**:
  - Wraps Neon CLI commands
  - Handles authentication and project configuration
  - Provides connection string generation
- **Preview Database Support**:
  - `find_preview_database_branch()`: Detects Vercel preview databases
  - Handles preview vs regular branch logic
- **Safety Features**:
  - Database safety checks before destructive operations
  - Branch name sanitization (slashes to underscores)
  - Graceful degradation when Neon unavailable

## Data Flow Analysis

### Workspace Creation Flow
```
User Input (issue/PR #)
  → GitHub API (fetch details)
  → Branch Name Generation (Claude AI)
  → Git Worktree Creation
  → .env File Setup (port calculation)
  → Database Branch Creation (Neon)
  → Dependency Installation
  → Claude Context Launch
```

### Merge and Cleanup Flow
```
Worktree Context Detection
  → Pre-merge Validation (tests, lint, typecheck)
  → Migration Conflict Resolution
  → Branch Rebase (with conflict resolution)
  → Fast-forward Merge
  → Post-merge Migration Regeneration
  → Resource Cleanup (worktree, database, dev server)
```

## Key Patterns and Conventions

### Naming Conventions
- **Worktree Directories**: `{branch-name-with-dashes}` or `{branch-name}_pr_{number}`
- **Database Branches**: `{branch-name-with-underscores}`
- **Branch Names**: `feat/issue-{number}-{description}` or existing PR branch
- **Port Numbers**: `3000 + issue/PR number`

### Error Handling Patterns
- Color-coded output (red for errors, yellow for warnings, green for success)
- Graceful degradation when optional tools unavailable
- Interactive confirmations for destructive operations
- Detailed error messages with suggested remediation

### Integration Points
- **GitHub CLI**: All GitHub operations go through `gh` command
- **Claude CLI**: Used for branch naming and error assistance
- **Neon CLI**: Database operations through `neon` command
- **Package Manager**: Assumes `pnpm` for dependency management
- **Terminal**: Uses `osascript` for macOS Terminal integration

## Configuration Dependencies

### Required Environment Variables
```bash
# Neon Database
NEON_API_KEY=
NEON_PROJECT_ID=
NEON_PARENT_BRANCH=

# Application
DATABASE_URL=               # Set dynamically
NEXT_PUBLIC_SERVER_URL=     # Set dynamically to calculated port
```

### Required External Tools
- `git` (with worktree support)
- `gh` (GitHub CLI)
- `claude` (Claude CLI)
- `neon` (Neon CLI) - optional
- `pnpm` - optional, graceful degradation
- `jq` - JSON parsing
- `lsof` - port checking
- `osascript` - macOS terminal integration

## Migration Complexity Assessment

### High Complexity Areas
1. **Migration Handling**: Complex Payload CMS-specific logic for detecting and resolving migration conflicts
2. **Claude Integration**: Multiple integration points with different contexts and permissions
3. **Error Recovery**: Sophisticated error handling with Claude-assisted fixes
4. **Cross-platform Shell Commands**: Heavy use of Unix utilities that need cross-platform abstractions

### Medium Complexity Areas
1. **Git Worktree Operations**: Well-defined git commands but need proper error handling
2. **GitHub Integration**: Straightforward API calls through GitHub CLI
3. **Environment Management**: File manipulation with atomic updates
4. **Database Integration**: Well-structured provider pattern

### Low Complexity Areas
1. **Argument Parsing**: Standard CLI patterns
2. **Configuration Loading**: Environment variable reading
3. **Output Formatting**: Color and emoji output
4. **Basic File Operations**: Copy, create, delete operations

## Critical Success Factors

### Must Preserve
1. **Exact Command Interfaces**: All CLI arguments and options
2. **Directory Structure**: Worktree naming and organization
3. **Environment Variables**: Names and formats
4. **Database Branch Naming**: Neon branch naming conventions
5. **Claude Context**: Issue/PR context format for Claude

### Must Improve
1. **Cross-platform Support**: Windows compatibility
2. **Error Messages**: More descriptive and actionable
3. **Performance**: Faster execution through concurrent operations
4. **Configuration**: More flexible configuration system
5. **Testing**: Comprehensive test coverage

### Can Enhance
1. **Provider Support**: Multiple database providers
2. **IDE Integration**: Beyond just terminal launching
3. **Workflow Customization**: Configurable hooks and templates
4. **Monitoring**: Workspace usage analytics
5. **Recovery**: Better cleanup of orphaned resources

This analysis provides the foundation for the TypeScript implementation, ensuring we capture all the nuanced behavior of the existing bash scripts while building a more robust and maintainable system.