import { logger } from '../utils/logger.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { ResourceCleanup } from '../lib/ResourceCleanup.js'
import { ProcessManager } from '../lib/process/ProcessManager.js'
import { DatabaseManager } from '../lib/DatabaseManager.js'
import { NeonProvider } from '../lib/providers/NeonProvider.js'
import { EnvironmentManager } from '../lib/EnvironmentManager.js'
import { promptConfirmation } from '../utils/prompt.js'
import { IdentifierParser } from '../utils/IdentifierParser.js'
import { loadEnvIntoProcess } from '../utils/env.js'
import type { CleanupOptions } from '../types/index.js'
import type { CleanupResult } from '../types/cleanup.js'
import type { ParsedInput } from './start.js'

/**
 * Input structure for CleanupCommand.execute()
 */
export interface CleanupCommandInput {
  identifier?: string
  options: CleanupOptions
}

/**
 * Parsed and validated cleanup command input
 * Mode determines which cleanup operation to perform
 */
export interface ParsedCleanupInput {
  mode: 'list' | 'single' | 'issue' | 'all'
  identifier?: string
  issueNumber?: number
  branchName?: string
  originalInput?: string
  options: CleanupOptions
}

/**
 * Manages cleanup command execution with option parsing and validation
 * Follows the command pattern established by StartCommand
 *
 * This implementation handles ONLY parsing, validation, and mode determination.
 * Actual cleanup operations are deferred to subsequent sub-issues.
 */
export class CleanupCommand {
  private readonly gitWorktreeManager: GitWorktreeManager
  private readonly resourceCleanup: ResourceCleanup
  private readonly identifierParser: IdentifierParser

  constructor(
    gitWorktreeManager?: GitWorktreeManager,
    resourceCleanup?: ResourceCleanup
  ) {
    // Load environment variables first
    const envResult = loadEnvIntoProcess()
    if (envResult.error) {
      logger.debug(`Environment loading warning: ${envResult.error.message}`)
    }
    if (envResult.parsed) {
      logger.debug(`Loaded ${Object.keys(envResult.parsed).length} environment variables`)
    }

    this.gitWorktreeManager = gitWorktreeManager ?? new GitWorktreeManager()

    // Initialize ResourceCleanup with DatabaseManager
    if (!resourceCleanup) {
      const environmentManager = new EnvironmentManager()
      const neonProvider = new NeonProvider({
        projectId: process.env.NEON_PROJECT_ID ?? '',
        parentBranch: process.env.NEON_PARENT_BRANCH ?? '',
      })
      const databaseManager = new DatabaseManager(neonProvider, environmentManager)

      this.resourceCleanup = new ResourceCleanup(
        this.gitWorktreeManager,
        new ProcessManager(),
        databaseManager  // Add database manager
      )
    } else {
      this.resourceCleanup = resourceCleanup
    }

    // Initialize IdentifierParser for pattern-based detection
    this.identifierParser = new IdentifierParser(this.gitWorktreeManager)
  }

