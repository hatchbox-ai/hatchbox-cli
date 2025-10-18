# Hatchbox AI CLI - Complete Functionality Documentation

## Project Overview

**Hatchbox AI** is a TypeScript CLI tool that enables developers to work on multiple issues simultaneously with Claude AI using isolated Git worktrees and database branches. It solves the context-switching problem by creating fully isolated workspaces for each issue or pull request, preventing confusion and conflicts when using AI assistants across multiple parallel tasks.

### The Problem It Solves

- **Context Loss**: Git branch switching causes Claude to lose context about what you're working on
- **Database Conflicts**: Multiple features can't safely modify the same database simultaneously
- **Port Conflicts**: Multiple dev servers can't run on the same port
- **AI Confusion**: Claude mixes up changes between different issues when switching branches

### The Solution

Hatchbox creates isolated "hatchboxes" - complete development environments for each issue that include:
- Isolated Git worktrees (no branch switching needed)
- Separate database branches (using Neon/Supabase/PlanetScale)
- Unique port assignments (3000 + issue number)
- Dedicated .env configurations
- Clear Claude AI context for each workspace

---

## Available Commands

### 1. `hb start [identifier]` - Create Isolated Workspace

**Purpose**: Create a new isolated workspace (hatchbox) for an issue, PR, or branch.

**Usage**:
```bash
hb start 25              # Start issue #25
hb start pr/42           # Start PR #42
hb start my-feature      # Start custom branch
hb start                 # Interactive prompt for identifier
```

**Options**:
- `--claude` - Enable Claude integration (default: true)
- `--no-claude` - Disable Claude integration
- `--code` - Enable VSCode (default: true)
- `--no-code` - Disable VSCode
- `--dev-server` - Enable dev server in terminal (default: true)
- `--no-dev-server` - Disable dev server

**What It Does**:
1. **Input Detection & Validation**:
   - Detects if input is an issue number, PR number, or branch name
   - Validates against GitHub (checks if issue/PR exists and is open)
   - Handles PR-specific formats: `pr/123`, `PR-123`, `PR/123`

2. **GitHub Integration**:
   - Fetches issue/PR details from GitHub API
   - Generates AI-powered branch names using Claude (for issues)
   - Uses existing branch names (for PRs)
   - Moves issue to "In Progress" status in GitHub Projects

3. **Worktree Creation**:
   - Creates Git worktree in parent directory with naming pattern:
     - Issues: `feat/issue-{num}-{description}` or similar
     - PRs: `{branch-name}_pr_{num}`
     - Branches: `{branch-name}`
   - Checks for existing worktrees and reuses them if found

4. **Environment Setup**:
   - Copies main `.env` file to worktree
   - Sets unique `PORT` variable (3000 + issue/PR number)
   - Detects project capabilities (CLI, web server)
   - Installs dependencies in worktree

5. **Database Branching** (if configured):
   - Creates isolated Neon database branch for the worktree
   - Checks for existing Vercel preview databases first
   - Updates `DATABASE_URL` in worktree's `.env`
   - Sanitizes branch names (replaces `/` with `_`)

6. **CLI Isolation** (for CLI projects):
   - Creates symlinks in `~/hatchbox-bin` for workspace-specific CLI commands
   - Prevents CLI commands from different worktrees from conflicting

7. **Visual Differentiation**:
   - Generates unique color from branch name (deterministic hash)
   - Sets VSCode title bar color in workspace settings
   - Applies terminal color when launching (for iTerm2/compatible terminals)

8. **Component Launching**:
   - **Claude**: Opens Claude CLI in new terminal with context about the issue/PR
   - **VSCode**: Opens VSCode in the worktree directory
   - **Dev Server**: Starts development server in new terminal (if web project)
   - All components are optional and can be disabled via flags

**Example Output**:
```
✅ Validated input: Issue #25
Creating git worktree...
Copied main .env file to worktree
Database branch ready: feat_issue-25-auth-feature
Applied VSCode title bar color: #4A90E2 for branch: feat/issue-25-auth-feature
Moving issue to In Progress...
✅ Created hatchbox: issue-25 at /path/to/parent/feat-issue-25-auth-feature
   Branch: feat/issue-25-auth-feature
   Port: 3025
   Title: Add OAuth authentication feature
```

---

### 2. `hb finish [identifier]` - Merge Work and Cleanup Workspace

**Purpose**: Complete work on an issue/PR, merge changes, and cleanup resources.

**Usage**:
```bash
hb finish 25           # Finish issue #25
hb finish pr/42        # Finish PR #42
hb finish              # Auto-detect from current directory
```

