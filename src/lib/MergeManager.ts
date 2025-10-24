import { executeGitCommand, findMainWorktreePathWithSettings } from '../utils/git.js'
import { logger } from '../utils/logger.js'
import { detectClaudeCli, launchClaude } from '../utils/claude.js'
import { SettingsManager } from './SettingsManager.js'
import type { MergeOptions } from '../types/index.js'

/**
 * MergeManager handles Git rebase and fast-forward merge operations
 * Implements fail-fast behavior for conflicts (Phase 1 - no Claude assistance)
 *
 * Ports bash/merge-and-clean.sh lines 781-1090
 */
export class MergeManager {
	private settingsManager: SettingsManager

	constructor(settingsManager?: SettingsManager) {
		this.settingsManager = settingsManager ?? new SettingsManager()
	}

	/**
	 * Get the main branch name from settings (defaults to 'main')
	 * @private
	 */
	private async getMainBranch(): Promise<string> {
		const settings = await this.settingsManager.loadSettings()
		return settings.mainBranch ?? 'main'
	}

	/**
	 * Rebase current branch on main with fail-fast on conflicts
	 * Ports bash/merge-and-clean.sh lines 781-913
	 *
	 * @param worktreePath - Path to the worktree
	 * @param options - Merge options (dryRun, force)
	 * @throws Error if main branch doesn't exist, uncommitted changes exist, or conflicts occur
	 */
	async rebaseOnMain(worktreePath: string, options: MergeOptions = {}): Promise<void> {
		const { dryRun = false, force = false } = options
		const mainBranch = await this.getMainBranch()

		logger.info(`Starting rebase on ${mainBranch} branch...`)

		// Step 1: Check if main branch exists
		try {
			await executeGitCommand(['show-ref', '--verify', '--quiet', `refs/heads/${mainBranch}`], {
				cwd: worktreePath,
			})
		} catch {
			throw new Error(
				`Main branch "${mainBranch}" does not exist. Cannot rebase.\n` +
					`Ensure the repository has a "${mainBranch}" branch or create it first.`
			)
		}

		// Step 2: Check for uncommitted changes (defensive check)
		const statusOutput = await executeGitCommand(['status', '--porcelain'], {
			cwd: worktreePath,
		})

		if (statusOutput.trim()) {
			throw new Error(
				'Uncommitted changes detected. Please commit or stash changes before rebasing.\n' +
					'Run: git status to see uncommitted changes\n' +
					'Or: hb finish will automatically commit them for you'
			)
		}

		// Step 3: Check if rebase is needed by comparing merge-base with main HEAD
		const mergeBase = await executeGitCommand(['merge-base', mainBranch, 'HEAD'], {
			cwd: worktreePath,
		})

		const mainHead = await executeGitCommand(['rev-parse', mainBranch], {
			cwd: worktreePath,
		})

		const mergeBaseTrimmed = mergeBase.trim()
		const mainHeadTrimmed = mainHead.trim()

		// If merge-base matches main HEAD, branch is already up to date
		if (mergeBaseTrimmed === mainHeadTrimmed) {
			logger.success(`Branch is already up to date with ${mainBranch}. No rebase needed.`)
			return
		}

		// Step 4: Show commits to be rebased (for informational purposes)
		const commitsOutput = await executeGitCommand(['log', '--oneline', `${mainBranch}..HEAD`], {
			cwd: worktreePath,
		})

		const commits = commitsOutput.trim()
		const commitLines = commits ? commits.split('\n') : []

		if (commits) {
			// Show commits that will be rebased
			logger.info(`Found ${commitLines.length} commit(s) to rebase:`)
			commitLines.forEach((commit) => logger.info(`  ${commit}`))
		} else {
			// Main has moved forward but branch has no new commits
			logger.info(`${mainBranch} branch has moved forward. Rebasing to update branch...`)
		}

		// Step 5: User confirmation (unless force mode or dry-run)
		if (!force && !dryRun) {
			// TODO: Implement interactive prompt for confirmation
			// For now, proceeding automatically (use --force to skip this message)
			logger.info('Proceeding with rebase... (use --force to skip confirmations)')
		}

		// Step 6: Execute rebase (unless dry-run)
		if (dryRun) {
			logger.info(`[DRY RUN] Would execute: git rebase ${mainBranch}`)
			if (commitLines.length > 0) {
				logger.info(`[DRY RUN] This would rebase ${commitLines.length} commit(s)`)
			}
			return
		}

		// Execute rebase
		try {
			await executeGitCommand(['rebase', mainBranch], { cwd: worktreePath })
			logger.success('Rebase completed successfully!')
		} catch (error) {
			// Detect conflicts
			const conflictedFiles = await this.detectConflictedFiles(worktreePath)

			if (conflictedFiles.length > 0) {
				// Try Claude-assisted resolution first
				logger.info('Merge conflicts detected, attempting Claude-assisted resolution...')

				const resolved = await this.attemptClaudeConflictResolution(
					worktreePath,
					conflictedFiles
				)

				if (resolved) {
					logger.success('Conflicts resolved with Claude assistance, rebase completed')
					return // Continue with successful rebase
				}

				// Claude couldn't resolve or not available - fail fast
				const conflictError = this.formatConflictError(conflictedFiles)
				throw new Error(conflictError)
			}

			// If not a conflict, re-throw the original error
			throw new Error(
				`Rebase failed: ${error instanceof Error ? error.message : String(error)}\n` +
					'Run: git status for more details\n' +
					'Or: git rebase --abort to cancel the rebase'
			)
		}
	}

