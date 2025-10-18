import { execa } from 'execa'
import type {
	GitHubIssue,
	GitHubPullRequest,
	GitHubProject,
	GitHubAuthStatus,
	BranchNameStrategy,
	ProjectItem,
	ProjectField,
} from '../types/github.js'
import { logger } from './logger.js'

// Core GitHub CLI execution wrapper
export async function executeGhCommand<T = unknown>(
	args: string[],
	options?: { cwd?: string; timeout?: number }
): Promise<T> {
	const result = await execa('gh', args, {
		cwd: options?.cwd ?? process.cwd(),
		timeout: options?.timeout ?? 30000,
		encoding: 'utf8',
	})

	// Parse JSON output if --json flag, --format json, or --jq was used
	const isJson =
		args.includes('--json') ||
		args.includes('--jq') ||
		(args.includes('--format') && args[args.indexOf('--format') + 1] === 'json')
	const data = isJson ? JSON.parse(result.stdout) : result.stdout

	return data as T
}

// Authentication checking
export async function checkGhAuth(): Promise<GitHubAuthStatus> {
	try {
		const output = await executeGhCommand<string>(['auth', 'status'])

		// Parse auth status output
		const scopeMatch = output.match(/Token scopes: (.+)/)
		const userMatch = output.match(/Logged in to github\.com as ([^\s]+)/)

		const username = userMatch?.[1]

		return {
			hasAuth: true,
			scopes: scopeMatch?.[1]?.split(', ').map(scope => scope.replace(/^'|'$/g, '')) ?? [],
			...(username && { username }),
		}
	} catch (error) {
		// Only return "no auth" for specific authentication errors
		if (error instanceof Error && 'stderr' in error && (error as {stderr?: string}).stderr?.includes('You are not logged into any GitHub hosts')) {
			return { hasAuth: false, scopes: [] }
		}
		// Re-throw unexpected errors
		throw error
	}
}

export async function hasProjectScope(): Promise<boolean> {
	const auth = await checkGhAuth()
	return auth.scopes.includes('project')
}

// Issue fetching
export async function fetchGhIssue(
	issueNumber: number
): Promise<GitHubIssue> {
	logger.debug('Fetching GitHub issue', { issueNumber })

	return executeGhCommand<GitHubIssue>([
		'issue',
		'view',
		String(issueNumber),
		'--json',
		'number,title,body,state,labels,assignees,url,createdAt,updatedAt',
	])
}

// PR fetching
export async function fetchGhPR(
	prNumber: number
): Promise<GitHubPullRequest> {
	logger.debug('Fetching GitHub PR', { prNumber })

	return executeGhCommand<GitHubPullRequest>([
		'pr',
		'view',
		String(prNumber),
		'--json',
		'number,title,body,state,headRefName,baseRefName,url,isDraft,mergeable,createdAt,updatedAt',
	])
}

// Project operations
export async function fetchProjectList(
	owner: string
): Promise<GitHubProject[]> {
	const result = await executeGhCommand<{ projects: GitHubProject[] }>([
		'project',
		'list',
		'--owner',
		owner,
		'--limit',
		'100',
		'--format',
		'json',
	])

	return result?.projects ?? []
}

export async function fetchProjectItems(
	projectNumber: number,
	owner: string
): Promise<ProjectItem[]> {
	const result = await executeGhCommand<{ items: ProjectItem[] }>([
		'project',
		'item-list',
		String(projectNumber),
		'--owner',
		owner,
		'--limit',
		'10000',
		'--format',
		'json',
	])

	return result?.items ?? []
}

export async function fetchProjectFields(
	projectNumber: number,
	owner: string
): Promise<{ fields: ProjectField[] }> {
	const result = await executeGhCommand<{ fields: ProjectField[] }>([
		'project',
		'field-list',
		String(projectNumber),
		'--owner',
		owner,
		'--format',
		'json',
	])

	return result ?? { fields: [] }
}

export async function updateProjectItemField(
	itemId: string,
	projectId: string,
	fieldId: string,
	optionId: string
): Promise<void> {
	await executeGhCommand([
		'project',
		'item-edit',
		'--id',
		itemId,
		'--project-id',
		projectId,
		'--field-id',
		fieldId,
		'--single-select-option-id',
		optionId,
		'--format',
		'json',
	])
}