**Options**:
- `-f, --force` - Skip confirmation prompts
- `-n, --dry-run` - Preview actions without executing
- `--pr <number>` - Treat input as PR number
- `--skip-build` - Skip post-merge build verification

**What It Does**:

#### For Issues/Branches (Traditional Workflow):
1. **Pre-merge Validation**:
   - Runs TypeScript type checking (`tsc --noEmit`)
   - Runs linter (`eslint` or equivalent)
   - Runs test suite
   - Fails if any validation fails (Claude can help fix errors)

2. **Auto-commit Uncommitted Changes**:
   - Detects uncommitted changes (staged and unstaged)
   - Creates commit with message format: `"WIP: Auto-commit before merge\n\nFixes #{issue-number}"`
   - Only commits if validation passed

3. **Rebase and Merge**:
   - Rebases feature branch on main
   - Switches to main branch
   - Performs fast-forward merge
   - Ensures no merge commits (clean history)

4. **Post-merge Build** (CLI projects only):
   - Runs build in main worktree to verify merged code
   - Can be skipped with `--skip-build`

5. **Resource Cleanup**:
   - Removes worktree directory
   - Deletes feature branch
   - Kills any running dev servers on the port
   - Deletes Neon database branch (if configured)
   - Removes CLI symlinks (if CLI project)

#### For Pull Requests (PR Workflow):
- **Open PRs**:
  - Commits any uncommitted changes
  - Pushes changes to remote branch
  - Keeps worktree active for continued work
  - Does NOT merge or cleanup

- **Closed/Merged PRs**:
  - Skips directly to cleanup
  - Warns about uncommitted changes (requires `--force`)
  - Removes worktree and resources
  - Deletes local branch

**Auto-detection from Current Directory**:
- Detects PR from directory pattern: `_pr_{number}`
- Detects issue from pattern: `issue-{number}`
- Falls back to branch name extraction

**Example Output**:
```
Validated input: Issue #25 (auto-detected)
Running pre-merge validations...
✓ Type check passed
✓ Lint passed
✓ Tests passed
All validations passed
Validation passed, auto-committing uncommitted changes...
Changes committed successfully
Rebasing branch on main...
Branch rebased successfully
Performing fast-forward merge...
Fast-forward merge completed successfully
Running post-merge build...
Post-merge build completed successfully
Starting post-merge cleanup...
Cleanup operations:
  ✓ Stopped dev server on port 3025
  ✓ Removed worktree: /path/to/worktree
  ✓ Deleted branch: feat/issue-25-auth-feature
  ✓ Database branch cleaned up: feat_issue-25-auth-feature
  ✓ Removed CLI symlinks: hb -> ~/hatchbox-bin/hb-25
Post-merge cleanup completed successfully
```

---

### 3. `hb cleanup [identifier]` - Remove Workspaces

**Purpose**: Remove worktrees and associated resources without merging.

**Usage**:
```bash
hb cleanup 25              # Cleanup by issue number
hb cleanup my-branch       # Cleanup by branch name
hb cleanup -l              # List all worktrees
hb cleanup -a              # Remove all worktrees (with confirmation)
hb cleanup -i 25           # Cleanup all branches for issue #25
```

**Options**:
- `-l, --list` - List all worktrees
- `-a, --all` - Remove all worktrees (interactive confirmation)
- `-i, --issue <number>` - Cleanup by issue number (finds all related branches)
- `-f, --force` - Skip confirmations and force removal
- `--dry-run` - Show what would be done without doing it

**What It Does**:

#### Single Worktree Cleanup:
1. Validates cleanup safety (not on current branch, etc.)
2. First confirmation: Remove worktree?
3. Removes worktree directory
4. Kills dev server processes on the port
5. Deletes database branch (if configured)
6. Second confirmation: Also delete the branch?
7. Deletes Git branch (if confirmed or `--force`)

#### Issue-based Cleanup (`-i` flag):
1. Finds all branches matching issue number patterns:
   - `issue-{num}`, `{num}-*`, `feat-{num}`, `fix-{num}`, etc.
2. Shows preview of all branches to be cleaned up
3. Batch confirmation for all worktrees
4. Processes each branch sequentially:
   - Removes worktree (if exists)
   - Deletes database branch (if exists)
   - Deletes Git branch
5. Reports statistics at end

**Safety Features**:
- Won't delete branches with uncommitted changes (unless `--force`)
- Won't delete unmerged branches (unless `--force`)
- Warns about Vercel preview databases before deletion
- Two-stage confirmation for branch deletion

