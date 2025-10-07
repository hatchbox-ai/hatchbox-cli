import { logger } from '../utils/logger.js'
import { GitHubService } from '../lib/GitHubService.js'
import type { StartOptions } from '../types/index.js'

export interface StartCommandInput {
	identifier: string
	options: StartOptions
}

export interface ParsedInput {
	type: 'issue' | 'pr' | 'branch'
	number?: number
	branchName?: string
	originalInput: string
}

export class StartCommand {
	private gitHubService: GitHubService

	constructor(gitHubService?: GitHubService) {
		this.gitHubService = gitHubService ?? new GitHubService()
	}

	/**
	 * Main entry point for the start command
	 */
	public async execute(input: StartCommandInput): Promise<void> {
		try {
			// Step 1: Parse and validate input
			const parsed = await this.parseInput(input.identifier)

			// Step 2: Validate based on type
			await this.validateInput(parsed)

			// Step 3: Log success and prepare for next steps (WorkspaceManager)
			logger.info(`✅ Validated input: ${this.formatParsedInput(parsed)}`)

			// TODO: Issue #6 - Create workspace using WorkspaceManager
			logger.warn(
				'Workspace creation not yet implemented (requires Issue #6)'
			)
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
	 */
	private async parseInput(identifier: string): Promise<ParsedInput> {
		// Handle empty input
		const trimmedIdentifier = identifier.trim()
		if (!trimmedIdentifier) {
			throw new Error('Missing required argument: identifier')
		}

		// Check for PR-specific formats: pr/123, PR-123, PR/123
		const prPattern = /^(?:pr|PR)[/-](\d+)$/
		const prMatch = trimmedIdentifier.match(prPattern)
		if (prMatch?.[1]) {
			return {
				type: 'pr',
				number: parseInt(prMatch[1], 10),
				originalInput: trimmedIdentifier,
			}
		}

		// Check for numeric pattern (could be issue or PR)
		const numericPattern = /^#?(\d+)$/
		const numericMatch = trimmedIdentifier.match(numericPattern)
		if (numericMatch?.[1]) {
			const number = parseInt(numericMatch[1], 10)

			// Use GitHubService to detect if it's a PR or issue
			const detection = await this.gitHubService.detectInputType(
				trimmedIdentifier
			)

			if (detection.type === 'pr') {
				return {
					type: 'pr',
					number: detection.number ?? number,
					originalInput: trimmedIdentifier,
				}
			} else if (detection.type === 'issue') {
				return {
					type: 'issue',
					number: detection.number ?? number,
					originalInput: trimmedIdentifier,
				}
			} else {
				throw new Error(`Could not find issue or PR #${number}`)
			}
		}

		// Treat as branch name
		return {
			type: 'branch',
			branchName: trimmedIdentifier,
			originalInput: trimmedIdentifier,
		}
	}

	/**
	 * Validate the parsed input based on its type
	 */
	private async validateInput(parsed: ParsedInput): Promise<void> {
		switch (parsed.type) {
			case 'pr':
				if (!parsed.number) {
					throw new Error('Invalid PR number')
				}
				// Additional PR validation will use GitHubService in full implementation
				logger.debug(`Validated PR #${parsed.number}`)
				break

			case 'issue':
				if (!parsed.number) {
					throw new Error('Invalid issue number')
				}
				// Additional issue validation will use GitHubService in full implementation
				logger.debug(`Validated issue #${parsed.number}`)
				break

			case 'branch':
				if (!parsed.branchName) {
					throw new Error('Invalid branch name')
				}
				// Validate branch name characters (from bash script line 586)
				if (!this.isValidBranchName(parsed.branchName)) {
					throw new Error(
						'Invalid branch name. Use only letters, numbers, hyphens, underscores, and slashes'
					)
				}
				logger.debug(`Validated branch name: ${parsed.branchName}`)
				break

			default: {
				const unknownType = parsed as { type: string }
				throw new Error(`Unknown input type: ${unknownType.type}`)
			}
		}
	}

	/**
	 * Validate branch name format
	 */
	private isValidBranchName(branch: string): boolean {
		// Pattern from bash script line 586
		return /^[a-zA-Z0-9/_-]+$/.test(branch)
	}

	/**
	 * Format parsed input for display
	 */
	private formatParsedInput(parsed: ParsedInput): string {
		switch (parsed.type) {
			case 'pr':
				return `PR #${parsed.number}`
			case 'issue':
				return `Issue #${parsed.number}`
			case 'branch':
				return `Branch '${parsed.branchName}'`
			default:
				return 'Unknown input'
		}
	}
}
