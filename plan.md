# Hatchbox AI - Development Plan

## Project Overview

Convert the existing bash workflow scripts into "Hatchbox AI" - a TypeScript CLI tool that enables developers to efficiently work on multiple issues/features simultaneously with Claude AI. The tool leverages standard development tools (Git worktrees, GitHub CLI, database branching) to create isolated workspaces that Claude can operate in without conflicts.

**Key Migration Motivation**: Moving from bash scripts to TypeScript enables comprehensive unit testing, better maintainability, type safety, and more reliable error handling - critical improvements for production workflows.

## Current Bash Scripts Analysis

### Core Scripts

1. **`new-branch-workflow.sh`** - Creates isolated workspace for an issue/PR
2. **`merge-and-clean.sh`** - Completes work and cleans up
3. **`cleanup-worktree.sh`** - Removes workspaces
4. **`merge-current-issue.sh`** - Merges current work from within worktree

### Utility Scripts

1. **`find-worktree-for-branch.sh`** - Locates worktree for a branch
2. **`worktree-utils.sh`** - PR worktree detection utilities
3. **`env-utils.sh`** - Environment file manipulation
4. **`neon-utils.sh`** - Database isolation utilities

### Key Functionality Identified

#### From `new-branch-workflow.sh`:

- GitHub issue/PR detection and fetching
- Branch name generation using Claude AI
- Git worktree creation
- .env file copying and port assignment (3000 + issue number)
- Dependency installation (pnpm)
- Neon database branch creation
- Claude CLI integration with context
- Terminal launching with Claude

#### From `merge-and-clean.sh`:

- Uncommitted changes detection and auto-commit
- Migration conflict handling (Payload CMS specific)
- Branch rebasing on main
- Fast-forward merge validation
- Type checking, linting, and testing
- Claude-assisted error fixing
- Database branch cleanup
- Dev server termination
- Worktree and branch cleanup

#### From `cleanup-worktree.sh`:

- Worktree listing and removal
- Issue-based cleanup (find all branches for an issue)
- Bulk worktree removal
- Database branch cleanup integration

#### From Utility Scripts:

- PR worktree detection (`_pr_N` suffix pattern)
- Environment variable manipulation in .env files
- Neon database branch management
- Connection string generation
- Preview database detection for Vercel

## Development Plan Structure

**Development Approach**: Test-Driven Development (TDD)

- Write comprehensive unit tests before implementing each module
- Maintain minimum 95% code coverage throughout development
- Use mock factories for all external dependencies (Git, GitHub CLI, Neon CLI, Claude CLI)
- Implement regression tests to ensure exact bash script parity
- Continuous integration with automated test gates

### Phase 1: Core Foundation (Issues 1-5)

Focus on exact functionality parity with bash scripts using TDD approach.

#### Issue #1: Initialize TypeScript Project and CLI Structure

**Goal**: Set up the basic TypeScript project infrastructure

**Tasks**:

- [x] Create `package.json` with correct metadata and dependencies
- [x] Configure TypeScript with `tsconfig.json`
- [x] Set up build system using `tsup` for CLI and library builds
- [ ] Configure ESLint and Prettier for code quality
- [ ] Set up Vitest for testing
- [ ] Create basic project structure (`src/`, `lib/`, `commands/`, `utils/`)

**Dependencies**:

- `commander` - CLI framework
- `execa` - Shell command execution
- `fs-extra` - File system operations
- `chalk` - Terminal colors
- `ora` - Loading spinners
- `inquirer` - Interactive prompts

**Testing Requirements**:

- Set up Vitest with comprehensive test configuration
- Configure test coverage reporting (minimum 95%)
- Set up GitHub Actions CI/CD with test gates
- Create mock factories for external dependencies
- Implement pre-commit hooks for test runs

**Acceptance Criteria**:

- Package builds successfully with `npm run build`
- CLI executable works with basic `--help` command
- TypeScript compilation passes
- Linting and formatting work
- Test framework functional with sample tests
- Code coverage reporting working
- CI/CD pipeline running tests automatically

#### Issue #2: Core Git Worktree Management Module

**Goal**: Port all git worktree functionality from bash scripts

**Key Files to Create**:

- `src/lib/GitWorktreeManager.ts`
- `src/utils/git.ts`
- `src/types/worktree.ts`

