import { executeGitCommand } from '../utils/git.js'
import { logger } from '../utils/logger.js'
import type { GitStatus, CommitOptions } from '../types/index.js'

/**
 * CommitManager handles uncommitted changes detection and auto-commit
 * Ports logic from bash/merge-and-clean.sh lines 610-643
 */
export class CommitManager {
  /**
   * Detect uncommitted changes in a worktree
   * Parses git status --porcelain output into structured GitStatus
   */
  async detectUncommittedChanges(worktreePath: string): Promise<GitStatus> {
    // Execute: git status --porcelain
    const porcelainOutput = await executeGitCommand(['status', '--porcelain'], {
      cwd: worktreePath,
    })

    // Parse output to get staged and unstaged files
    const { stagedFiles, unstagedFiles } = this.parseGitStatus(porcelainOutput)

    // Get current branch name
    const currentBranch = await executeGitCommand(['branch', '--show-current'], {
      cwd: worktreePath,
    })

    return {
      hasUncommittedChanges: stagedFiles.length > 0 || unstagedFiles.length > 0,
      unstagedFiles,
      stagedFiles,
      currentBranch: currentBranch.trim(),
      // Defer these to future enhancement
      isAheadOfRemote: false,
      isBehindRemote: false,
    }
  }


  /**
   * Stage all changes and commit with simple message
   * For issues: "WIP: Auto-commit for issue #N\n\nFixes #N"
   * For branches: "WIP: Auto-commit uncommitted changes"
   */
  async commitChanges(worktreePath: string, options: CommitOptions): Promise<void> {
    // Generate commit message first to include in dry-run log
    const message = this.generateCommitMessage(options)

    // Step 1: Check dry-run mode
    if (options.dryRun) {
      logger.info('[DRY RUN] Would run: git add -A')
      logger.info(`[DRY RUN] Would commit with message: ${message}`)
      return
    }

    // Step 2: Stage all changes
    await executeGitCommand(['add', '-A'], { cwd: worktreePath })

    // Step 3: Commit
    try {
      await executeGitCommand(['commit', '-m', message], { cwd: worktreePath })
    } catch (error) {
      // Handle "nothing to commit" scenario gracefully
      if (error instanceof Error && error.message.includes('nothing to commit')) {
        logger.info('No changes to commit')
        return
      }
      // Re-throw all other errors (including pre-commit hook failures)
      throw error
    }
  }

  /**
   * Generate simple commit message based on options
   */
  private generateCommitMessage(options: CommitOptions): string {
    // If custom message provided, use it
    if (options.message) {
      return options.message
    }

    // Generate WIP message
    if (options.issueNumber) {
      return `WIP: Auto-commit for issue #${options.issueNumber}\n\nFixes #${options.issueNumber}`
    } else {
      return 'WIP: Auto-commit uncommitted changes'
    }
  }

  /**
   * Parse git status --porcelain output
   * Format: "XY filename" where X=index, Y=worktree
   * Examples:
   *   "M  file.ts" - staged modification
   *   " M file.ts" - unstaged modification
   *   "MM file.ts" - both staged and unstaged
   *   "?? file.ts" - untracked
   */
  private parseGitStatus(porcelainOutput: string): {
    stagedFiles: string[]
    unstagedFiles: string[]
  } {
    const stagedFiles: string[] = []
    const unstagedFiles: string[] = []

    if (!porcelainOutput.trim()) {
      return { stagedFiles, unstagedFiles }
    }

    const lines = porcelainOutput.split('\n').filter((line) => line.trim())

    for (const line of lines) {
      if (line.length < 3) continue

      const indexStatus = line[0] // First character - staging area status
      const worktreeStatus = line[1] // Second character - working tree status
      const filename = line.substring(3) // Everything after "XY "

      // Check if file is staged
      // First char != ' ' and != '?' → staged
      if (indexStatus !== ' ' && indexStatus !== '?') {
        stagedFiles.push(filename)
      }

      // Check if file is unstaged
      // Second char != ' ' or line starts with '??' → unstaged
      if (worktreeStatus !== ' ' || line.startsWith('??')) {
        unstagedFiles.push(filename)
      }
    }

    return { stagedFiles, unstagedFiles }
  }
}
