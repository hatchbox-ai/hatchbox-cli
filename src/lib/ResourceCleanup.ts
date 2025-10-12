import path from 'path'
import { GitWorktreeManager } from './GitWorktreeManager.js'
import { DatabaseManager } from './DatabaseManager.js'
import { ProcessManager } from './process/ProcessManager.js'
import { logger } from '../utils/logger.js'
import type {
	ResourceCleanupOptions,
	CleanupResult,
	OperationResult,
	SafetyCheck,
	BranchDeleteOptions,
} from '../types/cleanup.js'
import type { GitWorktree } from '../types/worktree.js'
import type { ParsedInput } from '../commands/start.js'

/**
 * Manages resource cleanup for worktrees
 * Provides shared cleanup functionality for finish and cleanup commands
 */
export class ResourceCleanup {
	constructor(
		private gitWorktree: GitWorktreeManager,
		private processManager: ProcessManager,
		private database?: DatabaseManager
	) {}

	/**
	 * Cleanup a worktree and associated resources
	 * Main orchestration method
	 *
	 * @param parsed - ParsedInput from IdentifierParser with type information
	 * @param options - Cleanup options
	 */
	async cleanupWorktree(
		parsed: ParsedInput,
		options: ResourceCleanupOptions = {}
	): Promise<CleanupResult> {
		const operations: OperationResult[] = []
		const errors: Error[] = []

		const displayIdentifier = parsed.branchName ?? parsed.number?.toString() ?? parsed.originalInput
		logger.info(`Starting cleanup for: ${displayIdentifier}`)

		// Extract number from ParsedInput for port calculation
		const number = parsed.number

		// Step 1: Terminate dev server if applicable
		if (number !== undefined) {
			const port = this.processManager.calculatePort(number)

			if (options.dryRun) {
				operations.push({
					type: 'dev-server',
					success: true,
					message: `[DRY RUN] Would check for dev server on port ${port}`,
				})
			} else {
				try {
					const terminated = await this.terminateDevServer(port)
					operations.push({
						type: 'dev-server',
						success: true,
						message: terminated
							? `Dev server on port ${port} terminated`
							: `No dev server running on port ${port}`,
					})
				} catch (error) {
					const err = error instanceof Error ? error : new Error('Unknown error')
					errors.push(err)
					operations.push({
						type: 'dev-server',
						success: false,
						message: `Failed to terminate dev server`,
						error: err.message,
					})
				}
			}
		}

		// Step 2: Find worktree using specific methods based on type
		let worktree: GitWorktree | null = null
		try {
			// Use specific finding methods based on parsed type for precision
			if (parsed.type === 'pr' && parsed.number !== undefined) {
				// For PRs, pass empty string for branchName since we're detecting from path pattern
				worktree = await this.gitWorktree.findWorktreeForPR(parsed.number, '')
			} else if (parsed.type === 'issue' && parsed.number !== undefined) {
				worktree = await this.gitWorktree.findWorktreeForIssue(parsed.number)
			} else if (parsed.type === 'branch' && parsed.branchName) {
				worktree = await this.gitWorktree.findWorktreeForBranch(parsed.branchName)
			}

			if (!worktree) {
				throw new Error(`No worktree found for identifier: ${displayIdentifier}`)
			}

			logger.debug(`Found worktree: path="${worktree.path}", branch="${worktree.branch}"`)
		} catch (error) {
			const err = error instanceof Error ? error : new Error('Unknown error')
			errors.push(err)

			return {
				identifier: displayIdentifier,
				success: false,
				operations,
				errors,
				rollbackRequired: false,
			}
		}

		// Step 3: Pre-read database configuration before worktree removal
		let databaseConfig: { shouldCleanup: boolean; envFilePath: string } | null = null
		if (!options.keepDatabase && worktree) {
			const envFilePath = path.join(worktree.path, '.env')
			try {
				// Pre-check if database cleanup should happen by reading .env file now
				const shouldCleanup = this.database
					? await this.database.shouldUseDatabaseBranching(envFilePath)
					: false
				databaseConfig = { shouldCleanup, envFilePath }
			} catch (error) {
				// If we can't read the config, we'll skip database cleanup
				logger.warn(
					`Failed to read database config from ${envFilePath}, skipping database cleanup: ${
						error instanceof Error ? error.message : String(error)
					}`
				)
				databaseConfig = { shouldCleanup: false, envFilePath }
			}
		}

		// Step 3.5: Find main worktree path before deletion (needed for branch deletion later)
		let mainWorktreePath: string | null = null
		if (options.deleteBranch && !options.dryRun) {
			try {
				const { findMainWorktreePath } = await import('../utils/git.js')
				mainWorktreePath = await findMainWorktreePath(worktree.path)
			} catch (error) {
				logger.warn(
					`Failed to find main worktree path: ${error instanceof Error ? error.message : String(error)}`
				)
			}
		}

		// Step 4: Remove worktree
		if (options.dryRun) {
			operations.push({
				type: 'worktree',
				success: true,
				message: `[DRY RUN] Would remove worktree: ${worktree.path}`,
			})
		} else {
			try {
				const worktreeOptions: { force?: boolean; removeDirectory: true; removeBranch: false } =
					{
						removeDirectory: true,
						removeBranch: false, // Handle branch separately
					}
				if (options.force !== undefined) {
					worktreeOptions.force = options.force
				}
				await this.gitWorktree.removeWorktree(worktree.path, worktreeOptions)

				operations.push({
					type: 'worktree',
					success: true,
					message: `Worktree removed: ${worktree.path}`,
				})
			} catch (error) {
				const err = error instanceof Error ? error : new Error('Unknown error')
				errors.push(err)
				operations.push({
					type: 'worktree',
					success: false,
					message: `Failed to remove worktree`,
					error: err.message,
				})
			}
		}

		// Step 5: Delete branch if requested
		if (options.deleteBranch && worktree) {
			if (options.dryRun) {
				operations.push({
					type: 'branch',
					success: true,
					message: `[DRY RUN] Would delete branch: ${worktree.branch}`,
				})
			} else {
				try {
					const branchOptions: BranchDeleteOptions = { dryRun: false }
					if (options.force !== undefined) {
						branchOptions.force = options.force
					}
					// Pass main worktree path to ensure we can execute git commands
					await this.deleteBranch(worktree.branch, branchOptions, mainWorktreePath ?? undefined)

					operations.push({
						type: 'branch',
						success: true,
						message: `Branch deleted: ${worktree.branch}`,
					})
				} catch (error) {
					const err = error instanceof Error ? error : new Error('Unknown error')
					errors.push(err)
					operations.push({
						type: 'branch',
						success: false,
						message: `Failed to delete branch`,
						error: err.message,
					})
				}
			}
		}

		// Step 6: Cleanup database after worktree and branch removal (using pre-read config)
		if (databaseConfig && worktree) {
			if (options.dryRun) {
				operations.push({
					type: 'database',
					success: true,
					message: `[DRY RUN] Would cleanup database branch for: ${worktree.branch}`,
				})
			} else {
				try {
					let cleaned = false
					if (databaseConfig.shouldCleanup && this.database) {
						try {
							// Use the amended method without envFilePath to bypass env file reading
							await this.database.deleteBranchIfConfigured(worktree.branch)
							cleaned = true
							logger.info(`Database branch cleaned up: ${worktree.branch}`)
						} catch (error) {
							// Log warning but don't throw - matches bash script behavior (non-fatal)
							logger.warn(
								`Database cleanup failed: ${error instanceof Error ? error.message : String(error)}`
							)
							cleaned = false
						}
					}

					operations.push({
						type: 'database',
						success: true,
						message: cleaned
							? `Database branch cleaned up`
							: `Database cleanup skipped (not available)`,
					})
				} catch (error) {
					// This catch block is for any unexpected errors in the outer logic
					const err = error instanceof Error ? error : new Error('Unknown error')
					errors.push(err)
					operations.push({
						type: 'database',
						success: false,
						message: `Database cleanup failed`,
						error: err.message,
					})
				}
			}
		}

		// Calculate overall success
		const success = errors.length === 0

		return {
			identifier: displayIdentifier,
			branchName: worktree?.branch,
			success,
			operations,
			errors,
			rollbackRequired: false, // Cleanup operations are generally not reversible
		}
	}