	/**
	 * Validate that fast-forward merge is possible
	 * Ports bash/merge-and-clean.sh lines 957-968
	 *
	 * @param branchName - Name of the branch to merge
	 * @param mainWorktreePath - Path where main branch is checked out
	 * @throws Error if fast-forward is not possible
	 */
	async validateFastForwardPossible(branchName: string, mainWorktreePath: string): Promise<void> {
		const mainBranch = await this.getMainBranch()

		// Step 1: Get merge-base between main and branch
		const mergeBase = await executeGitCommand(['merge-base', mainBranch, branchName], {
			cwd: mainWorktreePath,
		})

		// Step 2: Get current HEAD of main
		const mainHead = await executeGitCommand(['rev-parse', mainBranch], {
			cwd: mainWorktreePath,
		})

		// Step 3: Compare - they must match for fast-forward
		const mergeBaseTrimmed = mergeBase.trim()
		const mainHeadTrimmed = mainHead.trim()

		if (mergeBaseTrimmed !== mainHeadTrimmed) {
			throw new Error(
				'Cannot perform fast-forward merge.\n' +
					`The ${mainBranch} branch has moved forward since this branch was created.\n` +
					`Merge base: ${mergeBaseTrimmed}\n` +
					`Main HEAD:  ${mainHeadTrimmed}\n\n` +
					'To fix this:\n' +
					`  1. Rebase the branch on ${mainBranch}: git rebase ${mainBranch}\n` +
					`  2. Or use: hb finish to automatically rebase and merge\n`
			)
		}
	}

