import { logger } from '../utils/logger.js'
import { GitHubService } from '../lib/GitHubService.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import type { FinishOptions } from '../types/index.js'
import path from 'path'

export interface FinishCommandInput {
	identifier?: string | undefined // Optional - can be auto-detected
	options: FinishOptions
}

export interface ParsedFinishInput {
	type: 'issue' | 'pr' | 'branch'
	number?: number // For issues and PRs
	branchName?: string // For branch inputs
	originalInput: string // Raw input for error messages
	autoDetected?: boolean // True if detected from current directory
}

export class FinishCommand {
	private gitHubService: GitHubService
	private gitWorktreeManager: GitWorktreeManager

	constructor(
		gitHubService?: GitHubService,
		gitWorktreeManager?: GitWorktreeManager
	) {
		// Dependency injection for testing
		this.gitHubService = gitHubService ?? new GitHubService()
		this.gitWorktreeManager = gitWorktreeManager ?? new GitWorktreeManager()
	}

	/**
	 * Main entry point for finish command
	 */
	public async execute(input: FinishCommandInput): Promise<void> {
		try {
			// Step 1: Parse input (or auto-detect from current directory)
			const parsed = await this.parseInput(input.identifier, input.options)

			// Step 2: Validate based on type
			await this.validateInput(parsed, input.options)

			// Step 3: Log success
			logger.info(`✅ Validated input: ${this.formatParsedInput(parsed)}`)

			if (input.options.dryRun) {
				logger.info('[DRY RUN] Would proceed with finish workflow')
			} else {
				logger.info('Ready to proceed with finish workflow (not yet implemented)')
			}

			// Step 4: Execute workflow (PLACEHOLDER - implemented in later sub-issues)
			// This is where Sub-Issue #45, #47, #49, etc. will add functionality
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`❌ ${error.message}`)
			} else {
				logger.error('❌ An unknown error occurred')
			}
			throw error
		}
	}

	/**
	 * Parse input to determine type and extract relevant data
	 * Supports auto-detection from current directory when identifier is undefined
	 */
	private async parseInput(
		identifier: string | undefined,
		options: FinishOptions
	): Promise<ParsedFinishInput> {
		// Priority 1: --pr flag overrides everything
		if (options.pr !== undefined) {
			return {
				type: 'pr',
				number: options.pr,
				originalInput: `--pr ${options.pr}`,
				autoDetected: false,
			}
		}

		// Priority 2: Explicit identifier provided
		if (identifier?.trim()) {
			return await this.parseExplicitInput(identifier.trim())
		}

		// Priority 3: Auto-detect from current directory
		return await this.autoDetectFromCurrentDirectory()
	}

	/**
	 * Parse explicit identifier input
	 */
	private async parseExplicitInput(
		identifier: string
	): Promise<ParsedFinishInput> {
		// Check for PR-specific formats: pr/123, PR-123, PR/123
		const prPattern = /^(?:pr|PR)[/-](\d+)$/
		const prMatch = identifier.match(prPattern)
		if (prMatch?.[1]) {
			return {
				type: 'pr',
				number: parseInt(prMatch[1], 10),
				originalInput: identifier,
				autoDetected: false,
			}
		}

		// Check for numeric pattern (could be issue or PR)
		const numericPattern = /^#?(\d+)$/
		const numericMatch = identifier.match(numericPattern)
		if (numericMatch?.[1]) {
			const number = parseInt(numericMatch[1], 10)

			// Use GitHubService to detect if it's a PR or issue
			const detection = await this.gitHubService.detectInputType(identifier)

			if (detection.type === 'pr') {
				return {
					type: 'pr',
					number: detection.number ?? number,
					originalInput: identifier,
					autoDetected: false,
				}
			} else if (detection.type === 'issue') {
				return {
					type: 'issue',
					number: detection.number ?? number,
					originalInput: identifier,
					autoDetected: false,
				}
			} else {
				throw new Error(`Could not find issue or PR #${number}`)
			}
		}

		// Treat as branch name
		return {
			type: 'branch',
			branchName: identifier,
			originalInput: identifier,
			autoDetected: false,
		}
	}

	/**
	 * Auto-detect PR or issue from current directory
	 * Ports logic from merge-current-issue.sh lines 30-52
	 */
	private async autoDetectFromCurrentDirectory(): Promise<ParsedFinishInput> {
		const currentDir = path.basename(process.cwd())

		// Check for PR worktree pattern: _pr_N suffix
		// Pattern: /.*_pr_(\d+)$/
		const prPattern = /_pr_(\d+)$/
		const prMatch = currentDir.match(prPattern)

		if (prMatch?.[1]) {
			const prNumber = parseInt(prMatch[1], 10)
			logger.debug(`Auto-detected PR #${prNumber} from directory: ${currentDir}`)
			return {
				type: 'pr',
				number: prNumber,
				originalInput: currentDir,
				autoDetected: true,
			}
		}

		// Check for issue pattern in directory or branch name
		// Pattern: /issue-(\d+)/
		const issuePattern = /issue-(\d+)/
		const issueMatch = currentDir.match(issuePattern)

		if (issueMatch?.[1]) {
			const issueNumber = parseInt(issueMatch[1], 10)
			logger.debug(
				`Auto-detected issue #${issueNumber} from directory: ${currentDir}`
			)
			return {
				type: 'issue',
				number: issueNumber,
				originalInput: currentDir,
				autoDetected: true,
			}
		}

		// Fallback: get current branch name
		const repoInfo = await this.gitWorktreeManager.getRepoInfo()
		const currentBranch = repoInfo.currentBranch

		if (!currentBranch) {
			throw new Error(
				'Could not auto-detect identifier. Please provide an issue number, PR number, or branch name.\n' +
					'Expected directory pattern: feat/issue-XX-description OR worktree with _pr_N suffix'
			)
		}

		// Try to extract issue from branch name
		const branchIssueMatch = currentBranch.match(issuePattern)
		if (branchIssueMatch?.[1]) {
			const issueNumber = parseInt(branchIssueMatch[1], 10)
			logger.debug(
				`Auto-detected issue #${issueNumber} from branch: ${currentBranch}`
			)
			return {
				type: 'issue',
				number: issueNumber,
				originalInput: currentBranch,
				autoDetected: true,
			}
		}

		// Last resort: use branch name
		return {
			type: 'branch',
			branchName: currentBranch,
			originalInput: currentBranch,
			autoDetected: true,
		}
	}

	/**
	 * Validate the parsed input based on its type
	 */
	private async validateInput(
		parsed: ParsedFinishInput,
		options: FinishOptions
	): Promise<void> {
		switch (parsed.type) {
			case 'pr': {
				if (!parsed.number) {
					throw new Error('Invalid PR number')
				}

				// Fetch PR from GitHub
				const pr = await this.gitHubService.fetchPR(parsed.number)

				// For PRs, we allow closed/merged state (cleanup-only mode)
				// But we still validate it exists
				logger.debug(`Validated PR #${parsed.number} (state: ${pr.state})`)

				// Find associated worktree
				await this.findWorktreeForIdentifier(parsed)
				break
			}

			case 'issue': {
				if (!parsed.number) {
					throw new Error('Invalid issue number')
				}

				// Fetch issue from GitHub
				const issue = await this.gitHubService.fetchIssue(parsed.number)

				// Validate issue state (warn if closed unless --force)
				if (issue.state === 'closed' && !options.force) {
					throw new Error(
						`Issue #${parsed.number} is closed. Use --force to finish anyway.`
					)
				}

				logger.debug(`Validated issue #${parsed.number} (state: ${issue.state})`)

				// Find associated worktree
				await this.findWorktreeForIdentifier(parsed)
				break
			}

			case 'branch': {
				if (!parsed.branchName) {
					throw new Error('Invalid branch name')
				}

				// Validate branch name format
				if (!this.isValidBranchName(parsed.branchName)) {
					throw new Error(
						'Invalid branch name. Use only letters, numbers, hyphens, underscores, and slashes'
					)
				}

				logger.debug(`Validated branch name: ${parsed.branchName}`)

				// Find associated worktree
				await this.findWorktreeForIdentifier(parsed)
				break
			}

			default: {
				const unknownType = parsed as { type: string }
				throw new Error(`Unknown input type: ${unknownType.type}`)
			}
		}
	}

	/**
	 * Find worktree for the given identifier
	 * Throws error if not found
	 */
	private async findWorktreeForIdentifier(
		parsed: ParsedFinishInput
	): Promise<void> {
		let identifier: string

		if (parsed.type === 'pr' || parsed.type === 'issue') {
			if (!parsed.number) {
				throw new Error('Invalid number for PR or issue')
			}
			identifier = parsed.number.toString()
		} else {
			if (!parsed.branchName) {
				throw new Error('Invalid branch name')
			}
			identifier = parsed.branchName
		}

		const worktrees =
			await this.gitWorktreeManager.findWorktreesByIdentifier(identifier)

		if (worktrees.length === 0) {
			throw new Error(
				`No worktree found for ${this.formatParsedInput(parsed)}. ` +
					`Use 'hb list' to see available worktrees.`
			)
		}

		if (worktrees.length > 1) {
			logger.warn(
				`Multiple worktrees found for ${this.formatParsedInput(parsed)}. ` +
					`Using first match: ${worktrees[0]?.path ?? 'unknown'}`
			)
		}

		const worktree = worktrees[0]
		if (worktree) {
			logger.debug(`Found worktree: ${worktree.path}`)
		}
	}

	/**
	 * Validate branch name format
	 */
	private isValidBranchName(branch: string): boolean {
		// Pattern from bash script and StartCommand
		return /^[a-zA-Z0-9/_-]+$/.test(branch)
	}

	/**
	 * Format parsed input for display
	 */
	private formatParsedInput(parsed: ParsedFinishInput): string {
		const autoLabel = parsed.autoDetected ? ' (auto-detected)' : ''

		switch (parsed.type) {
			case 'pr':
				return `PR #${parsed.number}${autoLabel}`
			case 'issue':
				return `Issue #${parsed.number}${autoLabel}`
			case 'branch':
				return `Branch '${parsed.branchName}'${autoLabel}`
			default:
				return 'Unknown input'
		}
	}
}
