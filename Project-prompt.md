Project: Convert Bash Workflows to "Hatchbox AI" - A Multi-Issue Development Tool

Overview

Convert bash workflow scripts into a public TypeScript CLI tool that enables developers to efficiently work on
multiple issues/features simultaneously with Claude AI. The tool leverages standard development tools (Git
worktrees, GitHub CLI, database branching) to create isolated workspaces that Claude can operate in without
conflicts.

The Problem This Solves

Developers using Claude for coding assistance face challenges when working on multiple issues:

- Claude might confuse contexts between different features
- Changes for issue A might accidentally affect issue B
- Database changes can conflict between branches
- Port conflicts when running multiple dev servers
- Hard to context-switch between issues while maintaining Claude's understanding

Source Files Structure

bash/
├── new-branch-workflow.sh # Creates isolated workspace for an issue
├── merge-and-clean.sh # Completes work and cleans up
├── cleanup-worktree.sh # Removes workspaces
├── merge-current-issue.sh # Merges current work
└── utils/
├── neon-utils.sh # Database isolation utilities
├── env-utils.sh # Environment isolation
├── worktree-utils.sh # Workspace management
└── find-worktree-for-branch.sh

Target Package Identity

{
"name": "hatchbox-ai",
"description": "Work on multiple issues simultaneously with Claude AI using isolated Git worktrees and databases",
"keywords": ["claude", "ai-assisted-coding", "git-worktree", "developer-productivity", "parallel-development"],
"bin": {
"hatchbox": "./dist/cli.js",
"hb": "./dist/cli.js"
}
}

Core Value Proposition

"Give Claude perfect isolation for each issue you're working on"

Each workspace gets:

