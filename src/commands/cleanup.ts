import { logger } from '../utils/logger.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { ResourceCleanup } from '../lib/ResourceCleanup.js'
import { ProcessManager } from '../lib/process/ProcessManager.js'
import { promptConfirmation } from '../utils/prompt.js'
import type { CleanupOptions } from '../types/index.js'
import type { CleanupResult } from '../types/cleanup.js'

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

  constructor(
    gitWorktreeManager?: GitWorktreeManager,
    resourceCleanup?: ResourceCleanup
  ) {
    this.gitWorktreeManager = gitWorktreeManager ?? new GitWorktreeManager()

    // Initialize ResourceCleanup if not provided
    this.resourceCleanup = resourceCleanup ?? new ResourceCleanup(
      this.gitWorktreeManager,
      new ProcessManager(),
      undefined // DatabaseManager optional
    )
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
        logger.info(`Would cleanup worktrees for issue #${parsed.issueNumber}`)  // TODO: Implement in Sub-issue #4
        logger.success('Command parsing and validation successful')
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
   */
  private async executeSingleCleanup(parsed: ParsedCleanupInput): Promise<void> {
    const identifier = parsed.branchName ?? parsed.identifier ?? ''
    if (!identifier) {
      throw new Error('No identifier found for cleanup')
    }
    const { force, dryRun } = parsed.options

    // Step 1: Validate cleanup safety
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

    // Step 2: First confirmation - worktree removal
    if (!force) {
      const confirmWorktree = await promptConfirmation('Remove this worktree?', true)
      if (!confirmWorktree) {
        logger.info('Cleanup cancelled')
        return
      }
    }

    // Step 3: Execute worktree cleanup
    // With --force, delete branch automatically; otherwise handle separately
    const cleanupResult = await this.resourceCleanup.cleanupWorktree(identifier, {
      dryRun: dryRun ?? false,
      force: force ?? false,
      deleteBranch: force ?? false,  // Delete branch immediately if --force, otherwise prompt later
      keepDatabase: false,
    })

    // Step 4: Report cleanup results
    this.reportCleanupResults(cleanupResult)

    // Step 5: Second confirmation - branch deletion (only if not forced and worktree cleanup succeeded)
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
}
