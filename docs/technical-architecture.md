# Technical Architecture

## Overview
This document defines the technical architecture for Hatchbox AI TypeScript implementation, including class structures, interfaces, and design patterns.

## Architecture Principles

### 1. Test-Driven Development (TDD)
All code is written test-first with comprehensive unit tests before implementation. Every class and function must have corresponding test coverage >95%.

### 2. Single Responsibility
Each class and module has a single, well-defined responsibility that maps directly to functionality from the bash scripts.

### 3. Dependency Injection
Core classes accept their dependencies through constructor injection, enabling complete test isolation and mocking.

### 4. Provider Pattern
Database and external service integrations use the provider pattern to support multiple implementations and enable easy mocking.

### 5. Command Pattern
CLI commands are implemented as separate classes that can be tested independently with full workflow testing.

### 6. Error-First Design
All operations return Results or throw typed errors with recovery suggestions, with comprehensive error scenario testing.

### 7. Testability First
Every design decision prioritizes testability - pure functions, dependency injection, mock-friendly interfaces, and deterministic behavior.

## Core Architecture

### High-Level System Design

```typescript
┌─────────────────────────────────────────────────────────────────┐
│                           CLI Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  StartCommand  │  FinishCommand  │  CleanupCommand  │  ...      │
├─────────────────────────────────────────────────────────────────┤
│                    WorkspaceManager                             │
│                   (Main Orchestrator)                           │
├─────────────────────────────────────────────────────────────────┤
│  GitWorktree  │  GitHub  │  Environment  │  Database  │ Claude │
│   Manager     │ Service  │   Manager     │  Manager   │Context │
├─────────────────────────────────────────────────────────────────┤
│              Database Providers (Neon, Supabase, etc.)         │
├─────────────────────────────────────────────────────────────────┤
│                    Utility Layer                               │
│   Shell Utils │  File Utils  │  Git Utils  │  Process Utils   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Classes and Interfaces

### 1. WorkspaceManager (Main Orchestrator)

```typescript
export class WorkspaceManager {
  constructor(
    private git: GitWorktreeManager,
    private github: GitHubService,
    private env: EnvironmentManager,
    private db: DatabaseManager,
    private claude: ClaudeContextManager,
    private config: ConfigManager
  ) {}

  // Port of new-branch-workflow.sh
  async createWorkspace(input: WorkspaceInput): Promise<Workspace> {
    // 1. Parse and validate input (issue/PR/branch)
    // 2. Fetch GitHub context if applicable
    // 3. Generate branch name with Claude if needed
    // 4. Create git worktree
    // 5. Setup environment (.env, ports)
    // 6. Create database branch
    // 7. Install dependencies
    // 8. Generate Claude context
    // 9. Launch terminal/Claude
  }

  // Port of merge-and-clean.sh
  async finishWorkspace(identifier: string, options: FinishOptions): Promise<void> {
    // 1. Find and validate workspace
    // 2. Handle uncommitted changes
    // 3. Run pre-merge validations
    // 4. Handle migration conflicts
    // 5. Rebase and merge
    // 6. Post-merge tasks
    // 7. Cleanup resources
  }

  // Port of cleanup-worktree.sh
  async cleanupWorkspace(identifier: string, options: CleanupOptions): Promise<void> {
    // 1. Find workspaces to clean
    // 2. Confirm destructive operations
    // 3. Remove worktrees
    // 4. Cleanup database branches
    // 5. Remove local branches
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]>
  async switchToWorkspace(identifier: string): Promise<void>
}
```

### 2. GitWorktreeManager

```typescript
export class GitWorktreeManager {
  constructor(private shell: ShellUtils) {}

  // Port of find_worktree_for_branch()
  async findWorktreeForBranch(branch: string): Promise<string | null>

  // Port of worktree creation logic
  async createWorktree(branch: string, path: string): Promise<void>

  // Port of worktree removal logic
  async removeWorktree(path: string): Promise<void>

  // Enhanced worktree listing
  async listWorktrees(): Promise<Worktree[]>

  // Branch management
  async createBranch(name: string, from?: string): Promise<void>
  async deleteBranch(name: string, force?: boolean): Promise<void>
  async switchBranch(name: string): Promise<void>

  // Merge operations from merge-and-clean.sh
  async rebaseBranch(branch: string, onto: string): Promise<void>
  async mergeBranch(branch: string, options: MergeOptions): Promise<void>