**Functions to Port**:

- `find_worktree_for_branch()` from `find-worktree-for-branch.sh`
- `is_pr_worktree()` from `worktree-utils.sh`
- `get_pr_number_from_worktree()` from `worktree-utils.sh`
- Worktree creation logic from `new-branch-workflow.sh`
- Worktree removal logic from `cleanup-worktree.sh`

**Features**:

- List all worktrees with branch information
- Create worktree for branch
- Remove worktree and associated files
- Find worktree path by branch name
- Detect PR worktrees by naming pattern
- Validate worktree states

**Testing Requirements**:

- Unit tests for each GitWorktreeManager method using mocked Git commands
- Mock factory for Git CLI responses and states
- Test fixtures for various worktree configurations
- Regression tests comparing behavior to bash script output
- Integration tests for worktree lifecycle operations
- Error handling tests for Git command failures
- Cross-platform compatibility tests

#### Issue #3: GitHub Integration Module

**Goal**: Port GitHub CLI integration and issue/PR handling

**Key Files to Create**:

- `src/lib/GitHubService.ts`
- `src/utils/github.ts`
- `src/types/github.ts`

**Functions to Port**:

- Issue fetching and validation
- PR fetching and state checking
- Branch name generation from issue titles
- Issue/PR context extraction for Claude

**Features**:

- Detect if input is issue number or PR number
- Fetch issue/PR details using GitHub CLI
- Validate issue/PR state (open/closed)
- Generate semantic branch names
- Extract context for Claude integration

**Testing Requirements**:

- Unit tests for GitHub API response parsing
- Mock factory for GitHub CLI responses (issues, PRs, edge cases)
- Test fixtures for various issue/PR states and formats
- Branch name generation tests with Claude AI mocking
- Input detection tests for all valid formats
- Error handling tests for network failures and API errors
- Rate limiting and retry logic tests

#### Issue #4: Environment Management Module

**Goal**: Port .env file manipulation functionality

**Key Files to Create**:

- `src/lib/EnvironmentManager.ts`
- `src/utils/env.ts`

**Functions to Port**:

- `setEnvVar()` from `env-utils.sh`
- Port assignment logic (3000 + issue/PR number)
- .env file copying between worktrees

**Features**:

- Read/write/update .env files
- Set environment variables in target file
- Copy .env files between directories
- Calculate and assign unique ports
- Validate environment configurations

**Testing Requirements**:

- Unit tests for .env file parsing and manipulation
- File system mocking for atomic file operations
- Port calculation tests including conflict detection
- Environment variable validation tests
- Cross-platform file handling tests
- Concurrent access and file locking tests
- Backup and recovery mechanism tests

#### Issue #5: Database Branch Management (Neon)

**Goal**: Port Neon database utilities with provider abstraction

**Key Files to Create**:

- `src/lib/DatabaseManager.ts`
- `src/lib/providers/NeonProvider.ts`
- `src/utils/database.ts`
- `src/types/database.ts`

**Functions to Port**:

- `create_neon_database_branch()` from `neon-utils.sh`
- `delete_neon_database_branch()` from `neon-utils.sh`
- `find_preview_database_branch()` from `neon-utils.sh`
- All Neon CLI wrapper functions

**Features**:

- Create isolated database branches
- Generate connection strings
- Delete database branches on cleanup
- Detect Vercel preview databases
- Handle database safety checks
- Abstract interface for future providers (Supabase, PlanetScale)

**Testing Requirements**:

- Unit tests for Neon CLI wrapper functions
- Mock factory for Neon API responses and CLI outputs
- Database provider interface tests ensuring contract compliance
- Connection string parsing and validation tests
- Preview database detection algorithm tests
- Safety check logic tests (protected branch prevention)
- Provider abstraction tests for future extensibility
- Failure recovery and cleanup tests

### Phase 2: Core Commands (Issues 6-10)

Transform bash scripts into CLI commands with exact functionality using comprehensive integration testing.

#### Issue #6: Implement 'start' Command

**Goal**: Port `new-branch-workflow.sh` functionality

**Command**: `cw start <issue-number-or-branch-name>`

**Key Logic to Port**:

- Input validation and type detection
- GitHub issue/PR fetching
- Branch creation or validation
- Worktree creation with proper naming
- .env file copying and port assignment
- Dependency installation
- Database branch creation
- Claude context generation
- Terminal launching