**Example Output**:
```
Preparing to cleanup worktree: issue-25
Remove this worktree? (Y/n) y
Cleanup operations:
  ✓ Stopped dev server on port 3025
  ✓ Removed worktree: /path/to/worktree
  ✓ Database branch cleaned up: feat_issue-25-auth-feature
Also delete the branch? (Y/n) y
Branch deleted: feat/issue-25-auth-feature
Cleanup completed successfully
```

---

### 4. `hb list` - Show Active Workspaces

**Purpose**: List all active Git worktrees and their details.

**Usage**:
```bash
hb list           # Human-readable list
hb list --json    # JSON output
```

**Options**:
- `--json` - Output as JSON

**What It Does**:
- Lists all Git worktrees using `git worktree list`
- Displays formatted information:
  - Branch name
  - Worktree path
  - Current commit hash
  - Whether it's the main worktree

**Example Output**:
```
Active workspaces:
  feat/issue-25-auth-feature
    Path: /path/to/parent/feat-issue-25-auth-feature
    Commit: abc123d feat: Add OAuth provider setup
  fix/issue-26-timeout-bug
    Path: /path/to/parent/fix-issue-26-timeout-bug
    Commit: def456e fix: Increase API timeout
```

---

### 5. `hb switch <identifier>` - Switch to Workspace Context

**Purpose**: Switch to workspace context (planned feature).

**Status**: Not yet implemented

**Planned Functionality**:
- Change to worktree directory
- Set up shell environment for workspace
- Load workspace-specific environment variables

---

### 6. `hb test-github <identifier>` - Test GitHub Integration

**Purpose**: Test and debug GitHub API integration.

**Usage**:
```bash
hb test-github 25           # Test with issue #25
hb test-github pr/42        # Test with PR #42
hb test-github 50 --no-claude  # Skip Claude for branch name
```

**What It Does**:
1. Detects input type (issue vs PR)
2. Fetches from GitHub API
3. Generates branch name (using Claude if enabled)
4. Extracts context for Claude
5. Displays all information

**Example Output**:
```
Testing GitHub Integration

Detecting input type...
   Type: issue
   Number: 25
Fetching from GitHub...
   Issue #25: Add OAuth authentication feature
   State: open
   Labels: enhancement, high-priority
   URL: https://github.com/user/repo/issues/25
Generating branch name...
   Branch: feat/issue-25-oauth-authentication
Extracting context for Claude...
   GitHub Issue #25: Add OAuth authentication feature
   State: open

All GitHub integration tests passed!
```

---

### 7. `hb test-claude` - Test Claude Integration

**Purpose**: Test and debug Claude AI integration.

**Usage**:
```bash
hb test-claude                          # Run all tests
hb test-claude --detect                 # Test CLI detection
hb test-claude --version                # Get Claude version
hb test-claude --branch "Add auth"      # Test branch name generation
hb test-claude --launch "Say hello"     # Launch Claude with prompt
hb test-claude --template issue         # Test template loading
```

**Options**:
- `--detect` - Test Claude CLI detection
- `--version` - Get Claude CLI version
- `--branch <title>` - Test branch name generation
- `--issue <number>` - Issue number for branch generation (default: 123)
- `--launch <prompt>` - Launch Claude with a prompt
- `--interactive` - Launch Claude interactively (with --launch)
- `--template <name>` - Test template loading (issue/pr/regular)

**What It Does**:
1. Detects if Claude CLI is installed
2. Gets Claude version
3. Tests branch name generation
4. Tests Claude launching (headless or interactive)
5. Tests prompt template loading

---

### 8. `hb test-neon` - Test Neon Database Integration

**Purpose**: Test and debug Neon database integration.

**Usage**:
```bash
hb test-neon
```

**What It Does**:
1. Loads environment variables
2. Displays Neon configuration (NEON_PROJECT_ID, NEON_PARENT_BRANCH)
3. Tests Neon CLI availability
4. Tests Neon CLI authentication
5. Lists database branches in the project

**Example Output**:
```
Testing Neon Integration

0. Loading environment variables...
   Loaded 15 environment variables
1. Environment Variables:
   NEON_PROJECT_ID: ep-abc-123
   NEON_PARENT_BRANCH: main
2. Creating NeonProvider...
   NeonProvider created successfully
3. Testing Neon CLI availability...
   Neon CLI is available
4. Testing Neon CLI authentication...
   Neon CLI is authenticated
5. Testing branch listing...
   Found 3 branches:
     - main
     - preview/feat-auth
     - dev-branch

Neon integration test complete!
```

---

### 9. `hb test-webserver <issue-number>` - Test Web Server Detection

**Purpose**: Detect and manage web server processes running on workspace ports.

**Usage**:
```bash
hb test-webserver 25              # Test port 3025
hb test-webserver 25 --kill       # Kill server on port 3025
```

**Options**:
- `--kill` - Kill the web server if detected