  // Status and validation
  async hasUncommittedChanges(): Promise<boolean>
  async getCurrentBranch(): Promise<string>
  async isBranchAheadOf(branch: string, base: string): Promise<boolean>
}

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isPR: boolean;
  prNumber?: number;
  issueNumber?: number;
  port?: number;
}
```

### 3. GitHubService

```typescript
export class GitHubService {
  constructor(private shell: ShellUtils, private claude?: ClaudeService) {}

  // Issue operations from new-branch-workflow.sh
  async getIssue(number: number): Promise<Issue>
  async validateIssueState(issue: Issue): Promise<void>

  // PR operations
  async getPR(number: number): Promise<PullRequest>
  async validatePRState(pr: PullRequest): Promise<void>

  // Branch name generation with Claude
  async generateBranchName(issue: Issue): Promise<string>

  // Input detection and parsing
  async detectInputType(input: string): Promise<InputType>
  async parseInput(input: string): Promise<WorkspaceInput>
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  headRefName: string;
  baseRefName: string;
}

export type InputType = 'issue' | 'pr' | 'branch';

export interface WorkspaceInput {
  type: InputType;
  value: string;
  issue?: Issue;
  pr?: PullRequest;
  branch?: string;
}
```

### 4. EnvironmentManager

```typescript
export class EnvironmentManager {
  constructor(private fileUtils: FileUtils) {}

  // Port of setEnvVar() from env-utils.sh
  async setEnvVar(filePath: string, key: string, value: string): Promise<void>
  async getEnvVar(filePath: string, key: string): Promise<string | null>
  async copyEnvFile(source: string, target: string): Promise<void>

  // Port of port calculation logic
  calculatePort(issueOrPRNumber: number): number

  // Environment setup for worktrees
  async setupWorktreeEnvironment(
    worktreePath: string,
    sourceEnvPath: string,
    issueOrPRNumber?: number
  ): Promise<void>

  // Load and validate environment
  async loadEnvironment(path?: string): Promise<Record<string, string>>
  async validateEnvironment(env: Record<string, string>): Promise<ValidationResult>
}
```

### 5. DatabaseManager (Provider Pattern)

```typescript
export interface DatabaseProvider {
  readonly name: string;

  // Core operations from neon-utils.sh
  createBranch(name: string, parent?: string): Promise<string>
  deleteBranch(name: string): Promise<void>
  getConnectionString(branch: string): Promise<string>

  // Branch management
  listBranches(): Promise<DatabaseBranch[]>
  branchExists(name: string): Promise<boolean>

  // Preview/deployment support
  findPreviewBranch(baseBranch: string): Promise<string | null>

  // Validation and safety
  isProtectedBranch(name: string): Promise<boolean>
  validateSafetyChecks(): Promise<void>
}

export class DatabaseManager {
  constructor(private provider: DatabaseProvider) {}

  // Delegate to provider with additional logic
  async createDatabaseBranch(branchName: string): Promise<string>
  async deleteDatabaseBranch(branchName: string, isPreview?: boolean): Promise<void>

  // Cross-provider utilities
  sanitizeBranchName(name: string): string
  extractBranchFromUrl(url: string): string | null
}

export class NeonProvider implements DatabaseProvider {
  constructor(private config: NeonConfig, private shell: ShellUtils) {}

  // Implementation of all DatabaseProvider methods
  // Direct port of neon-utils.sh functions
}

export interface DatabaseBranch {
  name: string;
  parent?: string;
  connectionString: string;
  createdAt: Date;
  isPreview: boolean;
}
```

### 6. ClaudeContextManager

```typescript
export class ClaudeContextManager {
  constructor(private shell: ShellUtils, private fileUtils: FileUtils) {}

  // Generate context files for worktrees
  async generateContextFile(workspace: Workspace, contextPath: string): Promise<void>

  // Launch Claude with appropriate context
  async launchClaudeForIssue(issue: Issue, worktreePath: string, port: number): Promise<void>
  async launchClaudeForPR(pr: PullRequest, worktreePath: string, port: number): Promise<void>
  async launchClaudeGeneral(worktreePath: string): Promise<void>

  // Claude-assisted features from merge-and-clean.sh
  async generateCommitMessage(issueNumber?: number): Promise<string>
  async generateBranchName(issue: Issue): Promise<string>
  async assistWithConflictResolution(): Promise<void>
  async assistWithTypeErrors(): Promise<void>
  async assistWithLintErrors(): Promise<void>
  async assistWithTestFailures(): Promise<void>

