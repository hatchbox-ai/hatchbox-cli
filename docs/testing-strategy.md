# Comprehensive Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for Hatchbox AI, emphasizing test-driven development (TDD) as the primary motivation for migrating from bash scripts to TypeScript. The testing strategy ensures 95%+ code coverage, comprehensive edge case handling, and complete bash script behavioral parity.

## Testing Philosophy

### Core Principles

1. **Test-First Development (TDD)**: Every line of code is preceded by a failing test
2. **Comprehensive Coverage**: Minimum 95% code coverage with meaningful tests
3. **Mock All Externals**: Complete isolation from external dependencies
4. **Regression Assurance**: Automated verification of bash script behavioral parity
5. **Edge Case Discovery**: Property-based testing to uncover unexpected scenarios
6. **Performance Validation**: Benchmarking against bash script performance
7. **Maintainability Focus**: Tests serve as living documentation and change detection

### Why We Moved from Bash to TypeScript

**Primary Motivation**: Testing and Maintainability
- Bash scripts cannot be reliably unit tested
- Complex workflows in bash are difficult to debug and maintain
- No type safety leads to runtime errors in production
- External dependency failures are hard to simulate and handle
- Refactoring bash scripts is risky without test coverage

**TypeScript Advantages**:
- Complete test coverage with isolated unit tests
- Type safety prevents entire classes of runtime errors
- Mocking enables testing of all scenarios including failures
- Refactoring is safe with comprehensive test coverage
- Better error messages and debugging capabilities

## Testing Architecture

### Test Structure Overview

```
tests/
├── unit/                           # Isolated unit tests
│   ├── lib/                       # Core business logic tests
│   │   ├── GitWorktreeManager.test.ts
│   │   ├── GitHubService.test.ts
│   │   ├── EnvironmentManager.test.ts
│   │   ├── DatabaseManager.test.ts
│   │   └── providers/
│   │       └── NeonProvider.test.ts
│   ├── utils/                     # Utility function tests
│   │   ├── git.test.ts
│   │   ├── github.test.ts
│   │   ├── env.test.ts
│   │   └── shell.test.ts
│   └── commands/                  # Command class tests
│       ├── start.test.ts
│       ├── finish.test.ts
│       ├── cleanup.test.ts
│       ├── list.test.ts
│       └── switch.test.ts
├── integration/                   # Module interaction tests
│   ├── workflows/                 # Complete workflow tests
│   │   ├── issue-workflow.test.ts
│   │   ├── pr-workflow.test.ts
│   │   └── merge-workflow.test.ts
│   └── providers/                 # Provider integration tests
│       └── database-providers.test.ts
├── e2e/                          # End-to-end tests
│   ├── cli/                      # Full CLI command tests
│   │   ├── start-command.test.ts
│   │   ├── finish-command.test.ts
│   │   └── cleanup-command.test.ts
│   └── regression/               # Bash script parity tests
│       ├── bash-comparison.test.ts
│       └── output-format.test.ts
├── performance/                  # Performance and benchmark tests
│   ├── benchmarks/
│   │   ├── command-performance.test.ts
│   │   └── bash-comparison.test.ts
│   └── load/
│       └── concurrent-operations.test.ts
├── property/                     # Property-based tests
│   ├── environment.property.test.ts
│   ├── git.property.test.ts
│   └── validation.property.test.ts
├── fixtures/                     # Test data and scenarios
│   ├── github/                   # GitHub API responses
│   ├── git/                     # Git command outputs
│   ├── neon/                    # Neon CLI responses
│   └── workspaces/              # Sample workspace states
├── mocks/                       # Mock implementations
│   ├── factories/               # Mock factory classes
│   ├── git-cli.mock.ts         # Git command mocking
│   ├── github-cli.mock.ts      # GitHub CLI mocking
│   ├── neon-cli.mock.ts        # Neon CLI mocking
│   ├── claude-cli.mock.ts      # Claude CLI mocking
│   └── filesystem.mock.ts      # File system mocking
└── utils/                      # Testing utilities
    ├── test-helpers.ts         # Common test utilities
    ├── mock-setup.ts          # Mock configuration
    ├── fixtures-loader.ts     # Test data loading
    └── assertion-helpers.ts   # Custom assertions
```

## Test Types and Strategies

### 1. Unit Tests

**Purpose**: Test individual functions and classes in complete isolation

**Strategy**:
- Every public method has corresponding unit tests
- All external dependencies mocked using factories
- Test all code paths including error scenarios
- Use AAA pattern (Arrange, Act, Assert)

