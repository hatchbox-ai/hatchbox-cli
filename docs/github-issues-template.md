# GitHub Issues Template

This document contains templates for creating GitHub issues based on the development plan. Copy and paste these into GitHub issues, updating the details as needed.

---

## Phase 1: Core Foundation

### Issue #1: Initialize TypeScript Project and CLI Structure

**Labels**: `enhancement`, `setup`, `phase-1`

**Description**:
Set up the basic TypeScript project infrastructure for the Hatchbox AI CLI tool.

**Tasks**:
- [ ] Create `package.json` with correct metadata and dependencies
- [ ] Configure TypeScript with `tsconfig.json`
- [ ] Set up build system using `tsup` for CLI and library builds
- [ ] Configure ESLint and Prettier for code quality
- [ ] Set up Vitest with comprehensive test configuration
- [ ] Configure test coverage reporting (95% minimum threshold)
- [ ] Create mock factory infrastructure for all external dependencies
- [ ] Set up property-based testing with fast-check
- [ ] Create basic project structure with dedicated test directories
- [ ] Configure npm scripts for development workflow including test commands
- [ ] Set up GitHub Actions for CI/CD with comprehensive testing pipeline
- [ ] Configure pre-commit hooks for automated test runs

**Dependencies**:
- `commander` - CLI framework
- `execa` - Shell command execution
- `fs-extra` - File system operations
- `chalk` - Terminal colors
- `ora` - Loading spinners
- `inquirer` - Interactive prompts
- `vitest` - Testing framework
- `@vitest/coverage-v8` - Coverage reporting
- `fast-check` - Property-based testing

**Testing Requirements**:
- Comprehensive Vitest configuration with 95% coverage threshold
- Mock factories for Git, GitHub CLI, Neon CLI, Claude CLI, file system
- Property-based testing setup for edge case discovery
- Pre-commit hooks preventing commits without passing tests
- CI/CD pipeline with automated test gates and performance benchmarks

**Acceptance Criteria**:
- [ ] Package builds successfully with `npm run build`
- [ ] CLI executable works with basic `--help` command
- [ ] TypeScript compilation passes without errors
- [ ] Linting and formatting work correctly
- [ ] Test framework functional with sample tests achieving 95%+ coverage
- [ ] Mock factories working for all external dependencies
- [ ] CI/CD pipeline running comprehensive test suite automatically
- [ ] Pre-commit hooks preventing untested code commits

**Definition of Done**:
- All tasks completed following TDD approach
- Code follows established patterns with >95% test coverage
- All tests pass including unit, integration, and property-based tests
- Mock factories validated for all external dependencies
- Performance benchmarks established
- Documentation updated including testing guidelines

---

### Issue #2: Core Git Worktree Management Module

**Labels**: `enhancement`, `core`, `phase-1`

**Description**:
Port all git worktree functionality from bash scripts into a TypeScript module.

**Key Files to Create**:
- `src/lib/GitWorktreeManager.ts`
- `src/utils/git.ts`
- `src/types/worktree.ts`

**Functions to Port**:
- [ ] `find_worktree_for_branch()` from `find-worktree-for-branch.sh`
- [ ] `is_pr_worktree()` from `worktree-utils.sh`
- [ ] `get_pr_number_from_worktree()` from `worktree-utils.sh`
- [ ] Worktree creation logic from `new-branch-workflow.sh`
- [ ] Worktree removal logic from `cleanup-worktree.sh`

**Features**:
- [ ] List all worktrees with branch information
- [ ] Create worktree for branch
- [ ] Remove worktree and associated files
- [ ] Find worktree path by branch name
- [ ] Detect PR worktrees by naming pattern
- [ ] Validate worktree states

**Testing Requirements**:
- Unit tests for each GitWorktreeManager method using mocked Git commands
- Git CLI mock factory with realistic scenarios (empty, existing, conflicts)
- Test fixtures for various worktree configurations
- Regression tests comparing behavior to bash script output
- Integration tests for worktree lifecycle operations
- Error handling tests for Git command failures
- Cross-platform compatibility tests
- Property-based tests for edge case discovery

**Acceptance Criteria**:
- [ ] All bash script worktree functionality replicated with test verification
- [ ] Comprehensive unit tests achieving >95% coverage
- [ ] Git CLI mock factory working with all scenarios
- [ ] Regression tests proving bash script parity
- [ ] Error handling for all failure scenarios tested
- [ ] Cross-platform compatibility validated through testing
- [ ] Integration tests covering complete worktree workflows

---

### Issue #3: GitHub Integration Module

**Labels**: `enhancement`, `integration`, `phase-1`