  // Claude availability and configuration
  async isClaudeAvailable(): Promise<boolean>
  async getPreferredModel(): Promise<string>
}
```

### 7. MigrationManager (Payload CMS Specific)

```typescript
export class MigrationManager {
  constructor(
    private git: GitWorktreeManager,
    private shell: ShellUtils,
    private db: DatabaseManager
  ) {}

  // Complex migration logic from merge-and-clean.sh
  async detectMigrationConflicts(branch: string): Promise<MigrationConflict[]>
  async removeBranchMigrations(migrations: string[]): Promise<void>
  async regenerateMigrations(): Promise<boolean>
  async runMigrations(): Promise<void>

  // Safety checks
  async performDatabaseSafetyCheck(): Promise<void>
  async isProtectedDatabase(): Promise<boolean>

  // Migration file management
  async findBranchMigrations(branch: string): Promise<string[]>
  async cleanupMigrationsIndex(): Promise<void>
}

export interface MigrationConflict {
  filePath: string;
  timestamp: string;
  conflictType: 'duplicate' | 'ordering' | 'dependency';
}
```

### 8. TestRunner

```typescript
export class TestRunner {
  constructor(private shell: ShellUtils, private claude?: ClaudeService) {}

  // Pre-merge validation from merge-and-clean.sh
  async runTypeCheck(): Promise<TestResult>
  async runLinting(): Promise<TestResult>
  async runTests(): Promise<TestResult>

  // Claude-assisted error fixing
  async fixTypeErrors(): Promise<boolean>
  async fixLintErrors(): Promise<boolean>
  async fixTestFailures(): Promise<boolean>

  // Validation pipeline
  async runFullValidation(): Promise<ValidationSummary>
}

export interface TestResult {
  success: boolean;
  output: string;
  errors: string[];
  suggestions: string[];
}
```

## Utility Classes

### 1. ShellUtils

```typescript
export class ShellUtils {
  // Wrapper around execa with error handling
  async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>
  async execPiped(commands: Command[]): Promise<ExecResult>

  // Process management
  async killProcessOnPort(port: number): Promise<void>
  async findProcessOnPort(port: number): Promise<ProcessInfo | null>

  // File system operations that need shell
  async makeExecutable(path: string): Promise<void>
  async createSymlink(target: string, link: string): Promise<void>
}
```

### 2. FileUtils

```typescript
export class FileUtils {
  // Enhanced file operations using fs-extra
  async copy(source: string, target: string): Promise<void>
  async move(source: string, target: string): Promise<void>
  async remove(path: string): Promise<void>
  async ensureDir(path: string): Promise<void>

  // Atomic file operations
  async writeAtomic(path: string, content: string): Promise<void>
  async updateFile(path: string, updater: (content: string) => string): Promise<void>

  // Path utilities
  sanitizePath(path: string): string
  resolveWorkspacePath(workspace: string): string
}
```

### 3. ConfigManager

```typescript
export class ConfigManager {
  constructor(private fileUtils: FileUtils) {}

  // Configuration loading and validation
  async loadGlobalConfig(): Promise<GlobalConfig>
  async loadProjectConfig(projectPath?: string): Promise<ProjectConfig>
  async mergeConfigs(global: GlobalConfig, project: ProjectConfig): Promise<Config>

  // Configuration persistence
  async saveGlobalConfig(config: GlobalConfig): Promise<void>
  async saveProjectConfig(config: ProjectConfig, projectPath: string): Promise<void>

  // Provider configuration
  async getDatabaseProvider(): Promise<DatabaseProviderConfig>
  async getClaudeConfig(): Promise<ClaudeConfig>
}
```

## CLI Command Structure

### Base Command Class

```typescript
export abstract class BaseCommand {
  constructor(protected manager: WorkspaceManager, protected ui: UIManager) {}

  abstract execute(args: CommandArgs): Promise<void>

  protected async handleError(error: Error): Promise<void>
  protected async confirm(message: string): Promise<boolean>
  protected async prompt<T>(questions: Question<T>[]): Promise<T>
}
```

### Specific Commands

```typescript
export class StartCommand extends BaseCommand {
  async execute(args: StartArgs): Promise<void> {
    // Port of new-branch-workflow.sh logic
  }
}

export class FinishCommand extends BaseCommand {
  async execute(args: FinishArgs): Promise<void> {
    // Port of merge-and-clean.sh logic
  }
}

export class CleanupCommand extends BaseCommand {
  async execute(args: CleanupArgs): Promise<void> {
    // Port of cleanup-worktree.sh logic
  }
}