**What It Does**:
- Calculates port from issue number (3000 + issue number)
- Detects processes listening on that port
- Identifies process type (next-server, node, etc.)
- Optionally kills the process

---

## Core Functionality & Features

### GitHub Integration

**GitHubService** (`src/lib/GitHubService.ts`)

**Capabilities**:
- **Issue/PR Detection**: Automatically detects if input is issue or PR number
- **Issue Fetching**: Retrieves issue details from GitHub API
- **PR Fetching**: Retrieves pull request details including branch name
- **State Validation**: Checks if issues/PRs are open/closed and prompts for confirmation
- **Branch Name Generation**:
  - Uses Claude AI to generate semantic branch names from issue titles
  - Falls back to simple format if Claude unavailable
  - Strategies: `ClaudeBranchNameStrategy` (AI-powered) or `SimpleBranchNameStrategy` (rule-based)
- **GitHub Projects Integration**:
  - Moves issues to "In Progress" status automatically
  - Supports multiple projects per repository
  - Handles custom status field names
  - Requires `project` scope in GitHub CLI
- **Context Extraction**: Formats issue/PR data for Claude context

**GitHub CLI Commands Used**:
- `gh api graphql` - Fetch issue/PR data
- `gh repo view` - Get repository information
- `gh project list` - List projects for repository
- `gh project item-list` - List items in project
- `gh project field-list` - List fields in project
- `gh api graphql -f query=...` - Update project item status

---

### Git Worktree Management

**GitWorktreeManager** (`src/lib/GitWorktreeManager.ts`)

**Capabilities**:
- **Worktree Creation**: Creates isolated worktrees with custom naming conventions
- **Worktree Listing**: Lists all active worktrees with formatting
- **Worktree Finding**:
  - Find worktree by issue number
  - Find worktree by PR number and branch
  - Find worktree by branch name
- **Path Generation**:
  - Generates worktree paths in parent directory
  - Handles PR naming: `{branch}_pr_{number}`
  - Handles issue naming: follows branch name pattern
- **Worktree Removal**: Safely removes worktrees with validation
- **Repository Information**: Gets current branch, remote, and repo status

**Git Commands Used**:
- `git worktree add` - Create new worktree
- `git worktree list` - List all worktrees
- `git worktree remove` - Remove worktree
- `git branch -d` - Delete branch
- `git branch -D` - Force delete branch
- `git rev-parse` - Get repository information
- `git symbolic-ref` - Get current branch
- `git remote get-url` - Get remote URL

---

### Database Management

**DatabaseManager** (`src/lib/DatabaseManager.ts`)
**NeonProvider** (`src/lib/providers/NeonProvider.ts`)

**Capabilities**:
- **Conditional Execution**: Only creates database branches when:
  1. NEON environment variables are configured
  2. `.env` file contains `DATABASE_URL` or `DATABASE_URI`
- **Neon Integration**:
  - Creates isolated database branches from parent branch
  - Checks for existing Vercel preview databases first
  - Sanitizes branch names (replaces `/` with `_`)
  - Provides connection strings for branches
  - Deletes branches with preview protection
- **CLI Detection**: Checks if Neon CLI is installed and authenticated
- **Branch Listing**: Lists all database branches in project
- **Preview Database Handling**:
  - Detects `preview/{branch}` and `preview_{branch}` patterns
  - Warns before deleting preview databases (managed by Vercel)
  - Requires user confirmation for preview deletion

**Neon CLI Commands Used**:
- `neon me` - Check authentication
- `neon branches list` - List branches
- `neon branches create` - Create branch
- `neon branches delete` - Delete branch
- `neon connection-string` - Get connection string

**Provider Pattern**: Abstracted to support multiple providers (Supabase, PlanetScale planned)

---

### Environment Management

**EnvironmentManager** (`src/lib/EnvironmentManager.ts`)

**Capabilities**:
- **File Operations**:
  - Read `.env` files into key-value maps
  - Write key-value maps to `.env` files
  - Copy `.env` files between locations
  - Set/update individual environment variables
- **Port Management**:
  - Calculates unique ports: 3000 + issue/PR number
  - Sets `PORT` variable in worktree `.env`
  - Ensures no port conflicts between workspaces
- **Variable Updates**:
  - Updates existing variables in place
  - Appends new variables to end of file
  - Preserves file formatting and comments

**Uses**: `dotenv-flow` for loading `.env` files into `process.env`

---

### Claude AI Integration

**ClaudeService** (`src/lib/ClaudeService.ts`)
**ClaudeContextManager** (`src/lib/ClaudeContextManager.ts`)
**PromptTemplateManager** (`src/lib/PromptTemplateManager.ts`)