	/**
	 * Terminate dev server on specified port
	 */
	async terminateDevServer(port: number): Promise<boolean> {
		logger.debug(`Checking for dev server on port ${port}`)

		const processInfo = await this.processManager.detectDevServer(port)

		if (!processInfo) {
			logger.debug(`No process found on port ${port}`)
			return false
		}

		if (!processInfo.isDevServer) {
			logger.warn(
				`Process on port ${port} (${processInfo.name}) doesn't appear to be a dev server, skipping`
			)
			return false
		}

		logger.info(`Terminating dev server: ${processInfo.name} (PID: ${processInfo.pid})`)

		await this.processManager.terminateProcess(processInfo.pid)

		// Verify termination
		const isFree = await this.processManager.verifyPortFree(port)
		if (!isFree) {
			throw new Error(`Dev server may still be running on port ${port}`)
		}

		return true
	}

	/**
	 * Delete a Git branch with safety checks
	 *
	 * @param branchName - Name of the branch to delete
	 * @param options - Delete options (force, dryRun)
	 * @param cwd - Working directory to execute git command from (defaults to finding main worktree)
	 */
	async deleteBranch(
		branchName: string,
		options: BranchDeleteOptions = {},
		cwd?: string
	): Promise<boolean> {
		// Check for protected branches
		//TODO [CONFIG]: Make this configurable
		const protectedBranches = ['main', 'master', 'develop']
		if (protectedBranches.includes(branchName)) {
			throw new Error(`Cannot delete protected branch: ${branchName}`)
		}

		if (options.dryRun) {
			logger.info(`[DRY RUN] Would delete branch: ${branchName}`)
			return true
		}

		// Use GitWorktreeManager's removeWorktree with removeBranch option
		// Or execute git branch -D directly via executeGitCommand
		const { executeGitCommand, findMainWorktreePath } = await import('../utils/git.js')

		try {
			// Use provided cwd, or find main worktree path as fallback
			// This ensures we're not running git commands from a deleted directory
			const workingDir = cwd ?? await findMainWorktreePath()

			// Use safe delete (-d) unless force is specified
			const deleteFlag = options.force ? '-D' : '-d'
			await executeGitCommand(['branch', deleteFlag, branchName], {
				cwd: workingDir
			})

			logger.info(`Branch deleted: ${branchName}`)
			return true
		} catch (error) {
			if (options.force) {
				throw error
			}

			// For safe delete failures, check if it's actually an unmerged branch error
			// and provide helpful message only in that case, otherwise show the real error
			const errorMessage = error instanceof Error ? error.message : String(error)

			// Git error for unmerged branch typically contains "not fully merged"
			if (errorMessage.includes('not fully merged')) {
				throw new Error(
					`Cannot delete unmerged branch '${branchName}'. Use --force to delete anyway.`
				)
			}

			// For other errors (like branch doesn't exist), show the actual git error
			throw error
		}
	}

