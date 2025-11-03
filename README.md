# Hatchbox AI

<div align="center">
  <img src="images/hatch-box-ai.png" alt="Hatchbox AI Logo" width="300"/>
</div>

> Work on multiple issues simultaneously without thinking about it. One command launches everything you need - isolated workspaces, dev servers, VSCode, and Claude - all color-coded so you never lose track of what you're working on.

## The Problem

Working on multiple issues simultaneously is painful:

- **Branch switching breaks everything**: Stop dev server, commit/stash, checkout, restart, reinstall dependencies
- **Port conflicts**: Can't run two dev servers at once
- **Database conflicts**: Changes in one feature corrupt another
- **You lose track**: Which terminal is working on which issue? Which branch am I on?
- **Wasted mental energy**: Constantly remembering which context you're in
- **Fear of mistakes**: Easy to commit the wrong changes to the wrong branch

**Result**: Developers are forced to finish one issue completely before starting another, or constantly deal with the friction and confusion of switching contexts.

## The Solution

**One command launches everything you need:**

```bash
# Start issue #25 - opens VSCode, dev server, Claude, database - all ready in ~30 seconds
hb start 25

# Everything is now running in a color-coded workspace:
# Blue VSCode window - /Users/you/project/hatchbox-worktrees/workspace-25/
# Dev server on port 3025 - http://localhost:3025
# Claude with full context about issue #25
# Isolated database branch: issue-25 (optional, requires Neon)
```

**Work on issue #30 in parallel - just run the same command:**

```bash
# Opens a second set of everything, color-coded differently
hb start 30

# Now you have:
# Green VSCode window - /Users/you/project/hatchbox-worktrees/workspace-30/
# Dev server on port 3030 - http://localhost:3030
# Claude with full context about issue #30
# Isolated database branch: issue-30 (optional)
```

**Switch between them by switching windows - no commands needed:**
- Blue VSCode window = issue #25, you know exactly what you're working on
- Green VSCode window = issue #30, visually distinct
- Dev servers both running simultaneously on different ports
- Claude sessions each know their context
- Zero chance of committing to the wrong branch

**Finish and cleanup with one command:**

```bash
# Validates, merges, and cleans up everything automatically
hb finish 25
# ✅ Runs tests and type checking
# ✅ Merges to main branch
# ✅ Deletes workspace and database branch
# ✅ Stops dev server
```

## Why Developers Love It

### Launch Everything at Once
No more manual setup. `hb start 25` opens:
- VSCode in a color-coded window
- Dev server on a dedicated port (3025)
- Claude CLI with issue context pre-loaded (optional)
- Database branch with isolated data (optional, requires Neon)

**30 seconds from command to coding.**

### Visual Differentiation
Color-coded VSCode windows mean you instantly know which issue you're working on:
- Blue window = issue #25
- Green window = issue #30
- Orange window = issue #35

No more "wait, which branch am I on?"

Hatchbox uses a palette of 40 distinct pastel colors to ensure visual uniqueness across your workspaces.

### True Parallel Work
Run 3-4 dev servers simultaneously:
- Issue #25 on port 3025
- Issue #30 on port 3030
- Issue #35 on port 3035

Each with its own database (optional), no conflicts possible.

### Zero Mental Overhead
- No git branch switching
- No manual port management
- No database migration conflicts (with optional database branching)
- No "did I commit to the right branch?"

Just switch windows and keep coding.

### Built-in Safety
When you run `hb finish 25`:
- ✅ Runs tests and type checking
- ✅ Checks for merge conflicts
- ✅ Verifies fast-forward merge possible
- ✅ Cleans up everything automatically

**Can't accidentally break something while moving fast.**

### Works with Pull Requests Too
```bash
# Start work from an existing PR
hb start 125  # Where 125 is a PR number

# Hatchbox detects it's a PR and:
# ✅ Fetches the PR branch
# ✅ Creates workspace with PR context
# ✅ Sets up everything just like for issues
```

