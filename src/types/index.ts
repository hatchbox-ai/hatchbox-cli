// Core types
export interface Workspace {
  id: string
  path: string
  branch: string
  issueNumber?: number
  prNumber?: number
  port: number
  databaseBranch?: string
  createdAt: Date
  lastAccessed: Date
}

export interface WorkspaceInput {
  identifier: string
  type: 'issue' | 'pr' | 'branch'
  skipClaude?: boolean
}

export interface WorkspaceSummary {
  id: string
  issueNumber?: number
  prNumber?: number
  title: string
  branch: string
  port: number
  status: 'active' | 'stale' | 'error'
  lastAccessed: string
}

// Git types
export interface Worktree {
  path: string
  branch: string
  commit: string
  isPR: boolean
  prNumber?: number
  issueNumber?: number
  port?: number
}

export interface GitStatus {
  hasUncommittedChanges: boolean
  unstagedFiles: string[]
  stagedFiles: string[]
  currentBranch: string
  isAheadOfRemote: boolean
  isBehindRemote: boolean
}

// GitHub types
export interface Issue {
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  url: string
}

export interface PullRequest {
  number: number
  title: string
  body: string
  state: 'open' | 'closed' | 'merged'
  branch: string
  baseBranch: string
  url: string
  isDraft: boolean
}

// Database types

/**
 * Result of database branch deletion operation
 * Distinguishes between successful deletion, branch not found, and errors
 */
export interface DatabaseDeletionResult {
  /** Overall operation succeeded (true even if branch didn't exist) */
  success: boolean
  /** True only if a branch was actually deleted */
  deleted: boolean
  /** True if branch didn't exist (not an error, just nothing to do) */
  notFound: boolean
  /** Error message if operation failed */
  error?: string
  /** User declined deletion (for preview databases) */
  userDeclined?: boolean
  /** Name of the branch that was processed */
  branchName?: string
}

export interface DatabaseProvider {
  // Core operations
  createBranch(name: string, fromBranch?: string, cwd?: string): Promise<string>
  deleteBranch(name: string, isPreview?: boolean, cwd?: string): Promise<DatabaseDeletionResult>
  getConnectionString(branch: string, cwd?: string): Promise<string>
  listBranches(cwd?: string): Promise<string[]>
  branchExists(name: string, cwd?: string): Promise<boolean>

  // Additional operations for Vercel integration and validation
  findPreviewBranch(branchName: string, cwd?: string): Promise<string | null>
  getBranchNameFromEndpoint(endpointId: string, cwd?: string): Promise<string | null>
  sanitizeBranchName(branchName: string): string
  isAuthenticated(cwd?: string): Promise<boolean>
  isCliAvailable(): Promise<boolean>

  // Configuration validation
  isConfigured(): boolean
}

// Configuration types
export interface Config {
  defaultPort: number
  databaseProvider?: 'neon' | 'supabase' | 'planetscale'
  claudeModel?: 'opus' | 'sonnet' | 'haiku'
  skipClaude?: boolean
  customWorkspaceRoot?: string
}

// Command option types
export interface StartOptions {
  // Individual component flags (can be combined)
  claude?: boolean
  code?: boolean
  devServer?: boolean
}

export interface FinishOptions {
  force?: boolean      // -f, --force - Skip confirmation prompts
  dryRun?: boolean    // -n, --dry-run - Preview actions without executing
  pr?: number         // --pr <number> - Treat input as PR number
  skipBuild?: boolean // --skip-build - Skip post-merge build verification
}

/**
 * Options for the cleanup command
 * All flags are optional and can be combined (subject to validation)
 */
export interface CleanupOptions {
  /** List all worktrees without removing anything */
  list?: boolean
  /** Remove all worktrees (interactive confirmation required unless --force) */
  all?: boolean
  /** Cleanup by specific issue number */
  issue?: number
  /** Skip confirmations and force removal */
  force?: boolean
  /** Show what would be done without actually doing it */
  dryRun?: boolean
}

export interface ListOptions {
  json?: boolean
}

// Deprecated: Result types - use exception-based error handling instead
// export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E }

// Mock factory types for testing
export interface MockOptions {
  scenario: 'empty' | 'existing' | 'conflicts' | 'error'
  data?: unknown
}

// Worktree management types
export * from './worktree.js'

// Environment management types
export * from './environment.js'

// Hatchbox types
export * from './hatchbox.js'

// Cleanup types
export * from './cleanup.js'

// Process types (excluding Platform which is already defined above)
export type { ProcessInfo } from './process.js'

// Color synchronization types
export interface RgbColor {
	r: number
	g: number
	b: number
}

export interface ColorData {
	rgb: RgbColor
	hex: string
	index: number
}

export type Platform = 'darwin' | 'linux' | 'win32' | 'unsupported'

// Validation types
export interface ValidationOptions {
	dryRun?: boolean
	skipTypecheck?: boolean
	skipLint?: boolean
	skipTests?: boolean
}

export interface ValidationStepResult {
	step: 'typecheck' | 'lint' | 'test'
	passed: boolean
	skipped: boolean
	output?: string
	error?: string
	duration?: number
}

export interface ValidationResult {
	success: boolean
	steps: ValidationStepResult[]
	totalDuration: number
}

// Commit management types
export interface CommitOptions {
	dryRun?: boolean
	issueNumber?: number  // For "Fixes #N" trailer
	message?: string      // Custom message override
	noReview?: boolean    // Skip user review of commit message
}

// Merge management types
export interface MergeOptions {
	dryRun?: boolean      // Preview actions without executing
	force?: boolean       // Skip confirmation prompts
	repoRoot?: string     // Repository root path (optional, auto-detected if not provided)
}

export interface MergeResult {
	success: boolean
	branchName: string
	commitsMerged: number
	rebaseCompleted: boolean
	mergeCompleted: boolean
}