// Branch name generation strategies
export class SimpleBranchNameStrategy implements BranchNameStrategy {
	async generate(issueNumber: number, title: string): Promise<string> {
		// Create a simple slug from the title
		const slug = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.substring(0, 20) // Keep it short for the simple strategy

		return `feat/issue-${issueNumber}-${slug}`
	}
}

export class ClaudeBranchNameStrategy implements BranchNameStrategy {
	constructor(private claudeModel = 'sonnet') {}

	async generate(issueNumber: number, title: string): Promise<string> {
		// Import dynamically to avoid circular dependency
		const { generateBranchName } = await import('../utils/claude.js')

		// Delegate to the shared implementation
		return generateBranchName(title, issueNumber, this.claudeModel)
	}
}

// Template-based strategy for custom patterns
export class TemplateBranchNameStrategy implements BranchNameStrategy {
	constructor(private template = '{prefix}/issue-{number}-{slug}') {}

	async generate(issueNumber: number, title: string): Promise<string> {
		// Determine prefix based on title
		const prefix = this.determinePrefix(title)

		// Create slug from title
		const slug = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.substring(0, 30)

		return this.template
			.replace('{prefix}', prefix)
			.replace('{number}', String(issueNumber))
			.replace('{slug}', slug)
	}

	private determinePrefix(title: string): string {
		const lowerTitle = title.toLowerCase()
		if (lowerTitle.includes('fix') || lowerTitle.includes('bug')) return 'fix'
		if (lowerTitle.includes('doc')) return 'docs'
		if (lowerTitle.includes('test')) return 'test'
		if (lowerTitle.includes('refactor')) return 'refactor'
		return 'feat'
	}
}

// GitHub Comment Operations

interface CommentResponse {
	id: number
	url: string
	created_at?: string
	updated_at?: string
}

interface RepoInfo {
	owner: string
	name: string
}

/**
 * Create a comment on a GitHub issue
 * @param issueNumber - The issue number
 * @param body - The comment body (markdown supported)
 * @returns Comment metadata including ID and URL
 */
export async function createIssueComment(
	issueNumber: number,
	body: string
): Promise<CommentResponse> {
	logger.debug('Creating issue comment', { issueNumber })

	return executeGhCommand<CommentResponse>([
		'api',
		`repos/:owner/:repo/issues/${issueNumber}/comments`,
		'-f',
		`body=${body}`,
		'--jq',
		'{id: .id, url: .html_url, created_at: .created_at}',
	])
}

/**
 * Update an existing GitHub comment
 * @param commentId - The comment ID
 * @param body - The updated comment body (markdown supported)
 * @returns Updated comment metadata
 */
export async function updateIssueComment(
	commentId: number,
	body: string
): Promise<CommentResponse> {
	logger.debug('Updating issue comment', { commentId })

	return executeGhCommand<CommentResponse>([
		'api',
		`repos/:owner/:repo/issues/comments/${commentId}`,
		'-X',
		'PATCH',
		'-f',
		`body=${body}`,
		'--jq',
		'{id: .id, url: .html_url, updated_at: .updated_at}',
	])
}

/**
 * Create a comment on a GitHub pull request
 * Note: PR comments use the same endpoint as issue comments
 * @param prNumber - The PR number
 * @param body - The comment body (markdown supported)
 * @returns Comment metadata including ID and URL
 */
export async function createPRComment(
	prNumber: number,
	body: string
): Promise<CommentResponse> {
	logger.debug('Creating PR comment', { prNumber })

	// PR comments use the issues endpoint
	return executeGhCommand<CommentResponse>([
		'api',
		`repos/:owner/:repo/issues/${prNumber}/comments`,
		'-f',
		`body=${body}`,
		'--jq',
		'{id: .id, url: .html_url, created_at: .created_at}',
	])
}

/**
 * Get repository owner and name from current directory
 * @returns Repository owner and name
 */
export async function getRepoInfo(): Promise<RepoInfo> {
	logger.debug('Fetching repository info')

	const result = await executeGhCommand<{ owner: { login: string }; name: string }>([
		'repo',
		'view',
		'--json',
		'owner,name',
	])

	return {
		owner: result.owner.login,
		name: result.name,
	}
}