export class ListCommand extends BaseCommand {
  async execute(args: ListArgs): Promise<void> {
    // Enhanced workspace listing
  }
}

export class SwitchCommand extends BaseCommand {
  async execute(args: SwitchArgs): Promise<void> {
    // Workspace switching and context
  }
}
```

## Type Definitions

### Core Types

```typescript
export interface Workspace {
  id: string;
  path: string;
  branch: string;
  type: 'issue' | 'pr' | 'custom';
  issueNumber?: number;
  prNumber?: number;
  port?: number;
  databaseBranch?: string;
  createdAt: Date;
  lastActivity: Date;
  status: 'active' | 'merged' | 'abandoned';
}

export interface WorkspaceSummary {
  workspace: Workspace;
  issue?: Issue;
  pr?: PullRequest;
  gitStatus: GitStatus;
  databaseStatus: DatabaseStatus;
}

export interface Config {
  database: DatabaseProviderConfig;
  claude: ClaudeConfig;
  git: GitConfig;
  ui: UIConfig;
  workspace: WorkspaceConfig;
}
```

### Error Types

```typescript
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestions: string[] = []
  ) {
    super(message);
  }
}

export class GitError extends WorkspaceError {}
export class GitHubError extends WorkspaceError {}
export class DatabaseError extends WorkspaceError {}
export class ClaudeError extends WorkspaceError {}
```

## Design Patterns Used

### 1. Factory Pattern
```typescript
export class DatabaseProviderFactory {
  static create(type: string, config: any): DatabaseProvider {
    switch (type) {
      case 'neon':
        return new NeonProvider(config);
      case 'supabase':
        return new SupabaseProvider(config);
      default:
        throw new Error(`Unknown provider: ${type}`);
    }
  }
}
```

### 2. Strategy Pattern
```typescript
export interface MergeStrategy {
  merge(workspace: Workspace, options: MergeOptions): Promise<void>;
}

export class FastForwardMergeStrategy implements MergeStrategy {
  // Implementation
}

export class SquashMergeStrategy implements MergeStrategy {
  // Implementation
}
```

### 3. Observer Pattern
```typescript
export interface WorkspaceEventListener {
  onWorkspaceCreated(workspace: Workspace): void;
  onWorkspaceFinished(workspace: Workspace): void;
  onWorkspaceCleaned(workspace: Workspace): void;
}

export class WorkspaceManager {
  private listeners: WorkspaceEventListener[] = [];

  addListener(listener: WorkspaceEventListener): void;
  removeListener(listener: WorkspaceEventListener): void;
  private notify(event: string, workspace: Workspace): void;
}
```

## Comprehensive Testing Strategy

### 1. Test-Driven Development Workflow
```typescript
// 1. Write failing test first
describe('GitWorktreeManager', () => {
  it('should create worktree for valid branch', async () => {
    // Arrange: Setup mocks and test data
    // Act: Call method under test
    // Assert: Verify expected behavior
    expect(result).toBeDefined()
  })
})

// 2. Write minimal implementation to pass test
// 3. Refactor while keeping tests green
// 4. Repeat for next feature
```

### 2. Unit Testing Strategy
- **Mock All External Dependencies**: Git CLI, GitHub CLI, Neon CLI, Claude CLI, file system
- **Pure Function Testing**: Every utility function tested in isolation
- **Class Method Testing**: Each method tested with various inputs and edge cases
- **Error Path Testing**: All error scenarios and recovery mechanisms tested
- **Performance Testing**: Critical path performance benchmarked

### 3. Integration Testing Strategy
- **Command Workflow Testing**: Full end-to-end command execution with mocked externals
- **Module Integration**: Test interaction between core modules
- **File System Integration**: Test with temporary directories and real file operations
- **Database Provider Integration**: Test provider contracts and implementations
- **Cross-Platform Testing**: Test on multiple operating systems

### 4. Mock Factory System
```typescript
// Comprehensive mock factories for all external dependencies
export class MockFactories {
  static git: MockGitProvider
  static github: MockGitHubProvider
  static neon: MockNeonProvider
  static claude: MockClaudeProvider
  static filesystem: MockFileSystem
}

export class MockGitProvider {
  setupWorktreeScenario(scenario: 'empty' | 'existing' | 'conflicts'): void
  mockCommand(command: string, response: string | Error): void
  verifyCommandCalled(command: string, times?: number): void
}