**Capabilities**:
- **CLI Detection**: Checks if Claude CLI is installed
- **Version Checking**: Gets Claude CLI version
- **Branch Name Generation**: Uses Claude to generate semantic branch names from issue titles
- **Claude Launching**:
  - Headless mode: Returns response as string
  - Interactive mode: Opens Claude in new terminal
  - Supports custom prompts and templates
- **Context Preparation**:
  - Creates context objects with issue/PR details
  - Includes workspace path, port, branch name
  - Different templates for issues vs PRs vs regular branches
- **Template Management**: Loads prompt templates for different workflow types

**Claude CLI Commands Used**:
- `claude --version` - Get version
- `claude` - Launch interactive session
- `claude <prompt>` - Headless execution

---

### VSCode Integration

**VSCodeIntegration** (`src/lib/VSCodeIntegration.ts`)

**Capabilities**:
- **Title Bar Coloring**: Sets unique title bar color for each worktree
- **Settings Management**: Creates/updates `.vscode/settings.json`
- **Workspace Launch**: Opens VSCode in worktree directory
- **Color Persistence**: Colors are deterministic (same branch = same color)

**Uses**: `code` command (VSCode CLI)

---

### Terminal & Color Management

**TerminalColorManager** (`src/lib/TerminalColorManager.ts`)

**Capabilities**:
- **Color Generation**: Creates unique colors from branch names using hash
- **Color Formats**:
  - Hex format for VSCode
  - RGB format for terminals
  - Consistent across sessions (deterministic)
- **Terminal Colors**: Applies colors to iTerm2 and compatible terminals
- **Escape Sequences**: Uses ANSI/iTerm2 escape codes for terminal coloring

---

### CLI Isolation

**CLIIsolationManager** (`src/lib/CLIIsolationManager.ts`)

**Capabilities**:
- **Symlink Creation**: Creates workspace-specific CLI symlinks in `~/hatchbox-bin`
- **Naming Strategy**: Appends workspace identifier to CLI name
  - Example: `hb` → `hb-25` for issue #25
- **Collision Prevention**: Prevents CLI commands from different worktrees from conflicting
- **Bin Detection**: Parses `package.json` bin field to find CLI commands
- **Cleanup**: Removes symlinks when workspace is cleaned up

**Use Case**: For CLI tools being developed, allows testing CLI in isolation without affecting other workspaces

---

### Build & Validation

**ValidationRunner** (`src/lib/ValidationRunner.ts`)
**BuildRunner** (`src/lib/BuildRunner.ts`)

**Capabilities**:

**Pre-merge Validation**:
- Type checking (detects `tsc`, `typescript` in package.json)
- Linting (detects `eslint` in package.json)
- Testing (detects `vitest`, `jest`, `mocha` in package.json)
- Runs only applicable validators (based on project config)
- Fails fast on first error

**Post-merge Build**:
- Runs build in main worktree after successful merge
- Verifies merged code builds successfully
- Only for CLI projects (detected via `bin` field)
- Can be skipped with `--skip-build` flag

---

### Process Management

**ProcessManager** (`src/lib/process/ProcessManager.ts`)

**Capabilities**:
- **Process Detection**: Finds processes by port or pattern
- **Process Killing**: Terminates processes by PID
- **Web Server Detection**:
  - Detects Next.js servers
  - Detects generic Node servers
  - Identifies process type and PID
- **Port Calculation**: Calculates ports from issue numbers
- **Safe Termination**: Uses SIGTERM before SIGKILL

**System Commands Used**:
- `lsof -i :PORT` - Find processes on port
- `ps aux` - List all processes
- `kill` - Terminate processes

---

### Resource Cleanup

**ResourceCleanup** (`src/lib/ResourceCleanup.ts`)

**Capabilities**:
- **Safety Validation**:
  - Checks if worktree exists
  - Prevents deletion if on current branch
  - Warns about uncommitted changes
  - Checks if branch is merged
- **Comprehensive Cleanup**:
  - Removes worktree directory
  - Deletes Git branch
  - Kills dev server processes
  - Deletes database branches
  - Removes CLI symlinks
- **Operation Tracking**: Reports success/failure for each cleanup operation
- **Error Handling**: Continues cleanup even if some operations fail
- **Dry-run Support**: Shows what would be done without executing

---

### Commit Management

**CommitManager** (`src/lib/CommitManager.ts`)

**Capabilities**:
- **Change Detection**:
  - Detects staged changes
  - Detects unstaged changes
  - Detects untracked files
- **Auto-commit**:
  - Stages all changes
  - Creates commit with standard message
  - Adds "Fixes #{issue}" trailer for issues