### GitHub Projects Integration
When you finish work, Hatchbox can automatically:
- Move issues to "Done" column
- Update issue status
- Add completion comments

### Bulk Cleanup
```bash
# Clean up multiple workspaces at once
hb cleanup 25 30 35

# Clean up by pattern
hb cleanup --all  # Remove all workspaces
```

## Real Developer Workflow

**Morning: Juggling Multiple Issues**

```bash
# Start your day with 3 issues
hb start 45  # "Add OAuth login" - opens blue VSCode, port 3045
hb start 46  # "Fix API timeout" - opens green VSCode, port 3046
hb start 47  # "Update docs" - opens orange VSCode, port 3047

# All three dev servers now running simultaneously
# All three Claude sessions ready with context (if Claude CLI installed)
```

**Mid-morning: Parallel Development**

- Blue window: Working with Claude on OAuth implementation
- Green window: Testing the API fix with Postman
- Orange window: Writing documentation updates

**Switch between them by alt-tabbing - everything is already running**

**10:30 AM: Urgent Bug Report**

```bash
# Hot fix needed immediately
hb start 99  # "Payment processing broken" - opens red VSCode, port 3099

# 20 minutes later - bug fixed
hb finish 99
# ✅ Tests pass
# ✅ Merged to main
# ✅ Workspace cleaned up
# ✅ Back to the other three issues
```

**Afternoon: Finishing Work**

```bash
# API fix is done and tested
cd ~/project/hatchbox-worktrees/workspace-46
hb finish 46
# ✅ Validated and merged

# OAuth needs more work tomorrow - leave it running
# Blue VSCode and port 3045 still active for tomorrow morning

# Docs are done
cd ~/project/hatchbox-worktrees/workspace-47
hb finish 47
# ✅ Validated and merged

# End of day: Only issue #45 still open
# Blue VSCode window still there
# Dev server still running on 3045
# Pick up right where you left off tomorrow
```

**Why This Works:**

1. **No context switching overhead** - Each workspace stays open until you finish it
2. **Visual clarity** - Color-coded windows prevent confusion and mistakes
3. **True parallelism** - Dev servers run simultaneously on different ports
4. **Safety** - `hb finish` validates everything before merging
5. **Speed** - From `hb start` to coding in ~30 seconds

## How It Works

**One command sets up everything:**

When you run `hb start 25`, Hatchbox:

1. **Fetches issue details** from GitHub
2. **Creates isolated Git worktree** (`~/project/hatchbox-worktrees/workspace-25/`)
3. **Creates database branch** (optional - `issue-25` with isolated data if Neon CLI detected)
4. **Assigns unique port** (3025 = 3000 + issue number)
5. **Configures environment** (`.env` with correct database URL and port)
6. **Opens VSCode** with a color-coded theme (if installed)
7. **Starts dev server** on the assigned port
8. **Launches Claude** with pre-loaded context about issue #25 (if Claude CLI installed)

**Total time: ~30 seconds**

**Each workspace is completely isolated:**

- **Git worktree** - Separate filesystem directory, no branch switching, no stash/unstash needed
- **Database branch** - Schema and data changes don't affect other workspaces (optional, requires Neon)
- **Unique port** - Calculated as 3000 + issue number, run 10 dev servers simultaneously if you want
- **Clean .env** - No credential mixing or port conflicts
- **Visual theme** - Color-coded so you always know which issue you're in (requires VSCode)

**What are Git worktrees?** A Git worktree is a separate working directory for the same repository. Instead of switching branches in one directory, you have multiple directories, each with its own branch checked out. This means you can have different branches in different directories simultaneously without any switching overhead.

**One command cleans up everything:**

When you run `hb finish 25`, Hatchbox:

1. **Validates** - Runs tests, type checking, linting
2. **Checks for conflicts** - Ensures clean merge
3. **Merges to main** - Fast-forward merge
4. **Cleans up** - Deletes worktree and database branch
5. **Stops servers** - Terminates dev server

**Can't forget to clean up - it's automatic.**

## Quick Start