**Files**:

- `src/commands/start.ts`
- Integration with all Phase 1 modules

**Testing Requirements**:

- End-to-end workflow tests using temporary Git repositories
- Integration tests with mocked external dependencies
- Command-line argument parsing and validation tests
- Error scenario tests (missing dependencies, network failures)
- Performance benchmarking against bash script equivalent
- Output format and messaging tests
- Regression tests ensuring exact bash script parity

#### Issue #7: Implement 'finish' Command

**Goal**: Port `merge-and-clean.sh` functionality

**Command**: `cw finish <issue-number-or-branch-name>`

**Key Logic to Port**:

- Uncommitted changes detection and auto-commit
- Migration conflict handling (Payload CMS specific)
- Type checking, linting, testing workflows
- Claude-assisted error fixing
- Branch rebasing on main
- Fast-forward merge validation
- Database branch cleanup
- Dev server termination
- Worktree and branch cleanup

**Files**:

- `src/commands/finish.ts`
- `src/lib/MigrationManager.ts` (for Payload CMS)
- `src/lib/TestRunner.ts`

**Testing Requirements**:

- Complex integration tests for merge workflow scenarios
- Migration conflict detection and resolution tests
- Claude-assisted error fixing workflow tests
- Pre-merge validation pipeline tests (typecheck, lint, test)
- Git rebase and merge operation tests with conflict scenarios
- Database cleanup and safety check tests
- Resource cleanup validation tests
- Error recovery and rollback mechanism tests

#### Issue #8: Implement 'cleanup' Command

**Goal**: Port `cleanup-worktree.sh` functionality

**Command**: `cw cleanup [branch-name|issue-number]`
**Options**: `--all`, `--issue <number>`, `--force`, `--list`

**Key Logic to Port**:

- List all worktrees
- Remove single worktree by branch name
- Remove all worktrees for an issue
- Remove all worktrees (with confirmation)
- Database branch cleanup integration

**Files**:

- `src/commands/cleanup.ts`

**Testing Requirements**:

- Batch operation tests for multiple worktree cleanup
- Interactive confirmation flow tests
- Force mode and dry-run mode tests
- Database resource cleanup validation tests
- Orphaned resource detection and cleanup tests
- Safe deletion logic tests (merged branches only)
- Cross-platform cleanup operation tests

#### Issue #9: Implement 'list' Command

**Goal**: Show all active workspaces with rich information

**Command**: `cw list`

**Features** (Enhanced from bash):

- Show all active workspaces
- Display issue/PR information
- Show port assignments
- Display database branch status
- Show last activity time
- Format output with colors and icons

**Files**:

- `src/commands/list.ts`

**Testing Requirements**:

- Output formatting and color rendering tests
- Performance tests with large numbers of workspaces
- Workspace status detection and reporting tests
- GitHub integration tests for issue/PR information
- Database connection status tests
- Snapshot tests for output format consistency
- Accessibility tests for color-blind users

#### Issue #10: Implement 'switch' Command

**Goal**: Quick context switching between workspaces

**Command**: `cw switch <issue-number-or-branch-name>`

**Features**:

- Navigate to worktree directory
- Display Claude context for the workspace
- Show current issue/PR details
- Update terminal context
- Launch Claude if requested

**Files**:

- `src/commands/switch.ts`

**Testing Requirements**:

- Cross-platform directory navigation tests
- Terminal integration tests for different shells
- Claude context generation and display tests
- Workspace validation and error handling tests
- Performance tests for context switching operations

### Phase 3: Claude AI Integration (Issues 11-13)

Enhance Claude integration beyond bash script capabilities.

#### Issue #11: Claude Context Generation

**Goal**: Generate rich context files for Claude

**Key Files**:

- `src/lib/ClaudeContextManager.ts`
- `src/utils/claude.ts`

**Features**:

- Generate `.claude-context.md` files in worktrees
- Create issue/PR summaries for Claude
- Include port and database information
- Add project-specific conventions
- Format instructions appropriately

#### Issue #12: Claude CLI Integration

**Goal**: Enhanced Claude CLI integration

**Features**:

- Detect Claude CLI availability
- Launch Claude with appropriate permissions and models
- Pass context and instructions
- Support headless mode for automation
- Handle different Claude models (opus, haiku, sonnet)

#### Issue #13: AI-Assisted Features

**Goal**: Leverage Claude for development tasks

**Features**:

- Auto-generate commit messages
- Generate semantic branch names from issues
- Conflict resolution assistance
- Type error and lint error fixing
- Test failure analysis and fixes

### Phase 4: Migration and Testing (Issues 14-16)

Handle Payload CMS specifics and establish production-grade testing infrastructure.

#### Issue #14: Payload CMS Migration Support

**Goal**: Port migration-specific functionality

**Features from `merge-and-clean.sh`**:

- Migration conflict detection
- Branch-specific migration removal
- Migration regeneration after merge
- Database safety checks
- `migrations/index.ts` management

#### Issue #15: Test Infrastructure

**Goal**: Production-grade comprehensive test coverage

**Test Infrastructure**:

- **Unit Tests**: >95% code coverage for all modules
- **Integration Tests**: End-to-end command workflow testing
- **Mock Framework**: Complete mock factories for Git, GitHub CLI, Neon CLI, Claude CLI
- **Test Fixtures**: Realistic test data for all scenarios
- **Performance Tests**: Benchmarking against bash script performance
- **Regression Tests**: Automated bash script behavior comparison
- **Snapshot Tests**: CLI output format consistency
- **Property-Based Tests**: Edge case discovery using fast-check
- **Contract Tests**: Database provider interface compliance
- **Accessibility Tests**: CLI output readability and color-blind support

#### Issue #16: Build and Release Pipeline

**Goal**: Production-ready packaging and distribution

**Features**:

- npm publishing configuration
- GitHub Actions CI/CD
- Semantic versioning
- Release automation
- Changelog generation

### Phase 5: Enhanced Features (Issues 17-20)

Go beyond bash script functionality.

#### Issue #17: Multi-Provider Support

**Goal**: Support multiple database providers

**Providers**:

- Neon (existing)
- Supabase
- PlanetScale
- Local databases

#### Issue #18: IDE Integration

**Goal**: Enhanced development environment integration

**Features**:

- VS Code workspace opening
- Cursor IDE support
- Terminal session management
- Workspace settings configuration

#### Issue #19: Configuration Management

**Goal**: Flexible configuration system

**Features**:

- Global config file (`~/.cwm/config.json`)
- Per-project configuration
- Custom workflow hooks
- Template system for new workspaces

#### Issue #20: Advanced Workflow Features

**Goal**: Power user features

**Features**:

- Parallel workspace operations
- Workspace templates
- Custom Claude instructions per project
- Workspace backup and restore

### Phase 6: Documentation and Polish (Issues 21-23)

Production-ready documentation and UX.

#### Issue #21: Comprehensive Documentation

- README with quick start guide
- API documentation
- Configuration guide
- Migration guide from bash scripts
- Troubleshooting guide

#### Issue #22: CLI Help and UX

- Interactive prompts for missing arguments
- Progress indicators for long operations
- Colored output with emoji indicators
- Error recovery suggestions
- Verbose and quiet modes

#### Issue #23: Community Features

- Example configurations
- Plugin system architecture
- Community workflow templates
- Integration examples

## Technical Architecture

### Core Classes

```typescript
// Main orchestrator
class WorkspaceManager {
  constructor(
    private git: GitWorktreeManager,
    private github: GitHubService,
    private env: EnvironmentManager,
    private db: DatabaseManager,
    private claude: ClaudeContextManager
  ) {}
}

// Git operations
class GitWorktreeManager {
  async createWorktree(branch: string, path: string): Promise<void>
  async removeWorktree(path: string): Promise<void>
  async listWorktrees(): Promise<Worktree[]>
  async findWorktreeForBranch(branch: string): Promise<string | null>
}

// GitHub integration
class GitHubService {
  async getIssue(number: number): Promise<Issue>
  async getPR(number: number): Promise<PullRequest>
  async generateBranchName(issue: Issue): Promise<string>
}

// Environment management
class EnvironmentManager {
  async copyEnvFile(source: string, target: string): Promise<void>
  async setEnvVar(file: string, key: string, value: string): Promise<void>
  calculatePort(issueNumber: number): number
}

// Database provider interface
interface DatabaseProvider {
  createBranch(name: string): Promise<string>
  deleteBranch(name: string): Promise<void>
  getConnectionString(branch: string): Promise<string>
}

class NeonProvider implements DatabaseProvider {
  // Implementation
}
```