- **Commit Format**:
  ```
  WIP: Auto-commit before merge

  Fixes #25
  ```

**Git Commands Used**:
- `git status --porcelain` - Detect changes
- `git add -A` - Stage all changes
- `git commit -m` - Create commit

---

### Merge Management

**MergeManager** (`src/lib/MergeManager.ts`)

**Capabilities**:
- **Rebase on Main**:
  - Rebases feature branch on main
  - Handles conflicts (prompts user)
- **Fast-forward Merge**:
  - Switches to main branch
  - Performs fast-forward merge
  - Validates no merge commits created
- **Safety Checks**:
  - Ensures clean working directory
  - Validates fast-forward possible
  - Prevents divergent history

**Git Commands Used**:
- `git rebase main` - Rebase on main
- `git checkout main` - Switch to main
- `git merge --ff-only` - Fast-forward merge

---

### Project Capability Detection

**ProjectCapabilityDetector** (`src/lib/ProjectCapabilityDetector.ts`)

**Capabilities**:
- **CLI Detection**: Checks for `bin` field in `package.json`
- **Web Detection**: Checks for web framework dependencies:
  - Next.js
  - React
  - Vue
  - Express
  - Fastify
  - Other web frameworks
- **Bin Parsing**: Extracts CLI entry points from `package.json`

**Returns**:
- List of capabilities: `['cli', 'web']`
- Bin entries: `{ 'hb': './dist/cli.js' }`

---

### Workspace Launcher

**HatchboxLauncher** (`src/lib/HatchboxLauncher.ts`)

**Capabilities**:
- **Component Orchestration**: Launches Claude, VSCode, and dev server in parallel
- **Conditional Launch**: Only launches enabled components
- **Error Handling**: Continues even if some components fail
- **Terminal Creation**: Opens new terminal windows for Claude and dev server
- **Dev Server Detection**: Detects `dev`, `start`, or `serve` scripts

---

## Architecture Overview

### Project Structure

```
src/
├── cli.ts                    # Main CLI entry point (Commander.js)
├── commands/                 # Command implementations
│   ├── start.ts             # Start command (create workspace)
│   ├── finish.ts            # Finish command (merge & cleanup)
│   ├── cleanup.ts           # Cleanup command (remove workspaces)
│   ├── test-github.ts       # Test GitHub integration
│   ├── test-webserver.ts    # Test web server detection
│   └── index.ts             # Command exports
├── lib/                     # Core business logic
│   ├── HatchboxManager.ts   # Main orchestrator
│   ├── GitWorktreeManager.ts # Git worktree operations
│   ├── GitHubService.ts     # GitHub API integration
│   ├── DatabaseManager.ts   # Database provider orchestration
│   ├── EnvironmentManager.ts # .env file management
│   ├── ClaudeService.ts     # Claude CLI integration
│   ├── ClaudeContextManager.ts # Claude context preparation
│   ├── ValidationRunner.ts  # Pre-merge validation
│   ├── CommitManager.ts     # Git commit operations
│   ├── MergeManager.ts      # Git merge operations
│   ├── BuildRunner.ts       # Post-merge build
│   ├── ResourceCleanup.ts   # Cleanup orchestration
│   ├── ProcessManager.ts    # Process detection & killing
│   ├── ProjectCapabilityDetector.ts # Capability detection
│   ├── CLIIsolationManager.ts # CLI symlink management
│   ├── VSCodeIntegration.ts # VSCode integration
│   ├── TerminalColorManager.ts # Terminal coloring
│   ├── PromptTemplateManager.ts # Prompt templates
│   └── providers/
│       └── NeonProvider.ts  # Neon database implementation
├── utils/                   # Utility functions
│   ├── git.ts               # Git utility functions
│   ├── github.ts            # GitHub CLI utilities
│   ├── claude.ts            # Claude CLI utilities
│   ├── env.ts               # Environment utilities
│   ├── logger.ts            # Logging utilities
│   ├── prompt.ts            # User prompt utilities
│   ├── color.ts             # Color generation
│   ├── terminal.ts          # Terminal operations
│   ├── vscode.ts            # VSCode operations
│   ├── package-json.ts      # package.json parsing
│   ├── package-manager.ts   # pnpm/npm/yarn detection
│   ├── dev-server.ts        # Dev server utilities
│   └── IdentifierParser.ts  # Input parsing
└── types/                   # TypeScript type definitions
    ├── hatchbox.ts          # Hatchbox types
    ├── github.ts            # GitHub types
    ├── worktree.ts          # Worktree types
    ├── environment.ts       # Environment types
    ├── process.ts           # Process types
    ├── cleanup.ts           # Cleanup types
    └── index.ts             # Type exports
```