  /**
   * Main entry point for the cleanup command
   * Parses input, validates options, and determines operation mode
   */
  public async execute(input: CleanupCommandInput): Promise<void> {
    try {
      // Step 1: Parse input and determine mode
      const parsed = this.parseInput(input)

      // Step 2: Validate option combinations
      this.validateInput(parsed)

      // Step 3: Execute based on mode
      logger.info(`Cleanup mode: ${parsed.mode}`)

      if (parsed.mode === 'single') {
        await this.executeSingleCleanup(parsed)
      } else if (parsed.mode === 'list') {
        logger.info('Would list all worktrees')  // TODO: Implement in Sub-issue #2
        logger.success('Command parsing and validation successful')
      } else if (parsed.mode === 'all') {
        logger.info('Would remove all worktrees')  // TODO: Implement in Sub-issue #5
        logger.success('Command parsing and validation successful')
      } else if (parsed.mode === 'issue') {
        await this.executeIssueCleanup(parsed)
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`${error.message}`)
      } else {
        logger.error('An unknown error occurred')
      }
      throw error
    }
  }

  /**
   * Parse input to determine cleanup mode and extract relevant data
   * Implements auto-detection: numeric input = issue number, non-numeric = branch name
   *
   * @private
   */
  private parseInput(input: CleanupCommandInput): ParsedCleanupInput {
    const { identifier, options } = input

    // Trim identifier if present
    const trimmedIdentifier = identifier?.trim() ?? undefined

    // Mode: List (takes priority - it's informational only)
    if (options.list) {
      const result: ParsedCleanupInput = {
        mode: 'list',
        options
      }
      if (trimmedIdentifier) {
        result.identifier = trimmedIdentifier
      }
      return result
    }

    // Mode: All (remove everything)
    if (options.all) {
      const result: ParsedCleanupInput = {
        mode: 'all',
        options
      }
      if (trimmedIdentifier) {
        result.identifier = trimmedIdentifier
      }
      if (options.issue !== undefined) {
        result.issueNumber = options.issue
      }
      return result
    }

    // Mode: Explicit issue number via --issue flag
    if (options.issue !== undefined) {
      // Need to determine if identifier is branch or numeric to set branchName
      if (trimmedIdentifier) {
        const numericPattern = /^[0-9]+$/
        if (!numericPattern.test(trimmedIdentifier)) {
          // Identifier is a branch name with explicit --issue flag
          return {
            mode: 'issue',
            issueNumber: options.issue,
            branchName: trimmedIdentifier,
            identifier: trimmedIdentifier,
            originalInput: trimmedIdentifier,
            options
          }
        }
      }
      const result: ParsedCleanupInput = {
        mode: 'issue',
        issueNumber: options.issue,
        options
      }
      if (trimmedIdentifier) {
        result.identifier = trimmedIdentifier
      }
      return result
    }

    // Mode: Auto-detect from identifier
    if (!trimmedIdentifier) {
      throw new Error('Missing required argument: identifier. Use --all to remove all worktrees or --list to list them.')
    }

    // Auto-detection: Check if identifier is purely numeric
    // Pattern from bash script line 364: ^[0-9]+$
    const numericPattern = /^[0-9]+$/
    if (numericPattern.test(trimmedIdentifier)) {
      // Numeric input = issue number
      return {
        mode: 'issue',
        issueNumber: parseInt(trimmedIdentifier, 10),
        identifier: trimmedIdentifier,
        originalInput: trimmedIdentifier,
        options
      }
    } else {
      // Non-numeric = branch name
      return {
        mode: 'single',
        branchName: trimmedIdentifier,
        identifier: trimmedIdentifier,
        originalInput: trimmedIdentifier,
        options
      }
    }
  }

  /**
   * Validate parsed input for option conflicts
   * Throws descriptive errors for invalid option combinations
   *
   * @private
   */
  private validateInput(parsed: ParsedCleanupInput): void {
    const { mode, options, branchName } = parsed

    // Conflict: --list is informational only, incompatible with destructive operations
    if (mode === 'list') {
      if (options.all) {
        throw new Error('Cannot use --list with --all (list is informational only)')
      }
      if (options.issue !== undefined) {
        throw new Error('Cannot use --list with --issue (list is informational only)')
      }
      if (parsed.identifier) {
        throw new Error('Cannot use --list with a specific identifier (list shows all worktrees)')
      }
    }

    // Conflict: --all removes everything, can't combine with specific identifier or --issue
    if (mode === 'all') {
      if (parsed.identifier) {
        throw new Error('Cannot use --all with a specific identifier. Use one or the other.')
      }
      if (parsed.issueNumber !== undefined) {
        throw new Error('Cannot use --all with a specific identifier. Use one or the other.')
      }
    }

    // Conflict: explicit --issue flag with branch name identifier
    // (This prevents confusion when user provides both)
    if (options.issue !== undefined && branchName) {
      throw new Error('Cannot use --issue flag with branch name identifier. Use numeric identifier or --issue flag alone.')
    }

    // Note: --force and --dry-run are compatible with all modes (no conflicts)
  }

  /**
   * Execute cleanup for single worktree
   * Implements two-stage confirmation: worktree removal, then branch deletion
   * Uses IdentifierParser for pattern-based detection without GitHub API calls
   */
  private async executeSingleCleanup(parsed: ParsedCleanupInput): Promise<void> {
    const identifier = parsed.branchName ?? parsed.identifier ?? ''
    if (!identifier) {
      throw new Error('No identifier found for cleanup')
    }
    const { force, dryRun } = parsed.options

    // Step 1: Parse identifier using pattern-based detection
    const parsedInput: ParsedInput = await this.identifierParser.parseForPatternDetection(identifier)

    // Step 2: Validate cleanup safety (still uses string identifier for compatibility)
    const safety = await this.resourceCleanup.validateCleanupSafety(identifier)

    // Display blockers (fatal errors)
    if (!safety.isSafe) {
      const blockerMessage = safety.blockers.join(', ')
      throw new Error(`Cannot cleanup: ${blockerMessage}`)
    }

    // Display warnings (non-fatal)
    if (safety.warnings.length > 0) {
      safety.warnings.forEach(warning => logger.warn(warning))
    }

    // Display worktree details
    logger.info(`Preparing to cleanup worktree: ${identifier}`)

    // Step 3: First confirmation - worktree removal
    if (!force) {
      const confirmWorktree = await promptConfirmation('Remove this worktree?', true)
      if (!confirmWorktree) {
        logger.info('Cleanup cancelled')
        return
      }
    }

    // Step 4: Execute worktree cleanup with ParsedInput
    // With --force, delete branch automatically; otherwise handle separately
    const cleanupResult = await this.resourceCleanup.cleanupWorktree(parsedInput, {
      dryRun: dryRun ?? false,
      force: force ?? false,
      deleteBranch: force ?? false,  // Delete branch immediately if --force, otherwise prompt later
      keepDatabase: false,
    })

    // Step 5: Report cleanup results
    this.reportCleanupResults(cleanupResult)

    // Step 6: Second confirmation - branch deletion (only if not forced and worktree cleanup succeeded)
    if (cleanupResult.success && !force && cleanupResult.branchName) {
      const confirmBranch = await promptConfirmation('Also delete the branch?', true)
      if (confirmBranch) {
        await this.deleteBranchForCleanup(cleanupResult.branchName, { force: force ?? false, dryRun: dryRun ?? false })
      }
    }

    // Final success message
    if (cleanupResult.success) {
      logger.success('Cleanup completed successfully')
    } else {
      logger.warn('Cleanup completed with errors - see details above')
    }
  }

  /**
   * Delete branch as part of cleanup operation
   */
  private async deleteBranchForCleanup(
    branchName: string,
    options: { force?: boolean; dryRun?: boolean }
  ): Promise<void> {
    try {
      await this.resourceCleanup.deleteBranch(branchName, options)
      logger.success(`Branch deleted: ${branchName}`)
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to delete branch: ${error.message}`)
      }
      // Don't throw - branch deletion is optional/secondary operation
    }
  }

  /**
   * Report cleanup operation results to user
   */
  private reportCleanupResults(result: CleanupResult): void {
    logger.info('Cleanup operations:')

    result.operations.forEach(op => {
      const status = op.success ? '✓' : '✗'
      const message = op.error ? `${op.message}: ${op.error}` : op.message

      if (op.success) {
        logger.info(`  ${status} ${message}`)
      } else {
        logger.error(`  ${status} ${message}`)
      }
    })

    if (result.errors.length > 0) {
      logger.warn(`${result.errors.length} error(s) occurred during cleanup`)
    }
  }

  /**
   * Execute cleanup for all worktrees associated with an issue number
   * Implements bash cleanup-worktree.sh remove_worktrees_by_issue() (lines 157-242)
   */
  private async executeIssueCleanup(parsed: ParsedCleanupInput): Promise<void> {
    const issueNumber = parsed.issueNumber
    if (issueNumber === undefined) {
      throw new Error('No issue number provided for issue cleanup')
    }

    const { force, dryRun } = parsed.options

    logger.info(`Finding branches related to GitHub issue #${issueNumber}...`)

    // Step 1: Find all branches matching the issue number
    const { findAllBranchesForIssue } = await import('../utils/git.js')
    const branchNames = await findAllBranchesForIssue(issueNumber)

    if (branchNames.length === 0) {
      logger.warn(`No branches found for GitHub issue #${issueNumber}`)
      logger.info(`Searched for patterns like: issue-${issueNumber}, ${issueNumber}-*, feat-${issueNumber}, etc.`)
      return
    }

    // Step 2: Check worktree status for each branch
    const worktrees = await this.gitWorktreeManager.listWorktrees()
    const targets: Array<{ branchName: string; hasWorktree: boolean; worktreePath?: string }> = []

    for (const branchName of branchNames) {
      const worktree = worktrees.find(wt => wt.branch === branchName)
      const target: { branchName: string; hasWorktree: boolean; worktreePath?: string } = {
        branchName,
        hasWorktree: !!worktree
      }
      if (worktree?.path) {
        target.worktreePath = worktree.path
      }
      targets.push(target)
    }

    // Step 3: Display preview
    logger.info(`Found ${targets.length} branch(es) related to issue #${issueNumber}:`)
    for (const target of targets) {
      if (target.hasWorktree) {
        logger.info(`  🌿 ${target.branchName} (has worktree)`)
      } else {
        logger.warn(`  🌿 ${target.branchName} (branch only)`)
      }
    }

    const worktreeCount = targets.filter(t => t.hasWorktree).length

    if (worktreeCount === 0) {
      logger.warn('No worktrees to remove (all branches are branch-only)')

      // Still offer to delete branches
      if (!force) {
        const confirmBranches = await promptConfirmation(
          `Delete ${targets.length} branch(es)?`,
          false
        )
        if (!confirmBranches) {
          logger.info('Cleanup cancelled')
          return
        }
      }
    } else {
      // Step 4: Batch confirmation (unless --force)
      if (!force) {
        const confirmCleanup = await promptConfirmation(
          `Remove ${worktreeCount} worktree(s)?`,
          true
        )
        if (!confirmCleanup) {
          logger.info('Cleanup cancelled')
          return
        }
      }
    }

    // Step 5: Process each target sequentially
    let worktreesRemoved = 0
    let branchesDeleted = 0
    let databaseBranchesDeleted = 0
    let failed = 0

    for (const target of targets) {
      logger.info(`Processing branch: ${target.branchName}`)

      if (target.hasWorktree) {
        // Cleanup worktree using ResourceCleanup with ParsedInput
        try {
          // Parse the branch name using IdentifierParser
          const parsedInput: ParsedInput = await this.identifierParser.parseForPatternDetection(target.branchName)

          const result = await this.resourceCleanup.cleanupWorktree(parsedInput, {
            dryRun: dryRun ?? false,
            force: force ?? false,
            deleteBranch: false, // Handle branch deletion separately
            keepDatabase: false
          })

          if (result.success) {
            worktreesRemoved++
            logger.success(`  Worktree removed: ${target.branchName}`)

            // Check if database cleanup occurred
            const dbOperation = result.operations.find(op => op.type === 'database')
            if (dbOperation?.success && dbOperation.message.includes('cleaned up')) {
              databaseBranchesDeleted++
            }
          } else {
            failed++
            logger.error(`  Failed to remove worktree: ${target.branchName}`)
          }
        } catch (error) {
          failed++
          const errMsg = error instanceof Error ? error.message : 'Unknown error'
          logger.error(`  Failed to remove worktree: ${errMsg}`)
          continue // Continue with next branch even if this one failed
        }
      }

      // Step 6: Delete branch (both worktree and branch-only)
      try {
        await this.resourceCleanup.deleteBranch(target.branchName, {
          force: force ?? false,
          dryRun: dryRun ?? false
        })
        branchesDeleted++
        logger.success(`  Branch deleted: ${target.branchName}`)
      } catch (error) {
        // Don't count unmerged branch as failure - it's a safety feature
        const errMsg = error instanceof Error ? error.message : String(error)
        if (errMsg.includes('not fully merged')) {
          logger.warn(`  Branch not fully merged, skipping deletion`)
          logger.warn(`  Use --force to delete anyway`)
        } else {
          // Other errors are real failures
          logger.error(`  Failed to delete branch: ${errMsg}`)
        }
      }
    }

    // Step 7: Report statistics
    logger.success(`Completed cleanup for issue #${issueNumber}:`)
    logger.info(`   📁 Worktrees removed: ${worktreesRemoved}`)
    logger.info(`   🌿 Branches deleted: ${branchesDeleted}`)
    if (databaseBranchesDeleted > 0) {
      logger.info(`   🗂️ Database branches deleted: ${databaseBranchesDeleted}`)
    }
    if (failed > 0) {
      logger.warn(`   ❌ Failed operations: ${failed}`)
    }
  }
}