- Isolated Git worktree (no branch switching needed)
- Separate database branch (no data conflicts)
- Unique port assignment (run multiple dev servers)
- Clean .env configuration (no credential mixing)
- Clear context for Claude (work on issue #25 without affecting #26)

Key Commands for Claude-Centric Workflow

# Start working on issue #25 with Claude

npx hb start 25

# → Creates worktree, database branch, sets up .env

# → Opens new terminal with Claude context:

# "You're working on issue #25. Use port 3025 for dev server."

# Start another issue in parallel

npx hb start 30

# → Completely isolated from issue #25

# → Claude can work on both simultaneously without confusion

# List all active Claude workspaces

npx hb list

# ACTIVE WORKSPACES:

# #25: feat/issue-25-add-auth (port 3025) - 2 hours ago

# #30: feat/issue-30-fix-api (port 3030) - 5 minutes ago

# Finish work on issue #25

npx hb finish 25

# → Commits, merges, cleans up worktree and database

# Quick switch for Claude context

npx hb switch 30

# → Changes to issue #30 directory

# → Shows Claude the context for this issue

Features Designed for Claude Collaboration

1. Claude Context Injection:
   // When starting a workspace, generate Claude context
   const claudeContext = {
   issue: "#25: Add authentication",
   workspace: "/path/to/worktree",
   port: 3025,
   database: "feature_branch_25",
   instructions: "You're working on issue #25. Read the issue with: gh issue view 25"
   };

// Output for copy/paste to Claude
console.log(`
📋 Claude Context for Issue #${issueNumber}:

You are working on: ${issueTitle}
  Workspace: ${workspacePath}
  Dev server port: ${port}
  Database: Isolated branch "${dbBranch}"

To read the full issue: gh issue view ${issueNumber}
To start dev server: npm run dev -- --port ${port}
`); 2. Workspace Isolation Benefits: - No Git conflicts: Each issue has its own worktree - No database conflicts: Each gets a database branch - No port conflicts: Automatic port assignment (3000 + issue number) - No context confusion: Claude knows exactly which issue it's working on - Parallel development: Work on urgent bug while feature is in progress 3. Claude-Friendly Information Display:
$ npx hb info 25

# 🤖 CLAUDE CONTEXT FOR ISSUE #25

Issue: #25 - Add user authentication
Branch: feat/issue-25-add-auth
Worktree: ~/projects/myapp-issue-25
Database: branch 'feature_25' (isolated copy of main)
Port: 3025 (for dev server)

Quick Commands:

- View issue: gh issue view 25
- See changes: git status
- Run tests: npm test
- Start server: npm run dev -- --port 3025

4. Automatic Claude Workspace Files:

# .claude-context.md (created in each worktree)

## Current Task

You are working on issue #25: Add user authentication

## Workspace Details

- Branch: feat/issue-25-add-auth
- Port for dev server: 3025
- Database: Isolated branch with clean data

## Key Commands

- `gh issue view 25` - See issue details
- `npm run dev -- --port 3025` - Start dev server
- `npm test` - Run tests

## Important Notes

- This is an isolated workspace
- Changes here don't affect other issues
- Database is a copy of production data

5. Multi-Claude Session Support:

# Open multiple terminal windows, each with different Claude context

# Terminal 1: Claude working on authentication

$ npx hb start 25 --open-with-claude

> "Claude, please implement the login flow for issue #25"

# Terminal 2: Claude working on API bug

$ npx hb start 30 --open-with-claude

> "Claude, please fix the API timeout in issue #30"

# Both Claudes work independently without conflicts

6. Smart Defaults for AI-Assisted Development:
   - Auto-generate semantic branch names from issue titles
   - Include issue description in initial context
   - Set up .claude-ignore to hide irrelevant files
   - Create CLAUDE_INSTRUCTIONS.md with project conventions

7. Integration Points:
   interface WorkspaceProvider {
   // Standard tools that Claude can leverage
   git: GitWorktreeProvider; // Git worktrees
   github: GitHubIssueProvider; // GitHub CLI
   database?: DatabaseProvider; // Neon, Supabase, etc.
   ide?: IDEProvider; // VS Code, Cursor, etc.
   }

README/Marketing for Claude Users

Hatchbox AI

Work on multiple issues simultaneously with Claude AI

Stop confusing Claude with branch switches. Start shipping features in parallel.

The Problem

When using Claude for development, switching between issues is painful:

- Git branch switching loses Claude's context
- Database changes conflict between features
- Multiple dev servers fight over ports
- Claude mixes up changes between issues

The Solution

Give Claude isolated workspaces for each issue:

# Start issue #25 with Claude

npx hatchbox start 25

# Claude now has:

# ✅ Isolated Git worktree (no branch switching)

# ✅ Separate database branch (no data conflicts)

# ✅ Dedicated port 3025 (no port conflicts)

# ✅ Clear context about issue #25

# Work on issue #30 in parallel

npx hatchbox start 30

# Claude can now work on both issues simultaneously

# in different terminal windows without any confusion

Perfect for Claude-Assisted Development

- Clear Context: Each workspace includes issue details for Claude
- No Confusion: Claude can't accidentally mix changes between issues
- Parallel Work: Multiple Claude sessions on different issues
- Standard Tools: Uses Git worktrees, GitHub CLI, and database branching
- Zero Lock-in: Just organized Git worktrees you can manage manually

Quick Start

# Install globally

npm install -g hatchbox-ai

# Or use directly with npx

npx hatchbox start 25

Real Developer Workflow

# Monday morning - start three issues

hb start 25 # Authentication feature
hb start 26 # API bug fix
hb start 27 # Documentation update

# Work with Claude on each independently

cd ~/workspace-25

> "Claude, implement OAuth login for issue #25"

cd ~/workspace-26

> "Claude, fix the timeout bug in issue #26"

# Urgent bug comes in

hb start 99

> "Claude, hot-fix the payment bug in issue #99"

# Finish and ship as completed

hb finish 99 # Merged and deployed
hb finish 26 # Bug fixed

# ... continue with 25 and 27 tomorrow

Success Metrics

1. Developer Productivity: Work on 3-5 issues in parallel without context switching
2. Claude Effectiveness: Zero confusion between different issues
3. Time to Start: < 30 seconds from issue number to Claude-ready workspace
4. Adoption: Works with any Git + Claude workflow
5. Integration: Enhances with GitHub, Neon, Supabase when available