	/**
	 * Cleanup database branch
	 * Gracefully handles missing DatabaseManager
	 */
	async cleanupDatabase(branchName: string, worktreePath: string): Promise<boolean> {
		if (!this.database) {
			logger.debug('Database manager not available, skipping database cleanup')
			return false
		}

		try {
			const envFilePath = path.join(worktreePath, '.env')
			await this.database.deleteBranchIfConfigured(branchName, envFilePath)
			logger.info(`Database branch cleaned up: ${branchName}`)
			return true
		} catch (error) {
			// Log warning but don't throw - matches bash script behavior
			logger.warn(
				`Database cleanup failed: ${error instanceof Error ? error.message : String(error)}`
			)
			return false
		}
	}

	/**
	 * Cleanup multiple worktrees
	 */
	async cleanupMultipleWorktrees(
		identifiers: string[],
		options: ResourceCleanupOptions = {}
	): Promise<CleanupResult[]> {
		const results: CleanupResult[] = []

		for (const identifier of identifiers) {
			// Parse the identifier to get ParsedInput format
			const parsed = this.parseIdentifier(identifier)
			const result = await this.cleanupWorktree(parsed, options)
			results.push(result)
		}

		return results
	}

	/**
	 * Validate cleanup safety
	 */
	async validateCleanupSafety(identifier: string): Promise<SafetyCheck> {
		const warnings: string[] = []
		const blockers: string[] = []

		// Find worktree
		const worktrees = await this.gitWorktree.findWorktreesByIdentifier(identifier)

		if (worktrees.length === 0) {
			blockers.push(`No worktree found for: ${identifier}`)
			return { isSafe: false, warnings, blockers }
		}

		const worktree = worktrees[0]
		if (!worktree) {
			blockers.push(`No worktree found for: ${identifier}`)
			return { isSafe: false, warnings, blockers }
		}

		// Check if main worktree
		const isMain = await this.gitWorktree.isMainWorktree(worktree)
		if (isMain) {
			blockers.push('Cannot cleanup main worktree')
		}

		// Check for uncommitted changes
		const { hasUncommittedChanges } = await import('../utils/git.js')
		const hasChanges = await hasUncommittedChanges(worktree.path)
		if (hasChanges) {
			warnings.push('Worktree has uncommitted changes')
		}

		return {
			isSafe: blockers.length === 0,
			warnings,
			blockers,
		}
	}

	/**
	 * Parse identifier to determine type and extract number
	 * Helper method for port calculation
	 */
	private parseIdentifier(identifier: string): ParsedInput {
		// Check for issue pattern
		const issueMatch = identifier.match(/issue-(\d+)/)
		if (issueMatch?.[1]) {
			return {
				type: 'issue',
				number: parseInt(issueMatch[1], 10),
				originalInput: identifier
			}
		}

		// Check for PR pattern
		const prMatch = identifier.match(/(?:pr|PR)[/-](\d+)/)
		if (prMatch?.[1]) {
			return {
				type: 'pr',
				number: parseInt(prMatch[1], 10),
				originalInput: identifier
			}
		}

		// Check for numeric identifier
		const numericMatch = identifier.match(/^#?(\d+)$/)
		if (numericMatch?.[1]) {
			// Assume issue for numeric identifiers
			return {
				type: 'issue',
				number: parseInt(numericMatch[1], 10),
				originalInput: identifier
			}
		}

		// Treat as branch name
		return {
			type: 'branch',
			branchName: identifier,
			originalInput: identifier
		}
	}
}