### Design Patterns

**1. Command Pattern**: Each CLI command is a separate class with `execute()` method

**2. Strategy Pattern**: Branch name generation uses strategy pattern (Claude vs Simple)

**3. Provider Pattern**: Database operations abstracted behind `DatabaseProvider` interface

**4. Dependency Injection**: All classes accept dependencies via constructor for testability

**5. Service Layer**: Core business logic separated into focused service classes

**6. Manager Pattern**: High-level orchestrators (HatchboxManager, ResourceCleanup) coordinate multiple services

---

## Key Integrations

### 1. GitHub CLI (`gh`)

**Requirements**:
- Must be installed and authenticated
- Project scope required for GitHub Projects integration (`gh auth refresh -s project`)

**Used For**:
- Fetching issue/PR details
- Detecting issue vs PR
- Moving issues to "In Progress" in GitHub Projects
- Accessing GitHub GraphQL API

---

### 2. Git

**Requirements**:
- Git 2.5+ (for worktree support)

**Used For**:
- Creating/removing worktrees
- Branch management
- Commit operations
- Merge operations
- Repository information

---

### 3. Neon Database

**Requirements** (optional):
- Neon CLI (`neonctl`) installed and authenticated
- Environment variables: `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH`
- `.env` file must contain `DATABASE_URL` or `DATABASE_URI`

**Used For**:
- Creating isolated database branches
- Deleting database branches
- Getting connection strings
- Managing preview databases

---

### 4. Claude AI

**Requirements** (optional):
- Claude CLI installed
- Authenticated with Anthropic

**Used For**:
- Generating semantic branch names from issue titles
- Providing AI assistance in workspaces
- Interactive development with context

---

### 5. VSCode

**Requirements** (optional):
- VSCode installed with `code` command

**Used For**:
- Opening workspaces in VSCode
- Setting title bar colors
- Managing workspace settings

---

### 6. Terminal Emulators

**Supported**:
- iTerm2 (full color support)
- macOS Terminal (basic support)
- Other terminals (graceful degradation)

**Used For**:
- Opening new terminal windows
- Applying terminal colors
- Running dev servers

---

## Workflow Examples

### Example 1: Simple Issue Workflow

```bash
# Start working on issue #25
$ hb start 25
✅ Validated input: Issue #25
Creating git worktree...
Database branch ready: feat_issue-25-auth-feature
Moving issue to In Progress...
✅ Created hatchbox: issue-25
   Branch: feat/issue-25-oauth-authentication
   Port: 3025
   Title: Add OAuth authentication feature

# Claude, VSCode, and dev server are now open
# Work on the issue...

# Finish when done
$ hb finish 25
Running pre-merge validations...
All validations passed
Fast-forward merge completed successfully
Post-merge cleanup completed successfully
```

---

### Example 2: PR Workflow

```bash
# Start working on PR #42
$ hb start pr/42
✅ Validated input: PR #42
Found existing worktree, reusing: /path/to/feat-api-improvement_pr_42
✅ Reused existing hatchbox: pr-42
   Branch: feat/api-improvement
   Port: 3042

# Make changes...

# Push changes (PR stays open)
$ hb finish pr/42
PR #42 is OPEN - will push changes and keep worktree active
Pushing changes to remote...
Changes pushed to PR #42
Worktree remains active for continued work

# Later, after PR is merged on GitHub
$ hb finish pr/42
PR #42 is MERGED - skipping to cleanup
PR #42 cleanup completed
```

---

### Example 3: Multiple Parallel Issues

```bash
# Start three issues
$ hb start 25
$ hb start 26
$ hb start 27

# List active workspaces
$ hb list
Active workspaces:
  feat/issue-25-oauth-authentication
    Path: /parent/feat-issue-25-oauth-authentication
    Port: 3025
  fix/issue-26-timeout-bug
    Path: /parent/fix-issue-26-timeout-bug
    Port: 3026
  docs/issue-27-api-documentation
    Path: /parent/docs-issue-27-api-documentation
    Port: 3027

# Work on each independently in separate terminals
```

---

### Example 4: Cleanup All Branches for Issue

```bash
# Created multiple branches while working on issue #25
$ git branch | grep 25
  feat/issue-25-oauth-authentication
  fix/issue-25-validation
  refactor/issue-25-cleanup

# Cleanup all at once
$ hb cleanup -i 25
Found 3 branch(es) related to issue #25:
  🌿 feat/issue-25-oauth-authentication (has worktree)
  🌿 fix/issue-25-validation (branch only)
  🌿 refactor/issue-25-cleanup (branch only)
Remove 1 worktree(s)? (Y/n) y
Processing branch: feat/issue-25-oauth-authentication
  Worktree removed: feat/issue-25-oauth-authentication
  Branch deleted: feat/issue-25-oauth-authentication
Processing branch: fix/issue-25-validation
  Branch deleted: fix/issue-25-validation
Processing branch: refactor/issue-25-cleanup
  Branch deleted: refactor/issue-25-cleanup

Completed cleanup for issue #25:
   📁 Worktrees removed: 1
   🌿 Branches deleted: 3
```