**Description**:
Port GitHub CLI integration and issue/PR handling functionality.

**Key Files to Create**:
- `src/lib/GitHubService.ts`
- `src/utils/github.ts`
- `src/types/github.ts`

**Functions to Port**:
- [ ] Issue fetching and validation
- [ ] PR fetching and state checking
- [ ] Branch name generation from issue titles
- [ ] Issue/PR context extraction for Claude

**Features**:
- [ ] Detect if input is issue number or PR number
- [ ] Fetch issue/PR details using GitHub CLI
- [ ] Validate issue/PR state (open/closed)
- [ ] Generate semantic branch names
- [ ] Extract context for Claude integration

**Testing Requirements**:
- Unit tests for GitHub API response parsing
- GitHub CLI mock factory with various response scenarios (issues, PRs, edge cases)
- Test fixtures for various issue/PR states and formats
- Branch name generation tests with Claude AI mocking
- Input detection tests for all valid formats
- Error handling tests for network failures and API errors
- Rate limiting and retry logic tests
- Integration tests with GitHub CLI wrapper

**Acceptance Criteria**:
- [ ] GitHub CLI integration working with comprehensive test coverage
- [ ] Issue and PR detection accurate with >95% test coverage
- [ ] Branch name generation matches bash script behavior verified through regression tests
- [ ] Proper error handling for GitHub API failures tested extensively
- [ ] GitHub CLI mock factory covering all response scenarios
- [ ] Claude AI integration mocked and tested for branch name generation
- [ ] Input validation tests covering all supported formats

---

### Issue #4: Environment Management Module

**Labels**: `enhancement`, `core`, `phase-1`

**Description**:
Port .env file manipulation functionality from bash scripts.

**Key Files to Create**:
- `src/lib/EnvironmentManager.ts`
- `src/utils/env.ts`

**Functions to Port**:
- [ ] `setEnvVar()` from `env-utils.sh`
- [ ] Port assignment logic (3000 + issue/PR number)
- [ ] .env file copying between worktrees

**Features**:
- [ ] Read/write/update .env files
- [ ] Set environment variables in target file
- [ ] Copy .env files between directories
- [ ] Calculate and assign unique ports
- [ ] Validate environment configurations

**Testing Requirements**:
- Unit tests for .env file parsing and manipulation
- File system mocking for atomic file operations
- Property-based tests for environment variable validation
- Port calculation tests including conflict detection
- Environment variable validation tests
- Cross-platform file handling tests
- Concurrent access and file locking tests
- Backup and recovery mechanism tests

**Acceptance Criteria**:
- [ ] .env file manipulation works identically to bash scripts verified through regression tests
- [ ] Atomic file updates tested with concurrency scenarios
- [ ] Port calculation matches existing logic with comprehensive test coverage
- [ ] Proper error handling for file operations tested extensively
- [ ] File system mock factory working for all scenarios
- [ ] Property-based tests revealing no edge cases
- [ ] Cross-platform compatibility validated through testing

---

### Issue #5: Database Branch Management (Neon)

**Labels**: `enhancement`, `integration`, `phase-1`

**Description**:
Port Neon database utilities with provider abstraction for future database providers.

**Key Files to Create**:
- `src/lib/DatabaseManager.ts`
- `src/lib/providers/NeonProvider.ts`
- `src/utils/database.ts`
- `src/types/database.ts`

**Functions to Port**:
- [ ] `create_neon_database_branch()` from `neon-utils.sh`
- [ ] `delete_neon_database_branch()` from `neon-utils.sh`
- [ ] `find_preview_database_branch()` from `neon-utils.sh`
- [ ] All Neon CLI wrapper functions

**Features**:
- [ ] Create isolated database branches
- [ ] Generate connection strings
- [ ] Delete database branches on cleanup
- [ ] Detect Vercel preview databases
- [ ] Handle database safety checks
- [ ] Abstract interface for future providers

**Acceptance Criteria**:
- [ ] Neon integration works identically to bash scripts
- [ ] Provider abstraction allows for future database providers
- [ ] Safety checks prevent accidental data loss
- [ ] Preview database detection working

---

## Phase 2: Core Commands

### Issue #6: Implement 'start' Command

**Labels**: `enhancement`, `command`, `phase-2`

**Description**:
Port `new-branch-workflow.sh` functionality into the `start` command.

**Command**: `cw start <issue-number-or-branch-name>`

**Key Logic to Port**:
- [ ] Input validation and type detection
- [ ] GitHub issue/PR fetching
- [ ] Branch creation or validation
- [ ] Worktree creation with proper naming
- [ ] .env file copying and port assignment
- [ ] Dependency installation
- [ ] Database branch creation
- [ ] Claude context generation
- [ ] Terminal launching