**Example Structure**:
```typescript
describe('GitWorktreeManager', () => {
  let manager: GitWorktreeManager
  let mockShell: MockShellUtils

  beforeEach(() => {
    mockShell = MockFactories.createShellUtils()
    manager = new GitWorktreeManager(mockShell)
  })

  describe('createWorktree', () => {
    it('should create worktree with valid branch name', async () => {
      // Arrange
      const branch = 'feat/test-branch'
      const path = '/test/worktree/path'
      mockShell.mockGitCommand('worktree add', { exitCode: 0 })

      // Act
      await manager.createWorktree(branch, path)

      // Assert
      expect(mockShell.verifyCommandCalled).toHaveBeenCalledWith(
        'git', ['worktree', 'add', path, branch]
      )
    })

    it('should throw error when git command fails', async () => {
      // Arrange
      mockShell.mockGitCommand('worktree add', {
        exitCode: 1,
        stderr: 'fatal: invalid reference'
      })

      // Act & Assert
      await expect(manager.createWorktree('invalid', '/path'))
        .rejects.toThrow('Failed to create worktree')
    })
  })
})
```

**Coverage Requirements**:
- 95% line coverage minimum
- 90% branch coverage minimum
- 100% function coverage
- All error paths tested

### 2. Integration Tests

**Purpose**: Test interactions between modules and components

**Strategy**:
- Test realistic workflows combining multiple modules
- Use real file system operations with temporary directories
- Mock only external CLI tools, not internal modules
- Verify complete data flow through the system

**Example Structure**:
```typescript
describe('Issue Workflow Integration', () => {
  let tempDir: string
  let workspaceManager: WorkspaceManager

  beforeEach(async () => {
    tempDir = await TestHelpers.createTempDirectory()
    const mocks = await TestHelpers.setupIntegrationMocks()
    workspaceManager = TestHelpers.createWorkspaceManager(mocks)
  })

  afterEach(async () => {
    await TestHelpers.cleanupTempDirectory(tempDir)
  })

  it('should complete full issue workflow from start to finish', async () => {
    // Setup GitHub issue mock
    MockFactories.github.mockIssue(25, {
      title: 'Add authentication feature',
      state: 'open'
    })

    // Create workspace
    const workspace = await workspaceManager.createWorkspace({
      type: 'issue',
      value: '25'
    })

    // Verify workspace structure
    expect(workspace.type).toBe('issue')
    expect(workspace.issueNumber).toBe(25)
    expect(await TestHelpers.directoryExists(workspace.path)).toBe(true)

    // Verify .env file created with correct port
    const envFile = path.join(workspace.path, '.env')
    const envContent = await TestHelpers.readFile(envFile)
    expect(envContent).toContain('NEXT_PUBLIC_SERVER_URL=http://localhost:3025')

    // Test finish workflow
    await workspaceManager.finishWorkspace('25')

    // Verify cleanup completed
    expect(await TestHelpers.directoryExists(workspace.path)).toBe(false)
  })
})
```

### 3. End-to-End (E2E) Tests

**Purpose**: Test complete CLI workflows as users would experience them

**Strategy**:
- Test full CLI commands from command-line invocation
- Use real temporary directories and mock external services
- Capture and validate CLI output and exit codes
- Test complex scenarios with multiple commands

**Example Structure**:
```typescript
describe('CLI End-to-End Tests', () => {
  let testRepo: string

  beforeEach(async () => {
    testRepo = await TestHelpers.setupTestRepository()
    process.chdir(testRepo)
  })

  it('should complete start -> work -> finish cycle', async () => {
    // Mock GitHub issue
    MockFactories.github.mockIssue(42, {
      title: 'Fix critical bug',
      state: 'open'
    })

    // Run start command
    const startResult = await TestHelpers.runCLI(['start', '42'])
    expect(startResult.exitCode).toBe(0)
    expect(startResult.stdout).toContain('✅ Workspace created for issue #42')

    // Verify worktree created
    const worktrees = await TestHelpers.runCLI(['list'])
    expect(worktrees.stdout).toContain('issue-42')

    // Make some changes
    await TestHelpers.createTestFile('test-change.txt', 'test content')

    // Run finish command
    const finishResult = await TestHelpers.runCLI(['finish', '42'])
    expect(finishResult.exitCode).toBe(0)
    expect(finishResult.stdout).toContain('✅ Workspace finished and cleaned up')

    // Verify cleanup
    const finalWorktrees = await TestHelpers.runCLI(['list'])
    expect(finalWorktrees.stdout).not.toContain('issue-42')
  })
})
```