---

## Development Status

**Current Status**: Active development, migrating from proven bash scripts to TypeScript

**Implemented Features**:
- ✅ Start command (full workflow)
- ✅ Finish command (issue and PR workflows)
- ✅ Cleanup command (single and bulk)
- ✅ List command
- ✅ GitHub integration
- ✅ Neon database integration
- ✅ Claude AI integration
- ✅ VSCode integration
- ✅ Terminal color synchronization
- ✅ CLI isolation
- ✅ Pre-merge validation
- ✅ Post-merge build
- ✅ Process management
- ✅ Resource cleanup

**Planned Features**:
- ⏳ Switch command (context switching)
- ⏳ Supabase provider
- ⏳ PlanetScale provider
- ⏳ Persistent hatchbox metadata
- ⏳ Workspace templates

---

## Testing Strategy

**Test Coverage**: 70% minimum (95% was too brittle)

**Test Types**:
- **Unit Tests**: Every class/function with mocked externals
- **Integration Tests**: Command workflows with temporary repos
- **Property-based Tests**: Edge case discovery (using fast-check)

**Mock Factories**:
- MockGitProvider
- MockGitHubProvider
- MockNeonProvider
- MockClaudeProvider
- MockFileSystem
- MockProcessManager

**Test Files Pattern**: `*.test.ts` alongside source files

---

## Requirements

- **Node.js**: 16.0.0+
- **Git**: 2.5+ (for worktree support)
- **GitHub CLI** (`gh`): Latest version
- **Claude CLI** (optional): For AI features
- **Neon CLI** (`neonctl`) (optional): For database branching
- **VSCode** (optional): For editor integration
- **iTerm2** (optional): For best terminal color support

---

## Installation

```bash
# Install globally
npm install -g hatchbox-ai

# Or use with npx
npx hb start 25
```

---

## Configuration

### Required (for basic features):
- GitHub CLI authenticated: `gh auth login`

### Optional (for enhanced features):

**Database Branching (Neon)**:
```bash
# Install Neon CLI
npm install -g neonctl

# Authenticate
neon auth

# Set environment variables
export NEON_PROJECT_ID="your-project-id"
export NEON_PARENT_BRANCH="main"
```

**GitHub Projects Integration**:
```bash
# Add project scope
gh auth refresh -s project
```

**Claude AI**:
```bash
# Install Claude CLI (varies by platform)
# Authenticate with Anthropic
```

---

## Success Metrics

1. **Developer Productivity**: Work on 3-5 issues in parallel without context switching
2. **Claude Effectiveness**: Zero confusion between different issues
3. **Time to Start**: < 30 seconds from issue number to Claude-ready workspace
4. **Adoption**: Works with any Git + Claude workflow
5. **Integration**: Enhances with GitHub, Neon, Supabase when available

---

## Technical Highlights

### Port Assignment Strategy
- Base port: 3000
- Issue/PR ports: 3000 + issue/PR number
- Example: Issue #25 → Port 3025
- Prevents conflicts when running multiple dev servers

### Worktree Naming Conventions
- Issues: Generated by Claude from issue title (e.g., `feat/issue-25-oauth-authentication`)
- PRs: `{branch-name}_pr_{number}` (e.g., `feat-api-improvement_pr_42`)
- Branches: Use provided name as-is

### Database Branch Naming
- Sanitized: Replaces `/` with `_` (e.g., `feat/issue-25` → `feat_issue-25`)
- Preview detection: Checks for `preview/{branch}` and `preview_{branch}` patterns
- Managed by Vercel: Warns before deleting preview databases

### Color Generation
- Deterministic: Same branch name always produces same color
- Uses hash function for consistency
- Range: Full spectrum of hues, medium saturation/lightness
- Formats: Hex for VSCode, RGB for terminals

### Error Handling Philosophy
- **Fatal errors**: Missing requirements, GitHub API failures, merge conflicts
- **Warnings**: Database setup failures, CLI symlink failures, color application failures
- **Graceful degradation**: Features degrade gracefully when optional dependencies missing

---

## License

MIT

---

**Generated**: 2025-10-11
**Version**: 0.1.0
**Repository**: https://github.com/acreeger/hatchbox-ai