**Files**:
- `src/commands/start.ts`

**Acceptance Criteria**:
- [ ] All functionality from `new-branch-workflow.sh` replicated
- [ ] Error handling and user feedback
- [ ] Integration with all Phase 1 modules
- [ ] Claude integration working

---

### Issue #7: Implement 'finish' Command

**Labels**: `enhancement`, `command`, `phase-2`, `complex`

**Description**:
Port `merge-and-clean.sh` functionality into the `finish` command.

**Command**: `cw finish <issue-number-or-branch-name>`

**Key Logic to Port**:
- [ ] Uncommitted changes detection and auto-commit
- [ ] Migration conflict handling (Payload CMS specific)
- [ ] Type checking, linting, testing workflows
- [ ] Claude-assisted error fixing
- [ ] Branch rebasing on main
- [ ] Fast-forward merge validation
- [ ] Database branch cleanup
- [ ] Dev server termination
- [ ] Worktree and branch cleanup

**Files**:
- `src/commands/finish.ts`
- `src/lib/MigrationManager.ts` (for Payload CMS)
- `src/lib/TestRunner.ts`

**Acceptance Criteria**:
- [ ] All functionality from `merge-and-clean.sh` replicated
- [ ] Migration handling for Payload CMS working
- [ ] Claude-assisted error fixing
- [ ] Proper cleanup of all resources

---

### Issue #8: Implement 'cleanup' Command

**Labels**: `enhancement`, `command`, `phase-2`

**Description**:
Port `cleanup-worktree.sh` functionality into the `cleanup` command.

**Command**: `cw cleanup [branch-name|issue-number]`
**Options**: `--all`, `--issue <number>`, `--force`, `--list`

**Key Logic to Port**:
- [ ] List all worktrees
- [ ] Remove single worktree by branch name
- [ ] Remove all worktrees for an issue
- [ ] Remove all worktrees (with confirmation)
- [ ] Database branch cleanup integration

**Files**:
- `src/commands/cleanup.ts`

**Acceptance Criteria**:
- [ ] All functionality from `cleanup-worktree.sh` replicated
- [ ] Interactive confirmations working
- [ ] Database cleanup integration
- [ ] Proper error handling

---

### Issue #9: Implement 'list' Command

**Labels**: `enhancement`, `command`, `phase-2`

**Description**:
Show all active workspaces with rich information.

**Command**: `cw list`

**Features** (Enhanced from bash):
- [ ] Show all active workspaces
- [ ] Display issue/PR information
- [ ] Show port assignments
- [ ] Display database branch status
- [ ] Show last activity time
- [ ] Format output with colors and icons

**Files**:
- `src/commands/list.ts`

**Acceptance Criteria**:
- [ ] Rich workspace information displayed
- [ ] Colored and formatted output
- [ ] Fast performance even with many workspaces
- [ ] Proper error handling for missing data

---

### Issue #10: Implement 'switch' Command

**Labels**: `enhancement`, `command`, `phase-2`

**Description**:
Quick context switching between workspaces.

**Command**: `cw switch <issue-number-or-branch-name>`

**Features**:
- [ ] Navigate to worktree directory
- [ ] Display Claude context for the workspace
- [ ] Show current issue/PR details
- [ ] Update terminal context
- [ ] Launch Claude if requested

**Files**:
- `src/commands/switch.ts`

**Acceptance Criteria**:
- [ ] Directory switching working on all platforms
- [ ] Claude context properly displayed
- [ ] Terminal integration working
- [ ] Error handling for missing workspaces

---

## Phase 3: Claude AI Integration

### Issue #11: Claude Context Generation

**Labels**: `enhancement`, `ai`, `phase-3`

**Description**:
Generate rich context files for Claude AI integration.

**Key Files**:
- `src/lib/ClaudeContextManager.ts`
- `src/utils/claude.ts`

**Features**:
- [ ] Generate `.claude-context.md` files in worktrees
- [ ] Create issue/PR summaries for Claude
- [ ] Include port and database information
- [ ] Add project-specific conventions
- [ ] Format instructions appropriately

**Acceptance Criteria**:
- [ ] Context files generated correctly
- [ ] Claude integration enhanced beyond bash scripts
- [ ] Project-specific customization
- [ ] Proper formatting and structure

---

### Issue #12: Claude CLI Integration

**Labels**: `enhancement`, `ai`, `phase-3`

**Description**:
Enhanced Claude CLI integration beyond bash script capabilities.

