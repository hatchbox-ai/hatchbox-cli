import { logger } from '../utils/logger.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import type { CleanupOptions } from '../types/index.js'

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
  // Will be used in subsequent sub-issues for actual cleanup operations
  // @ts-expect-error - Intentionally unused until sub-issues 2-5 implement cleanup operations
  private readonly gitWorktreeManager: GitWorktreeManager

  constructor(gitWorktreeManager?: GitWorktreeManager) {
    this.gitWorktreeManager = gitWorktreeManager ?? new GitWorktreeManager()
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

      // Step 3: Log what mode was determined (for now - actual operations in later issues)
      logger.info(`Cleanup mode: ${parsed.mode}`)
      if (parsed.mode === 'list') {
        logger.info('Would list all worktrees')
      } else if (parsed.mode === 'all') {
        logger.info('Would remove all worktrees')
      } else if (parsed.mode === 'issue') {
        logger.info(`Would cleanup worktrees for issue #${parsed.issueNumber}`)
      } else if (parsed.mode === 'single') {
        logger.info(`Would cleanup worktree: ${parsed.branchName}`)
      }

      // Actual cleanup operations will be implemented in subsequent sub-issues:
      // - Sub-issue #2: List functionality
      // - Sub-issue #3: Single worktree removal
      // - Sub-issue #4: Issue-based cleanup
      // - Sub-issue #5: Bulk cleanup (all)

      logger.success('Command parsing and validation successful')
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
}