	/**
	 * Perform fast-forward only merge
	 * Ports bash/merge-and-clean.sh lines 938-994
	 *
	 * @param branchName - Name of the branch to merge
	 * @param worktreePath - Path to the worktree
	 * @param options - Merge options (dryRun, force)
	 * @throws Error if checkout, validation, or merge fails
	 */
	async performFastForwardMerge(
		branchName: string,
		worktreePath: string,
		options: MergeOptions = {}
	): Promise<void> {
		const { dryRun = false, force = false } = options
		const mainBranch = await this.getMainBranch()

		logger.info('Starting fast-forward merge...')

		// Step 1: Find where main branch is checked out
		// This copies the bash script approach: find main worktree, run commands from there
		const mainWorktreePath = options.repoRoot ??
			await findMainWorktreePathWithSettings(worktreePath, this.settingsManager)

		// Step 3: No need to checkout main - it's already checked out in mainWorktreePath
		logger.debug(`Using ${mainBranch} branch location: ${mainWorktreePath}`)

		// Step 4: Verify on main branch
		const currentBranch = await executeGitCommand(['branch', '--show-current'], {
			cwd: mainWorktreePath,
		})

		if (currentBranch.trim() !== mainBranch) {
			throw new Error(
				`Expected ${mainBranch} branch but found: ${currentBranch.trim()}\n` +
					`At location: ${mainWorktreePath}\n` +
					'This indicates the main worktree detection failed.'
			)
		}

		// Step 5: Validate fast-forward is possible
		await this.validateFastForwardPossible(branchName, mainWorktreePath)

		// Step 6: Show commits to be merged
		const commitsOutput = await executeGitCommand(['log', '--oneline', `${mainBranch}..${branchName}`], {
			cwd: mainWorktreePath,
		})

		const commits = commitsOutput.trim()

		// If no commits, branch is already merged
		if (!commits) {
			logger.success(`Branch is already merged into ${mainBranch}. No merge needed.`)
			return
		}

		// Show commits that will be merged
		const commitLines = commits.split('\n')
		logger.info(`Found ${commitLines.length} commit(s) to merge:`)
		commitLines.forEach((commit) => logger.info(`  ${commit}`))

		// Step 7: User confirmation (unless force mode or dry-run)
		if (!force && !dryRun) {
			// TODO: Implement interactive prompt for confirmation
			// For now, proceeding automatically (use --force to skip this message)
			logger.info('Proceeding with fast-forward merge... (use --force to skip confirmations)')
		}

		// Step 8: Execute merge (unless dry-run)
		if (dryRun) {
			logger.info(`[DRY RUN] Would execute: git merge --ff-only ${branchName}`)
			logger.info(`[DRY RUN] This would merge ${commitLines.length} commit(s)`)
			return
		}

		// Execute fast-forward merge
		try {
			await executeGitCommand(['merge', '--ff-only', branchName], { cwd: mainWorktreePath })
			logger.success(`Fast-forward merge completed! Merged ${commitLines.length} commit(s).`)
		} catch (error) {
			throw new Error(
				`Fast-forward merge failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
					'To recover:\n' +
					'  1. Check merge status: git status\n' +
					'  2. Abort merge if needed: git merge --abort\n' +
					'  3. Verify branch is rebased: git rebase main\n' +
					'  4. Try merge again: hb finish'
			)
		}
	}

	/**
	 * Helper: Detect conflicted files after failed rebase
	 * @private
	 */
	private async detectConflictedFiles(worktreePath: string): Promise<string[]> {
		try {
			const output = await executeGitCommand(['diff', '--name-only', '--diff-filter=U'], {
				cwd: worktreePath,
			})

			return output
				.trim()
				.split('\n')
				.filter((file) => file.length > 0)
		} catch {
			// If command fails, return empty array (might not be a conflict)
			return []
		}
	}

	/**
	 * Helper: Format conflict error message with manual resolution steps
	 * @private
	 */
	private formatConflictError(conflictedFiles: string[]): string {
		const fileList = conflictedFiles.map((file) => `  • ${file}`).join('\n')

		return (
			'Rebase failed - merge conflicts detected in:\n' +
			fileList +
			'\n\n' +
			'To resolve manually:\n' +
			'  1. Fix conflicts in the files above\n' +
			'  2. Stage resolved files: git add <files>\n' +
			'  3. Continue rebase: git rebase --continue\n' +
			'  4. Or abort rebase: git rebase --abort\n' +
			'  5. Then re-run: hb finish <issue-number>'
		)
	}

	/**
	 * Attempt to resolve conflicts using Claude
	 * Ports bash/merge-and-clean.sh lines 839-894
	 *
	 * @param worktreePath - Path to the worktree
	 * @param conflictedFiles - List of files with conflicts
	 * @returns true if conflicts resolved, false otherwise
	 * @private
	 */
	private async attemptClaudeConflictResolution(
		worktreePath: string,
		conflictedFiles: string[]
	): Promise<boolean> {
		// Check if Claude CLI is available
		const isClaudeAvailable = await detectClaudeCli()
		if (!isClaudeAvailable) {
			logger.debug('Claude CLI not available, skipping conflict resolution')
			return false
		}

		logger.info(`Launching Claude to resolve conflicts in ${conflictedFiles.length} file(s)...`)

		// Hard-coded prompt matching bash script line 844
		// No templates, no complexity - just the essential instruction
		const prompt =
			`Please help resolve the git rebase conflicts in this repository. ` +
			`Analyze the conflicted files, understand the changes from both branches, ` +
			`fix the conflicts, then run 'git add .' to stage the resolved files, ` +
			`and finally run 'git rebase --continue' to continue the rebase process. ` +
			`Handle the entire workflow for me.`

		try {
			// Launch Claude interactively in current terminal
			// User will interact directly with Claude to resolve conflicts
			await launchClaude(prompt, {
				addDir: worktreePath,
				headless: false, // Interactive - runs in current terminal with stdio: inherit
			})

			// After Claude interaction completes, check if conflicts resolved
			const remainingConflicts = await this.detectConflictedFiles(worktreePath)

			if (remainingConflicts.length > 0) {
				logger.warn(
					`Conflicts still exist in ${remainingConflicts.length} file(s) after Claude assistance`
				)
				return false
			}

			// Check if rebase completed or still in progress
			const rebaseInProgress = await this.isRebaseInProgress(worktreePath)

			if (rebaseInProgress) {
				logger.warn('Rebase still in progress after Claude assistance')
				return false
			}

			// Success: no conflicts, rebase completed
			logger.success('Claude successfully resolved conflicts and completed rebase')
			return true
		} catch (error) {
			logger.warn('Claude conflict resolution failed', {
				error: error instanceof Error ? error.message : String(error),
			})
			return false
		}
	}

	/**
	 * Check if a git rebase is currently in progress
	 * Checks for .git/rebase-merge or .git/rebase-apply directories
	 * Ports bash script logic from lines 853-856
	 *
	 * @param worktreePath - Path to the worktree
	 * @returns true if rebase in progress, false otherwise
	 * @private
	 */
	private async isRebaseInProgress(worktreePath: string): Promise<boolean> {
		const fs = await import('node:fs/promises')
		const path = await import('node:path')

		const rebaseMergePath = path.join(worktreePath, '.git', 'rebase-merge')
		const rebaseApplyPath = path.join(worktreePath, '.git', 'rebase-apply')

		// Check for rebase-merge directory
		try {
			await fs.access(rebaseMergePath)
			return true
		} catch {
			// Directory doesn't exist, continue checking
		}

		// Check for rebase-apply directory
		try {
			await fs.access(rebaseApplyPath)
			return true
		} catch {
			// Directory doesn't exist
		}

		return false
	}
}