**Features**:
- [ ] Detect Claude CLI availability
- [ ] Launch Claude with appropriate permissions and models
- [ ] Pass context and instructions
- [ ] Support headless mode for automation
- [ ] Handle different Claude models (opus, haiku, sonnet)

**Acceptance Criteria**:
- [ ] Claude launching works on all platforms
- [ ] Model selection working
- [ ] Context passing accurate
- [ ] Error handling for Claude CLI issues

---

### Issue #13: AI-Assisted Features

**Labels**: `enhancement`, `ai`, `phase-3`

**Description**:
Leverage Claude for development tasks beyond the bash scripts.

**Features**:
- [ ] Auto-generate commit messages
- [ ] Generate semantic branch names from issues
- [ ] Conflict resolution assistance
- [ ] Type error and lint error fixing
- [ ] Test failure analysis and fixes

**Acceptance Criteria**:
- [ ] Commit message generation matches bash behavior
- [ ] Branch naming enhanced with AI
- [ ] Error fixing assistance working
- [ ] Proper fallbacks when Claude unavailable

---

## Phase 4: Migration and Testing

### Issue #14: Payload CMS Migration Support

**Labels**: `enhancement`, `payload`, `phase-4`

**Description**:
Handle Payload CMS specific migration functionality.

**Features from `merge-and-clean.sh`**:
- [ ] Migration conflict detection
- [ ] Branch-specific migration removal
- [ ] Migration regeneration after merge
- [ ] Database safety checks
- [ ] `migrations/index.ts` management

**Acceptance Criteria**:
- [ ] Migration handling identical to bash scripts
- [ ] Safety checks prevent data loss
- [ ] Proper conflict resolution
- [ ] Post-merge migration regeneration

---

### Issue #15: Test Infrastructure

**Labels**: `testing`, `infrastructure`, `phase-4`

**Description**:
Comprehensive test coverage for all functionality.

**Test Types**:
- [ ] Unit tests for all modules
- [ ] Integration tests for commands
- [ ] Mock Git operations
- [ ] Mock GitHub CLI responses
- [ ] Test environment isolation

**Acceptance Criteria**:
- [ ] >90% code coverage
- [ ] All critical paths tested
- [ ] Mocking framework working
- [ ] CI/CD integration

---

### Issue #16: Build and Release Pipeline

**Labels**: `infrastructure`, `release`, `phase-4`

**Description**:
Production-ready packaging and distribution.

**Features**:
- [ ] npm publishing configuration
- [ ] GitHub Actions CI/CD
- [ ] Semantic versioning
- [ ] Release automation
- [ ] Changelog generation

**Acceptance Criteria**:
- [ ] Automated releases working
- [ ] npm package published correctly
- [ ] Version management automated
- [ ] Documentation updated automatically

---

## Phase 5: Enhanced Features

### Issue #17: Multi-Provider Support

**Labels**: `enhancement`, `providers`, `phase-5`

**Description**:
Support multiple database providers beyond Neon.

**Providers**:
- [ ] Neon (existing)
- [ ] Supabase
- [ ] PlanetScale
- [ ] Local databases

**Acceptance Criteria**:
- [ ] Provider abstraction working
- [ ] Multiple providers configurable
- [ ] Migration path from Neon-only
- [ ] Documentation for each provider

---

### Issue #18: IDE Integration

**Labels**: `enhancement`, `ide`, `phase-5`

**Description**:
Enhanced development environment integration.

**Features**:
- [ ] VS Code workspace opening
- [ ] Cursor IDE support
- [ ] Terminal session management
- [ ] Workspace settings configuration

**Acceptance Criteria**:
- [ ] IDE launching working
- [ ] Workspace configuration applied
- [ ] Cross-platform support
- [ ] Error handling for missing IDEs

---

### Issue #19: Configuration Management

**Labels**: `enhancement`, `config`, `phase-5`

**Description**:
Flexible configuration system for customization.

**Features**:
- [ ] Global config file (`~/.cwm/config.json`)
- [ ] Per-project configuration
- [ ] Custom workflow hooks
- [ ] Template system for new workspaces

**Acceptance Criteria**:
- [ ] Configuration loading working
- [ ] Per-project overrides
- [ ] Template system functional
- [ ] Documentation for configuration

---

### Issue #20: Advanced Workflow Features

**Labels**: `enhancement`, `advanced`, `phase-5`

**Description**:
Power user features beyond basic workflow.

**Features**:
- [ ] Parallel workspace operations
- [ ] Workspace templates
- [ ] Custom Claude instructions per project
- [ ] Workspace backup and restore