### Project Structure

```
hatchbox-ai/
├── src/
│   ├── cli.ts                 # Main CLI entry point
│   ├── index.ts               # Library exports
│   ├── commands/              # CLI command implementations
│   │   ├── start.ts
│   │   ├── finish.ts
│   │   ├── cleanup.ts
│   │   ├── list.ts
│   │   └── switch.ts
│   ├── lib/                   # Core business logic
│   │   ├── WorkspaceManager.ts
│   │   ├── GitWorktreeManager.ts
│   │   ├── GitHubService.ts
│   │   ├── EnvironmentManager.ts
│   │   ├── DatabaseManager.ts
│   │   ├── ClaudeContextManager.ts
│   │   └── providers/
│   │       ├── NeonProvider.ts
│   │       ├── SupabaseProvider.ts
│   │       └── index.ts
│   ├── utils/                 # Utility functions
│   │   ├── git.ts
│   │   ├── github.ts
│   │   ├── env.ts
│   │   ├── database.ts
│   │   ├── claude.ts
│   │   └── shell.ts
│   └── types/                 # TypeScript type definitions
│       ├── workspace.ts
│       ├── github.ts
│       ├── database.ts
│       └── index.ts
├── tests/                     # Test files
├── docs/                      # Documentation
├── examples/                  # Example configurations
├── dist/                      # Built output
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── eslint.config.js
├── prettier.config.js
└── README.md
```

## Implementation Priority and Execution Order

**Note:** This order has been updated to reflect bash script enhancements discovered after initial planning. See `enhancement-integration-plan.md` for details.

### Wave 1: Foundation
**Goal:** Core infrastructure and utilities

**Completed:**
- ✅ **Issue #1** - TypeScript project initialization
- ✅ **Issue #2** - Core Git Worktree Management

**Next (in order):**
1. **Issue #27** - Logging Infrastructure ⭐ CRITICAL - DONE
   - Required by all subsequent commands
   - Establishes consistent output formatting

2. **Issue #28** - Enhanced Worktree Detection ⭐ CRITICAL - DEFERRED - this can wait
   - Builds on completed Issue #2
   - Critical UX improvement for worktree reuse

3. **Issue #4** - Environment Management Module - DONE
   - Required by start command
   - Port assignment logic

4. **Issue #5** - Database Branch Management (Neon) ⭐ CRITICAL - DEFERRED THIS CAN WAIT
   - Required by start/finish commands
   - Includes Vercel preview integration

---

### Wave 2: Core Commands
**Goal:** Primary workflow commands with bash parity

5. **Issue #3** - GitHub Integration Module - DONE
   - Required by start/finish commands
   - Enhanced PR workflow support

6. **Issue #11** - Claude Context Generation ⭐ HIGH PRIORITY
   - Structured prompt template system
   - Required by start command

7. **Issue #12** - Claude CLI Integration
   - Required by start/finish commands
   - Prompt system integration

8. **Issue #6** - Implement 'start' Command ⭐ CRITICAL
   - Most complex command with many enhancements
   - Multiple modes, coloring, dual-window support
   - Depends on: #27, #28, #3, #4, #5, #11, #12

9. **Issue #7** - Implement 'finish' Command ⭐ CRITICAL
   - Second most complex command
   - Claude-assisted automation workflows
   - Depends on: #27, #3, #5, #12, #13

10. **Issue #13** - AI-Assisted Features ⭐ HIGH PRIORITY
    - Detailed implementation workflows
    - Supports finish command
    - Can be developed in parallel with #7

---

### Wave 3: Supporting Commands
**Goal:** Complete core workflow tooling

11. **Issue #8** - Implement 'cleanup' Command
    - Enhanced with numeric detection
    - Depends on: #27, #28, #5

12. **Issue #9** - Implement 'list' Command
    - Colored output integration
    - Depends on: #27

13. **Issue #10** - Implement 'switch' Command
    - Quick context switching
    - Depends on: #27, #11

---

### Wave 4: Quality and Stability
**Goal:** Production readiness