### 4. Regression Tests

**Purpose**: Ensure TypeScript version behaves identically to bash scripts

**Strategy**:
- Compare outputs and side effects between bash and TypeScript versions
- Test with same inputs and verify same results
- Automated testing of behavior parity
- File system state comparison

**Example Structure**:
```typescript
describe('Bash Script Regression Tests', () => {
  let tempDir: string
  let bashScriptPath: string

  beforeEach(async () => {
    tempDir = await TestHelpers.createTempDirectory()
    bashScriptPath = path.join(__dirname, '../bash/new-branch-workflow.sh')
  })

  it('should produce identical worktree structure as bash script', async () => {
    const issueNumber = 25

    // Run bash script
    const bashResult = await TestHelpers.runBashScript(bashScriptPath, [issueNumber.toString()])
    const bashWorktreeStructure = await TestHelpers.captureWorktreeStructure()

    // Reset environment
    await TestHelpers.cleanupAllWorktrees()

    // Run TypeScript equivalent
    const tsResult = await TestHelpers.runCLI(['start', issueNumber.toString()])
    const tsWorktreeStructure = await TestHelpers.captureWorktreeStructure()

    // Compare results
    expect(tsResult.exitCode).toBe(bashResult.exitCode)
    expect(tsWorktreeStructure).toEqual(bashWorktreeStructure)

    // Compare .env file contents
    const bashEnvContent = await TestHelpers.readFile(bashWorktreeStructure.envFile)
    const tsEnvContent = await TestHelpers.readFile(tsWorktreeStructure.envFile)
    expect(tsEnvContent).toBe(bashEnvContent)
  })

  it('should produce identical output format as bash script', async () => {
    const bashOutput = await TestHelpers.runBashScript(bashScriptPath, ['--help'])
    const tsOutput = await TestHelpers.runCLI(['start', '--help'])

    // Compare output structure (ignoring colors and styling)
    const bashNormalized = TestHelpers.normalizeOutput(bashOutput.stdout)
    const tsNormalized = TestHelpers.normalizeOutput(tsOutput.stdout)

    expect(tsNormalized).toEqual(bashNormalized)
  })
})
```

### 5. Property-Based Tests

**Purpose**: Discover edge cases through automated test generation

**Strategy**:
- Use fast-check to generate random inputs
- Test invariants and properties that should always hold
- Discover edge cases that manual testing might miss
- Focus on data validation and transformation functions

**Example Structure**:
```typescript
import { fc } from 'fast-check'

describe('Property-Based Tests', () => {
  describe('Environment Variable Handling', () => {
    it('should round-trip environment variables correctly', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('=')), // key
        fc.string({ maxLength: 1000 }), // value
        async (key, value) => {
          const envManager = new EnvironmentManager(mockFileUtils)
          const testFile = await TestHelpers.createTempFile()

          // Set environment variable
          await envManager.setEnvVar(testFile, key, value)

          // Get environment variable
          const retrieved = await envManager.getEnvVar(testFile, key)

          // Should round-trip correctly
          expect(retrieved).toBe(value)
        }
      ))
    })

    it('should handle concurrent environment variable updates safely', () => {
      fc.assert(fc.property(
        fc.array(fc.tuple(fc.string(), fc.string()), { minLength: 1, maxLength: 10 }),
        async (keyValuePairs) => {
          const envManager = new EnvironmentManager(mockFileUtils)
          const testFile = await TestHelpers.createTempFile()

          // Set all variables concurrently
          await Promise.all(
            keyValuePairs.map(([key, value]) =>
              envManager.setEnvVar(testFile, key, value)
            )
          )

          // Verify all variables set correctly
          for (const [key, expectedValue] of keyValuePairs) {
            const actualValue = await envManager.getEnvVar(testFile, key)
            expect(actualValue).toBe(expectedValue)
          }
        }
      ))
    })
  })

  describe('Port Calculation', () => {
    it('should always produce valid port numbers', () => {
      fc.assert(fc.property(
        fc.integer({ min: 1, max: 999999 }), // issue number
        (issueNumber) => {
          const envManager = new EnvironmentManager(mockFileUtils)
          const port = envManager.calculatePort(issueNumber)

          expect(port).toBeGreaterThan(3000)
          expect(port).toBeLessThan(65536)
          expect(Number.isInteger(port)).toBe(true)
        }
      ))
    })
  })
})
```