**Acceptance Criteria**:
- [ ] Parallel operations safe
- [ ] Template system working
- [ ] Custom instructions applied
- [ ] Backup/restore functional

---

## Phase 6: Documentation and Polish

### Issue #21: Comprehensive Documentation

**Labels**: `documentation`, `phase-6`

**Description**:
Production-ready documentation for users and contributors.

**Documentation Types**:
- [ ] README with quick start guide
- [ ] API documentation
- [ ] Configuration guide
- [ ] Migration guide from bash scripts
- [ ] Troubleshooting guide

**Acceptance Criteria**:
- [ ] All features documented
- [ ] Migration guide complete
- [ ] Troubleshooting covers common issues
- [ ] API docs generated automatically

---

### Issue #22: CLI Help and UX

**Labels**: `enhancement`, `ux`, `phase-6`

**Description**:
Enhanced user experience and CLI interface.

**Features**:
- [ ] Interactive prompts for missing arguments
- [ ] Progress indicators for long operations
- [ ] Colored output with emoji indicators
- [ ] Error recovery suggestions
- [ ] Verbose and quiet modes

**Acceptance Criteria**:
- [ ] Help system comprehensive
- [ ] Progress indicators working
- [ ] Error messages actionable
- [ ] UX polished and professional

---

### Issue #23: Community Features

**Labels**: `community`, `phase-6`

**Description**:
Features to support community adoption and contribution.

**Features**:
- [ ] Example configurations
- [ ] Plugin system architecture
- [ ] Community workflow templates
- [ ] Integration examples

**Acceptance Criteria**:
- [ ] Plugin system documented
- [ ] Examples comprehensive
- [ ] Community templates available
- [ ] Contribution guidelines clear

---

## Testing Standards for All Issues

### Universal Testing Requirements

**Every issue must include**:
- [ ] **Test-First Development**: Write failing tests before implementation
- [ ] **95% Coverage Minimum**: All new code must achieve 95% test coverage
- [ ] **Mock All Externals**: Use mock factories for Git, GitHub CLI, Neon CLI, Claude CLI, file system
- [ ] **Regression Testing**: Compare behavior with bash script equivalents
- [ ] **Error Scenario Testing**: Test all failure modes and recovery paths
- [ ] **Property-Based Testing**: Use fast-check for edge case discovery where applicable
- [ ] **Integration Testing**: Test module interactions and workflows
- [ ] **Performance Benchmarking**: Measure and compare against bash script performance

**Testing Definition of Done**:
- [ ] All tests pass (unit, integration, property-based)
- [ ] Code coverage >95% with meaningful tests (not just coverage padding)
- [ ] Mock factories work for all external dependencies used
- [ ] Regression tests prove bash script parity
- [ ] Performance benchmarks within acceptable range
- [ ] Error scenarios tested and handled gracefully
- [ ] Cross-platform compatibility validated (where applicable)

## Issue Templates

### Bug Report Template
```markdown
**Bug Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Run command '...'
2. With arguments '...'
3. See error

**Expected Behavior**
What you expected to happen.

**Actual Behavior**
What actually happened.

**Test Coverage**
- [ ] Bug reproduced with a failing test
- [ ] Fix implemented with test passing
- [ ] Regression test added to prevent reoccurrence

**Environment**
- OS: [e.g. macOS, Linux, Windows]
- Node.js version: [e.g. 18.0.0]
- Package version: [e.g. 0.1.0]
- Git version: [e.g. 2.39.0]
- Test coverage before fix: [e.g. 94.2%]
- Test coverage after fix: [e.g. 95.1%]

**Additional Context**
Add any other context about the problem here.
```

### Feature Request Template
```markdown
**Feature Description**
A clear and concise description of what you want to happen.

**Use Case**
Describe the use case that this feature would solve.

**Current Behavior**
Describe what currently happens.

**Desired Behavior**
Describe what you would like to happen instead.

**Testing Requirements**
- [ ] TDD approach - tests written before implementation
- [ ] Mock factories for any external dependencies
- [ ] Property-based tests for edge case discovery
- [ ] Performance benchmarking if applicable
- [ ] Integration tests with existing modules
- [ ] Error handling tests for failure scenarios

**Definition of Done**
- [ ] Feature implemented with >95% test coverage
- [ ] All tests passing including edge cases
- [ ] Performance within acceptable bounds
- [ ] Documentation updated
- [ ] Mock factories validated

**Additional Context**
Add any other context or screenshots about the feature request here.
```

Use these templates to create GitHub issues systematically, ensuring all planned functionality is properly tracked and can be converted into actionable development tasks with comprehensive testing requirements.