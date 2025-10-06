import type { Issue, PullRequest } from '../types/index.js'
import type {
	GitHubIssue,
	GitHubPullRequest,
	GitHubProject,
	GitHubInputDetection,
	BranchGenerationOptions,
	BranchNameStrategy,
	ProjectItem,
} from '../types/github.js'
import { GitHubError, GitHubErrorCode } from '../types/github.js'
import {
	executeGhCommand,
	hasProjectScope,
	fetchGhIssue,
	fetchGhPR,
	fetchProjectList,
	fetchProjectItems,
	updateProjectItemField,
	SimpleBranchNameStrategy,
	ClaudeBranchNameStrategy,
} from '../utils/github.js'
import { logger } from '../utils/logger.js'
import { promptConfirmation } from '../utils/prompt.js'

export class GitHubService {
	private defaultBranchNameStrategy: BranchNameStrategy
	private prompter: (message: string) => Promise<boolean>

	constructor(options?: {
		branchNameStrategy?: BranchNameStrategy
		useClaude?: boolean
		claudeModel?: string
		prompter?: (message: string) => Promise<boolean>
	}) {
		// Set up default strategy based on options
		if (options?.branchNameStrategy) {
			this.defaultBranchNameStrategy = options.branchNameStrategy
		} else if (options?.useClaude !== false) {
			this.defaultBranchNameStrategy = new ClaudeBranchNameStrategy(
				options?.claudeModel
			)
		} else {
			this.defaultBranchNameStrategy = new SimpleBranchNameStrategy()
		}

		// Set up prompter (use provided or default to promptConfirmation)
		this.prompter = options?.prompter ?? promptConfirmation
	}