### 6. Performance Tests

**Purpose**: Ensure TypeScript version performs adequately compared to bash scripts

**Strategy**:
- Benchmark critical operations against bash equivalents
- Set performance budgets and fail tests if exceeded
- Test with realistic data volumes
- Monitor memory usage and cleanup

**Example Structure**:
```typescript
describe('Performance Tests', () => {
  describe('Command Performance', () => {
    it('should complete workspace creation within performance budget', async () => {
      const startTime = performance.now()

      await workspaceManager.createWorkspace({
        type: 'issue',
        value: '25'
      })

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000)
    })

    it('should not exceed 150% of bash script performance', async () => {
      const bashTime = await TestHelpers.benchmarkBashScript('new-branch-workflow.sh', ['25'])
      const tsTime = await TestHelpers.benchmarkCLI(['start', '25'])

      expect(tsTime).toBeLessThan(bashTime * 1.5)
    })
  })

  describe('Memory Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Perform 100 create/cleanup cycles
      for (let i = 0; i < 100; i++) {
        const workspace = await workspaceManager.createWorkspace({
          type: 'issue',
          value: `test-${i}`
        })
        await workspaceManager.cleanupWorkspace(workspace.id)
      }

      // Force garbage collection if available
      if (global.gc) global.gc()

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be minimal (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
    })
  })
})
```

## Mock Strategy

### Mock Factory Architecture

**Design Principles**:
- Single source of truth for each external dependency
- Realistic response scenarios including edge cases
- Easy setup and teardown for test isolation
- Comprehensive verification capabilities

**Mock Factory Implementation**:

```typescript
export class MockFactories {
  static git = new GitMockFactory()
  static github = new GitHubMockFactory()
  static neon = new NeonMockFactory()
  static claude = new ClaudeMockFactory()
  static filesystem = new FileSystemMockFactory()

  static resetAll(): void {
    this.git.reset()
    this.github.reset()
    this.neon.reset()
    this.claude.reset()
    this.filesystem.reset()
  }
}

export class GitMockFactory {
  private commandMocks = new Map<string, MockResponse>()

  mockWorktreeList(worktrees: WorktreeData[]): void {
    const output = worktrees.map(w =>
      `worktree ${w.path}\n${w.commit}\nbranch refs/heads/${w.branch}\n`
    ).join('\n')

    this.commandMocks.set('worktree list --porcelain', {
      exitCode: 0,
      stdout: output,
      stderr: ''
    })
  }

  mockWorktreeAdd(path: string, branch: string, success = true): void {
    this.commandMocks.set(`worktree add ${path} ${branch}`, {
      exitCode: success ? 0 : 1,
      stdout: success ? `Preparing worktree (new branch '${branch}')` : '',
      stderr: success ? '' : `fatal: '${path}' already exists`
    })
  }

  verifyCommandCalled(command: string, times = 1): void {
    // Verification logic
  }

  reset(): void {
    this.commandMocks.clear()
  }
}

export class GitHubMockFactory {
  private issues = new Map<number, Issue>()
  private prs = new Map<number, PullRequest>()

  mockIssue(number: number, data: Partial<Issue>): void {
    this.issues.set(number, {
      number,
      title: `Issue #${number}`,
      body: '',
      state: 'open',
      labels: [],
      ...data
    })
  }

  mockPR(number: number, data: Partial<PullRequest>): void {
    this.prs.set(number, {
      number,
      title: `PR #${number}`,
      body: '',
      state: 'open',
      headRefName: `feature/pr-${number}`,
      baseRefName: 'main',
      ...data
    })
  }

  mockCliResponse(command: string, response: string): void {
    // Mock gh CLI responses
  }

  reset(): void {
    this.issues.clear()
    this.prs.clear()
  }
}
```

### Mock Usage Patterns

**Setup and Teardown**:
```typescript
describe('GitWorktreeManager', () => {
  beforeEach(() => {
    MockFactories.resetAll()
  })

  afterEach(() => {
    MockFactories.resetAll()
  })

  it('should list existing worktrees', async () => {
    // Arrange
    MockFactories.git.mockWorktreeList([
      { path: '/repo/main', branch: 'main', commit: 'abc123' },
      { path: '/repo/feature', branch: 'feat/test', commit: 'def456' }
    ])

    const manager = new GitWorktreeManager(MockFactories.git.createShellUtils())

    // Act
    const worktrees = await manager.listWorktrees()

    // Assert
    expect(worktrees).toHaveLength(2)
    expect(worktrees[0].branch).toBe('main')
    expect(worktrees[1].branch).toBe('feat/test')
  })
})
```

## Test Data Management

### Fixture Strategy

**Structure**:
- **Static Fixtures**: Predefined test data for common scenarios
- **Dynamic Fixtures**: Generated test data for specific test needs
- **Realistic Data**: Based on actual GitHub issues, Git repositories, etc.

**Implementation**:
```typescript
export class TestFixtures {
  static readonly SAMPLE_ISSUE: Issue = {
    number: 25,
    title: 'Add user authentication',
    body: 'We need to implement OAuth login...',
    state: 'open',
    labels: ['enhancement', 'authentication']
  }