```bash
# Install globally
npm install -g hatchbox-ai

# Make sure GitHub CLI is authenticated
gh auth login

# Start working on multiple issues
hb start 25  # Opens everything for issue #25 (blue theme)
hb start 30  # Opens everything for issue #30 (green theme)
hb start 35  # Opens everything for issue #35 (orange theme)

# Switch between them by switching windows
# All dev servers running on different ports
# All Claude sessions know their context (if Claude CLI installed)

# Finish when done
hb finish 25  # Validates, merges, cleans up
hb finish 30  # Validates, merges, cleans up

# Check what's still open
hb list
# workspace-35 | issue-35 | port 3035 | ~/project/hatchbox-worktrees/workspace-35
```

## Core Commands

```bash
hb start <issue-number>    # Create isolated workspace for an issue/PR
hb finish <issue-number>   # Merge work and cleanup workspace
hb cleanup [identifier]    # Remove one or more workspaces
hb list                    # Show active workspaces
```

**Coming Soon:**
```bash
hb switch <identifier>     # Switch to workspace context
```

## Requirements

**Essential**:
- Node.js 16+
- Git 2.5+ (for worktree support)
- GitHub CLI (`gh`) - must be authenticated with your repository

**Optional Enhancements**:
- **Claude CLI** - AI-assisted development with issue context pre-loaded
- **Neon CLI** - Isolated database branches per workspace (also supports Supabase, PlanetScale)
- **VSCode** - Color-coded editor windows for visual differentiation

The tool works with just the essentials, with enhanced features enabled automatically when optional tools are detected.

## Development Status

**Currently in Development** - Converting existing bash workflow scripts to TypeScript.

This project is migrating from proven bash scripts to a robust TypeScript implementation with:

- **Test-Driven Development** (70% coverage requirement - 95% created too many tests that were brittle/hard to maintain)
- **Type Safety** and better error handling
- **Cross-platform compatibility**
- **Enhanced Claude AI integration**

See [plan.md](./plan.md) for complete development roadmap and [docs/](./docs/) for detailed technical documentation.

## Architecture

**Core Technologies**:

- TypeScript CLI built with Commander.js
- Git worktrees for workspace isolation
- GitHub CLI integration for issues/PRs
- Database branching (Neon, Supabase, PlanetScale) - optional
- Claude CLI integration for AI assistance - optional

**Project Structure**:

```
src/
├── commands/          # CLI commands (start, finish, cleanup, list)
├── lib/              # Core business logic
├── utils/            # Utility functions
└── types/            # TypeScript definitions
```

## Contributing

This project follows Test-Driven Development (TDD). All code must:

- Be written test-first with comprehensive unit tests
- Achieve >70% code coverage
- Include regression tests against bash script behavior
- Use mock factories for all external dependencies

See [docs/testing-strategy.md](./docs/testing-strategy.md) for detailed testing requirements.

## Migration from Bash Scripts

If you're currently using the bash workflow scripts, see [docs/migration-strategy.md](./docs/migration-strategy.md) for a safe, gradual migration path.

## Success Metrics

1. **Time to Start**: < 30 seconds from `hb start 25` to coding
2. **Parallel Workflows**: Developers routinely work on 3-5 issues simultaneously
3. **Context Switch Time**: < 2 seconds (just alt-tab between windows)
4. **Mistake Prevention**: Zero "committed to wrong branch" incidents
5. **Developer Productivity**: Work on multiple issues in parallel without context switching overhead

## License

**Business Source License 1.1** - Free to use for any purpose, including commercial use within your organization. See [LICENSE](./LICENSE) for full terms.

**Key Points:**
- ✅ Use freely in your organization and commercial projects
- ✅ Modify and distribute internally
- ✅ Build paid applications with it
- ❌ Cannot resell Hatchbox itself as a product or service
- ❌ Cannot incorporate into products/services you sell to others
- ❌ Cannot offer as a hosted service or SaaS

**Converts to Apache 2.0 on 2029-01-01** - Will become fully open source automatically.

For commercial licensing inquiries, contact Adam Creeger.