	// Input detection
	public async detectInputType(input: string): Promise<GitHubInputDetection> {
		// Pattern: #123 or just 123
		const numberMatch = input.match(/^#?(\d+)$/)

		if (!numberMatch?.[1]) {
			return { type: 'unknown', number: null, rawInput: input }
		}

		const number = parseInt(numberMatch[1], 10)

		// Try PR first (based on bash script logic at lines 500-533)
		logger.debug('Checking if input is a PR', { number })
		const pr = await this.isValidPR(number)
		if (pr) {
			return { type: 'pr', number, rawInput: input }
		}

		// Try issue next (lines 536-575 in bash)
		logger.debug('Checking if input is an issue', { number })
		const issue = await this.isValidIssue(number)
		if (issue) {
			return { type: 'issue', number, rawInput: input }
		}

		// Neither PR nor issue found
		return { type: 'unknown', number: null, rawInput: input }
	}

	// Issue fetching with validation
	public async fetchIssue(issueNumber: number): Promise<Issue> {
		try {
			return await this.fetchIssueInternal(issueNumber)
		} catch (error) {
			// Only throw NOT_FOUND for actual "not found" errors
			if (error instanceof Error && 'stderr' in error && (error as {stderr?: string}).stderr?.includes('Could not resolve')) {
				throw new GitHubError(
					GitHubErrorCode.NOT_FOUND,
					`Issue #${issueNumber} not found`,
					error
				)
			}
			// Re-throw all other errors unchanged
			throw error
		}
	}

	// Silent issue validation (for detection phase)
	public async isValidIssue(issueNumber: number): Promise<Issue | false> {
		try {
			return await this.fetchIssueInternal(issueNumber)
		} catch (error) {
			// Silently return false for "not found" errors
			if (error instanceof Error && 'stderr' in error && (error as {stderr?: string}).stderr?.includes('Could not resolve')) {
				return false
			}
			// Re-throw unexpected errors
			throw error
		}
	}

	// Internal issue fetching logic (shared by fetchIssue and isValidIssue)
	private async fetchIssueInternal(issueNumber: number): Promise<Issue> {
		const ghIssue = await fetchGhIssue(issueNumber)
		return this.mapGitHubIssueToIssue(ghIssue)
	}

	public async validateIssueState(issue: Issue): Promise<void> {
		if (issue.state === 'closed') {
			const response = await this.promptUserConfirmation(
				`Issue #${issue.number} is closed. Continue anyway?`
			)
			if (!response) {
				throw new GitHubError(
					GitHubErrorCode.INVALID_STATE,
					'User cancelled due to closed issue'
				)
			}
		}
	}

	// PR fetching with validation
	public async fetchPR(prNumber: number): Promise<PullRequest> {
		try {
			return await this.fetchPRInternal(prNumber)
		} catch (error) {
			// Only throw NOT_FOUND for actual "not found" errors
			if (error instanceof Error && 'stderr' in error && (error as {stderr?: string}).stderr?.includes('Could not resolve')) {
				throw new GitHubError(
					GitHubErrorCode.NOT_FOUND,
					`PR #${prNumber} not found`,
					error
				)
			}
			// Re-throw all other errors unchanged
			throw error
		}
	}

	// Silent PR validation (for detection phase)
	public async isValidPR(prNumber: number): Promise<PullRequest | false> {
		try {
			return await this.fetchPRInternal(prNumber)
		} catch (error) {
			// Silently return false for "not found" errors
			if (error instanceof Error && 'stderr' in error && (error as {stderr?: string}).stderr?.includes('Could not resolve')) {
				return false
			}
			// Re-throw unexpected errors
			throw error
		}
	}

	// Internal PR fetching logic (shared by fetchPR and isValidPR)
	private async fetchPRInternal(prNumber: number): Promise<PullRequest> {
		const ghPR = await fetchGhPR(prNumber)
		return this.mapGitHubPRToPullRequest(ghPR)
	}

	public async validatePRState(pr: PullRequest): Promise<void> {
		if (pr.state === 'closed' || pr.state === 'merged') {
			const response = await this.promptUserConfirmation(
				`PR #${pr.number} is ${pr.state}. Continue anyway?`
			)
			if (!response) {
				throw new GitHubError(
					GitHubErrorCode.INVALID_STATE,
					`User cancelled due to ${pr.state} PR`
				)
			}
		}
	}

	// Branch name generation using strategy pattern
	public async generateBranchName(
		options: BranchGenerationOptions
	): Promise<string> {
		const { issueNumber, title, strategy } = options

		// Use provided strategy or fall back to default
		const nameStrategy = strategy ?? this.defaultBranchNameStrategy

		logger.debug('Generating branch name', {
			issueNumber,
			title,
			strategy: nameStrategy.constructor.name,
		})

		return nameStrategy.generate(issueNumber, title)
	}

	// GitHub Projects integration
	public async moveIssueToInProgress(issueNumber: number): Promise<void> {
		// Based on bash script lines 374-463
		logger.info('Moving issue to In Progress in GitHub Projects', {
			issueNumber,
		})

		// Check for project scope
		if (!(await hasProjectScope())) {
			logger.warn('Missing project scope in GitHub CLI auth')
			throw new GitHubError(
				GitHubErrorCode.MISSING_SCOPE,
				'GitHub CLI lacks project scope. Run: gh auth refresh -s project'
			)
		}

		// Get repository info
		let owner: string
		try {
			const repoInfo = await executeGhCommand<{
				owner: { login: string }
				name: string
			}>(['repo', 'view', '--json', 'owner,name'])
			owner = repoInfo.owner.login
		} catch (error) {
			logger.warn('Could not determine repository info', { error })
			return
		}

		// List all projects
		let projects: GitHubProject[]
		try {
			projects = await fetchProjectList(owner)
		} catch (error) {
			logger.warn('Could not fetch projects', { owner, error })
			return
		}

		if (!projects.length) {
			logger.warn('No projects found', { owner })
			return
		}

		// Process each project (lines 404-460 in bash)
		for (const project of projects) {
			await this.updateIssueStatusInProject(project, issueNumber, owner)
		}
	}

	private async updateIssueStatusInProject(
		project: GitHubProject,
		issueNumber: number,
		owner: string
	): Promise<void> {
		// Check if issue is in project
		let items: ProjectItem[]
		try {
			items = await fetchProjectItems(project.number, owner)
		} catch (error) {
			logger.debug('Could not fetch project items', { project: project.number, error })
			return
		}

		// Find issue item
		const item = items.find(
			(i: ProjectItem) =>
				i.content.type === 'Issue' && i.content.number === issueNumber
		)

		if (!item) {
			logger.debug('Issue not found in project', {
				issueNumber,
				projectNumber: project.number,
			})
			return
		}

		// Find Status field and In Progress option
		const statusField = project.fields.find((f) => f.name === 'Status')
		if (!statusField) {
			return
		}

		const inProgressOption = statusField.options?.find(
			(o) => o.name === 'In Progress' || o.name === 'In progress'
		)

		if (!inProgressOption) {
			return
		}

		// Update status
		try {
			await updateProjectItemField(
				item.id,
				project.id,
				statusField.id,
				inProgressOption.id
			)

			logger.info('Updated issue status in project', {
				issueNumber,
				projectNumber: project.number,
			})
		} catch (error) {
			logger.debug('Could not update project item', { item: item.id, error })
		}
	}

	// Utility methods
	public extractContext(entity: Issue | PullRequest): string {
		if ('branch' in entity) {
			// It's a PullRequest
			return `Pull Request #${entity.number}: ${entity.title}\nBranch: ${entity.branch}\nState: ${entity.state}`
		} else {
			// It's an Issue
			return `GitHub Issue #${entity.number}: ${entity.title}\nState: ${entity.state}`
		}
	}

	private mapGitHubIssueToIssue(ghIssue: GitHubIssue): Issue {
		return {
			number: ghIssue.number,
			title: ghIssue.title,
			body: ghIssue.body,
			state: ghIssue.state.toLowerCase() as 'open' | 'closed',
			labels: ghIssue.labels.map((l) => l.name),
			assignees: ghIssue.assignees.map((a) => a.login),
			url: ghIssue.url,
		}
	}

	private mapGitHubPRToPullRequest(ghPR: GitHubPullRequest): PullRequest {
		return {
			number: ghPR.number,
			title: ghPR.title,
			body: ghPR.body,
			state: ghPR.state.toLowerCase() as 'open' | 'closed' | 'merged',
			branch: ghPR.headRefName,
			baseBranch: ghPR.baseRefName,
			url: ghPR.url,
			isDraft: ghPR.isDraft,
		}
	}

	private async promptUserConfirmation(message: string): Promise<boolean> {
		return this.prompter(message)
	}

	// Allow setting strategy at runtime for specific operations
	public setDefaultBranchNameStrategy(strategy: BranchNameStrategy): void {
		this.defaultBranchNameStrategy = strategy
	}

	// Get current strategy for testing
	public getBranchNameStrategy(): BranchNameStrategy {
		return this.defaultBranchNameStrategy
	}
}