  static readonly SAMPLE_PR: PullRequest = {
    number: 148,
    title: 'Implement OAuth login',
    body: 'This PR implements the OAuth login feature...',
    state: 'open',
    headRefName: 'feat/oauth-login',
    baseRefName: 'main'
  }

  static createIssue(overrides: Partial<Issue> = {}): Issue {
    return {
      ...this.SAMPLE_ISSUE,
      ...overrides,
      number: overrides.number || Math.floor(Math.random() * 1000)
    }
  }

  static async createTempRepository(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cwm-test-'))
    await execa('git', ['init'], { cwd: tempDir })
    await execa('git', ['config', 'user.name', 'Test User'], { cwd: tempDir })
    await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir })

    // Create initial commit
    await fs.writeFile(path.join(tempDir, 'README.md'), '# Test Repository')
    await execa('git', ['add', 'README.md'], { cwd: tempDir })
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir })

    return tempDir
  }

  static async createWorkspaceScenario(
    type: 'issue' | 'pr' | 'custom',
    options: Partial<WorkspaceOptions> = {}
  ): Promise<TestWorkspaceScenario> {
    const repoPath = await this.createTempRepository()

    switch (type) {
      case 'issue':
        MockFactories.github.mockIssue(options.number || 25, {
          title: options.title || 'Test Issue',
          state: options.state || 'open'
        })
        break
      case 'pr':
        MockFactories.github.mockPR(options.number || 148, {
          title: options.title || 'Test PR',
          state: options.state || 'open'
        })
        break
    }

    return {
      repoPath,
      type,
      number: options.number || (type === 'pr' ? 148 : 25)
    }
  }
}
```

## Continuous Integration Strategy

### GitHub Actions Configuration

**Test Pipeline Structure**:
```yaml
name: Comprehensive Testing

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [18, 20, 21]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint and type check
        run: |
          npm run lint
          npm run type-check

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run e2e tests
        run: npm run test:e2e

      - name: Run property-based tests
        run: npm run test:property

      - name: Run performance tests
        run: npm run test:performance

      - name: Generate coverage report
        run: npm run coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info

      - name: Check coverage threshold
        run: npm run coverage:check
```

### Quality Gates

**Pre-commit Hooks**:
```typescript
// .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run lint
npm run type-check
npm run test:affected
npm run coverage:check
```

**Coverage Requirements**:
```typescript
// vitest.config.ts
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
        'src/**/*.mock.ts',
        'tests/**'
      ]
    }
  }
})
```

## Success Metrics

### Quantitative Metrics

**Test Coverage**:
- [ ] >95% line coverage
- [ ] >90% branch coverage
- [ ] 100% function coverage
- [ ] >1000 total test cases

**Performance Benchmarks**:
- [ ] TypeScript version ≤150% of bash script execution time
- [ ] Memory usage <100MB for typical operations
- [ ] Startup time <2 seconds

**Reliability Metrics**:
- [ ] <1% test failure rate in CI
- [ ] 100% bash script behavioral parity
- [ ] Zero data loss in all tested scenarios

### Qualitative Metrics

**Developer Experience**:
- [ ] Tests serve as clear documentation
- [ ] Easy to add new tests for new features
- [ ] Fast test execution (<30 seconds for full suite)
- [ ] Clear error messages from failing tests

**Maintainability**:
- [ ] Refactoring confidence through test coverage
- [ ] Easy debugging through isolated unit tests
- [ ] Clear separation between mocked and real dependencies

This comprehensive testing strategy ensures that the TypeScript implementation is more reliable, maintainable, and robust than the original bash scripts while providing complete behavioral parity and enhanced error handling capabilities.