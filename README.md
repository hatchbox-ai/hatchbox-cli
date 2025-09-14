# Hatchbox AI

<div align="center">
  <img src="images/hatch-box-ai.png" alt="Hatchbox AI Logo" width="300"/>
</div>

> AI-assisted workspace management CLI tool enabling developers to work on multiple issues simultaneously with Claude AI using isolated Git worktrees and databases.

## The Problem

When using Claude for development, switching between issues is painful:
- Git branch switching loses Claude's context
- Database changes conflict between features
- Multiple dev servers fight over ports
- Claude mixes up changes between issues

## The Solution

Give Claude isolated workspaces for each issue:

```bash
# Start issue #25 with Claude
npx hb start 25

# Claude now has:
# ✅ Isolated Git worktree (no branch switching)
# ✅ Separate database branch (no data conflicts)
# ✅ Dedicated port 3025 (no port conflicts)
# ✅ Clear context about issue #25

# Work on issue #30 in parallel
npx hb start 30

# Claude can now work on both issues simultaneously
# in different terminal windows without any confusion
```

## Features

- **Clear Context**: Each workspace includes issue details for Claude
- **No Confusion**: Claude can't accidentally mix changes between issues
- **Parallel Work**: Multiple Claude sessions on different issues
- **Standard Tools**: Uses Git worktrees, GitHub CLI, and database branching
- **Zero Lock-in**: Just organized Git worktrees you can manage manually

## Quick Start

```bash
# Install globally
npm install -g hatchbox-ai

# Or use directly with npx
npx hb start 25
```

## Core Commands

```bash
hb start <issue-number>    # Create isolated workspace for an issue/PR
hb finish <issue-number>   # Merge work and cleanup workspace
hb cleanup [identifier]    # Remove workspaces
hb list                    # Show active workspaces
hb switch <identifier>     # Switch to workspace context
```

## Real Developer Workflow

```bash
# Monday morning - start three issues
hb start 25  # Authentication feature
hb start 26  # API bug fix
hb start 27  # Documentation update

# Work with Claude on each independently
cd ~/workspace-25
> "Claude, implement OAuth login for issue #25"

cd ~/workspace-26
> "Claude, fix the timeout bug in issue #26"

# Urgent bug comes in
hb start 99 --urgent
> "Claude, hot-fix the payment bug in issue #99"

# Finish and ship as completed
hb finish 99  # Merged and deployed
hb finish 26  # Bug fixed
# ... continue with 25 and 27 tomorrow
```

## How It Works

Each workspace gets:
- **Isolated Git worktree** (no branch switching needed)
- **Separate database branch** (no data conflicts)
- **Unique port assignment** (run multiple dev servers)
- **Clean .env configuration** (no credential mixing)
- **Clear context for Claude** (work on issue #25 without affecting #26)

## Development Status

🚧 **Currently in Development** - Converting existing bash workflow scripts to TypeScript.

This project is migrating from proven bash scripts to a robust TypeScript implementation with:
- **Test-Driven Development** (95% coverage requirement)
- **Type Safety** and better error handling
- **Cross-platform compatibility**
- **Enhanced Claude AI integration**

See [plan.md](./plan.md) for complete development roadmap and [docs/](./docs/) for detailed technical documentation.

## Architecture

**Core Technologies**:
- TypeScript CLI built with Commander.js
- Git worktrees for workspace isolation
- GitHub CLI integration for issues/PRs
- Database branching (Neon, Supabase, PlanetScale)
- Claude CLI integration for AI assistance

**Project Structure**:
```
src/
├── commands/          # CLI commands (start, finish, cleanup, list, switch)
├── lib/              # Core business logic
├── utils/            # Utility functions
└── types/            # TypeScript definitions
```

## Requirements

- Node.js 16+
- Git
- GitHub CLI (`gh`)
- Claude CLI (for AI features)
- Database provider CLI (Neon, Supabase, etc.)

## Contributing

This project follows Test-Driven Development (TDD). All code must:
- Be written test-first with comprehensive unit tests
- Achieve >95% code coverage
- Include regression tests against bash script behavior
- Use mock factories for all external dependencies

See [docs/testing-strategy.md](./docs/testing-strategy.md) for detailed testing requirements.

## Migration from Bash Scripts

If you're currently using the bash workflow scripts, see [docs/migration-strategy.md](./docs/migration-strategy.md) for a safe, gradual migration path.

## Success Metrics

1. **Developer Productivity**: Work on 3-5 issues in parallel without context switching
2. **Claude Effectiveness**: Zero confusion between different issues
3. **Time to Start**: < 30 seconds from issue number to Claude-ready workspace
4. **Adoption**: Works with any Git + Claude workflow
5. **Integration**: Enhances with GitHub, Neon, Supabase when available

## License

MIT