export class TestFixtures {
  static readonly SAMPLE_ISSUE: Issue = { /* realistic test data */ }
  static readonly SAMPLE_PR: PullRequest = { /* realistic test data */ }
  static readonly SAMPLE_WORKTREE: Worktree = { /* realistic test data */ }

  static createTemporaryRepo(): Promise<string>
  static createWorkspaceScenario(type: 'issue' | 'pr' | 'custom'): Promise<Workspace>
}
```

### 5. Testing Architecture
```typescript
// Base test class with common setup/teardown
export abstract class BaseTest {
  protected mocks: MockFactories
  protected fixtures: TestFixtures

  beforeEach(): void {
    // Reset all mocks
    // Setup clean test environment
  }

  afterEach(): void {
    // Cleanup test artifacts
    // Verify no unexpected mock calls
  }
}

// Command-specific test utilities
export class CommandTestUtils {
  static mockCliArgs(command: string, args: string[]): void
  static captureOutput(): OutputCapture
  static verifyExitCode(expected: number): void
}
```

### 6. Property-Based and Fuzz Testing
```typescript
import { fc } from 'fast-check'

// Property-based testing for edge case discovery
describe('Environment Manager', () => {
  it('should handle arbitrary valid environment variables', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 100 }), // key
      fc.string({ maxLength: 1000 }), // value
      async (key, value) => {
        const result = await envManager.setEnvVar(testFile, key, value)
        expect(result).toBe(true)
        const retrieved = await envManager.getEnvVar(testFile, key)
        expect(retrieved).toBe(value)
      }
    ))
  })
})
```

### 7. Regression Testing Against Bash Scripts
```typescript
// Automated comparison with bash script behavior
export class RegressionTester {
  static async compareBashToTypeScript(
    bashCommand: string,
    tsEquivalent: () => Promise<void>
  ): Promise<ComparisonResult> {
    // Run bash script and capture all outputs/side effects
    // Run TypeScript equivalent and capture outputs/side effects
    // Compare results and report differences
  }

  static async validateWorkspaceStructure(
    workspacePath: string,
    expectedFromBash: WorkspaceStructure
  ): Promise<boolean> {
    // Verify directory structure matches bash script output
    // Verify .env file contents match
    // Verify git worktree configuration matches
  }
}
```

### 8. Performance and Benchmark Testing
```typescript
export class PerformanceTester {
  static async benchmarkCommand(
    command: () => Promise<void>,
    maxDurationMs: number
  ): Promise<BenchmarkResult> {
    // Measure execution time
    // Compare against bash script baseline
    // Report performance metrics
  }

  static async loadTest(
    operation: () => Promise<void>,
    concurrency: number,
    iterations: number
  ): Promise<LoadTestResult> {
    // Test with multiple concurrent operations
    // Measure resource usage
    // Verify no race conditions
  }
}
```

### 9. Test Coverage and Quality Gates
```typescript
// Vitest configuration with strict coverage requirements
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95
        }
      },
      exclude: [
        'src/types/**',
        'src/**/*.test.ts',
        'src/**/*.mock.ts'
      ]
    },
    mockReset: true,
    clearMocks: true,
    restoreMocks: true
  }
})
```

### 10. Continuous Testing Infrastructure
```typescript
// GitHub Actions workflow integration
export class ContinuousTestingSetup {
  // Pre-commit hooks
  static setupPreCommitHooks(): void {
    // Run tests before every commit
    // Run linting and type checking
    // Prevent commits if tests fail
  }

  // CI/CD pipeline testing
  static setupCIPipeline(): void {
    // Test on multiple Node.js versions
    // Test on multiple operating systems
    // Run full test suite including integration tests
    // Generate coverage reports
    // Compare performance against baselines
  }
}
```

## Cross-Platform Considerations

### Platform Abstraction
```typescript
export interface PlatformUtils {
  openTerminal(path: string, command?: string): Promise<void>;
  getHomeDirectory(): string;
  getConfigDirectory(): string;
  killProcess(pid: number): Promise<void>;
}

export class MacOSPlatformUtils implements PlatformUtils {
  // macOS-specific implementations (osascript, etc.)
}

export class LinuxPlatformUtils implements PlatformUtils {
  // Linux-specific implementations
}

export class WindowsPlatformUtils implements PlatformUtils {
  // Windows-specific implementations
}
```

This architecture provides a solid foundation for implementing Hatchbox AI while maintaining exact functionality parity with the bash scripts and enabling future extensibility.