14. **Issue #14** - Payload CMS Migration Support
    - Framework-specific functionality
    - Depends on: #7

15. **Issue #15** - Test Infrastructure
    - Comprehensive test coverage
    - Continuous: ongoing during development

16. **Issue #16** - Build and Release Pipeline
    - CI/CD, publishing, versioning

---

### Wave 5: Enhanced Features
**Goal:** Beyond bash script capabilities

17. **Issue #30** - GitHub Projects Integration 🆕
    - Auto-status updates
    - Nice-to-have automation

18. **Issue #29** - IDE Terminal Integration 🆕
    - Quick-start wrapper convenience

19. **Issue #17** - Multi-Provider Support
    - Supabase, PlanetScale support

20. **Issue #18** - IDE Integration
    - Enhanced environment integration

21. **Issue #19** - Configuration Management
    - Flexible config system

22. **Issue #20** - Advanced Workflow Features
    - Power user features

---

### Wave 6: Polish and Community
**Goal:** Production polish and extensibility

23. **Issue #31** - User-Customizable Prompt Templates 🆕
    - Power user feature
    - Override capability

24. **Issue #21** - Comprehensive Documentation
    - User guides, API docs

25. **Issue #22** - CLI Help and UX
    - Interactive prompts, progress indicators

26. **Issue #23** - Community Features
    - Plugin system, templates

---

### Critical Path Dependencies

```
Foundation Layer:
#27 (Logging) → ALL subsequent issues
#28 (Worktree Detection) → #6, #8

Core Integrations:
#3 (GitHub) → #6, #7
#4 (Environment) → #6
#5 (Database) → #6, #7, #8
#11 (Prompts) → #6, #10, #12
#12 (Claude CLI) → #6, #7

Primary Commands:
#6 (start) + #7 (finish) → Core workflow complete

Quality Gates:
#15 (Tests) → Continuous throughout
#16 (Build) → Before any release
```

### Parallelization Opportunities

Issues that can be developed simultaneously:
- **Wave 1:** #27 + #4 can start in parallel
- **Wave 2:** #11 + #12 can be developed together
- **Wave 2:** #13 can be developed alongside #7
- **Wave 3:** #8, #9, #10 can all be done in parallel
- **Wave 5:** #17-20, #29-30 can be parallelized

## Success Metrics

1. **Feature Parity**: 100% of bash script functionality replicated with regression tests
2. **Test Coverage**: >95% code coverage with comprehensive unit and integration tests
3. **Performance**: Commands execute in <30 seconds for typical operations (benchmarked)
4. **Reliability**: Zero data loss during workspace operations (tested extensively)
5. **Maintainability**: Type-safe, well-tested code with clear error messages
6. **Quality**: All edge cases covered with property-based and fuzz testing
7. **Usability**: Reduced learning curve compared to bash scripts
8. **Adoption**: Easy migration path from existing bash workflows

## Migration Strategy

### For Existing Bash Script Users

1. **Phase 1**: Install npm package alongside bash scripts
2. **Phase 2**: Gradually replace bash commands with TypeScript equivalents
3. **Phase 3**: Remove bash scripts when confident in TypeScript version
4. **Phase 4**: Enjoy enhanced features not available in bash

### Compatibility Considerations

- Preserve all command-line interfaces from bash scripts
- Maintain identical workspace directory structures
- Preserve .env file formats and variable names
- Maintain database branch naming conventions
- Keep Claude context file formats compatible

## Risk Mitigation

### Technical Risks

- **Shell Command Dependencies**: Extensive testing of `execa` wrapper functions
- **Git Worktree Complexity**: Comprehensive integration testing
- **Database Provider APIs**: Robust error handling and fallbacks
- **Cross-Platform Compatibility**: Test on macOS, Linux, Windows

### User Experience Risks

- **Learning Curve**: Maintain familiar command interfaces
- **Migration Complexity**: Provide automated migration tools
- **Performance Regression**: Benchmark against bash script speed

### Project Risks

- **Scope Creep**: Strict adherence to bash script functionality first
- **Timeline Pressure**: Focus on critical path features first
- **Maintenance Burden**: Comprehensive documentation and testing

This plan provides a clear roadmap from the current bash scripts to a production-ready TypeScript CLI tool while maintaining exact functionality parity and adding significant value through enhanced Claude AI integration.
