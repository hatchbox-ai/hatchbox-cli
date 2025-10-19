import path from 'path'
import { logger } from '../utils/logger.js'
import { ClaudeWorkflowOptions } from '../lib/ClaudeService.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { launchClaude, ClaudeCliOptions } from '../utils/claude.js'
import { PromptTemplateManager, TemplateVariables } from '../lib/PromptTemplateManager.js'
import { getRepoInfo } from '../utils/github.js'

/**
 * IgniteCommand: Auto-detect workspace context and launch Claude
 *
 * This command:
 * 1. Auto-detects context from current directory and git branch
 * 2. Loads appropriate prompt template with variable substitution
 * 3. Launches Claude with existing agent system (NO changes to agent loading)
 * 4. Executes in current terminal (not opening a new window)
 *
 * CRITICAL: This command works with agents exactly as they currently function.
 * NO modifications to agent loading mechanisms.
 */
export class IgniteCommand {
	private templateManager: PromptTemplateManager
	private gitWorktreeManager: GitWorktreeManager

	constructor(
		templateManager?: PromptTemplateManager,
		gitWorktreeManager?: GitWorktreeManager
	) {
		this.templateManager = templateManager ?? new PromptTemplateManager()
		this.gitWorktreeManager = gitWorktreeManager ?? new GitWorktreeManager()
	}

	/**
	 * Main entry point for ignite command
	 */
	async execute(): Promise<void> {
		try {
			logger.info('🚀 Your hatchbox is igniting, please wait...')

			// Step 1: Auto-detect workspace context
			const context = await this.detectWorkspaceContext()

			logger.debug('Auto-detected workspace context', { context })

			// Inform user what context was detected
			this.logDetectedContext(context)

			logger.info('📝 Loading prompt template and preparing Claude...')

			// Step 2: Get prompt template with variable substitution
			const variables = this.buildTemplateVariables(context)
			const systemInstructions = await this.templateManager.getPrompt(context.type, variables)

			// User prompt to trigger the workflow (system instructions set behavior via appendSystemPrompt)
			const userPrompt = 'Go!'

			// Step 3: Determine model and permission mode based on workflow type
			const model = this.getModelForWorkflow(context.type)
			const permissionMode = this.getPermissionModeForWorkflow(context.type)

			// Step 4: Build Claude CLI options
			const claudeOptions: ClaudeCliOptions = {
				headless: false, // Enable stdio: 'inherit' for current terminal
				addDir: context.workspacePath,
			}

			// Add optional model if present
			if (model !== undefined) {
				claudeOptions.model = model
			}

			// Add permission mode if not default
			if (permissionMode !== undefined && permissionMode !== 'default') {
				claudeOptions.permissionMode = permissionMode
			}

			// Add optional branch name for context
			if (context.branchName !== undefined) {
				claudeOptions.branchName = context.branchName
			}

			// Step 4.5: Generate MCP config and tool filtering for issue/PR workflows
			let mcpConfig: Record<string, unknown>[] | undefined
			let allowedTools: string[] | undefined
			let disallowedTools: string[] | undefined

			if (context.type === 'issue' || context.type === 'pr') {
				try {
					mcpConfig = await this.generateMcpConfig(context)
					logger.debug('Generated MCP configuration for GitHub comment broker')

					// Configure tool filtering for issue/PR workflows
					allowedTools = [
						'mcp__github_comment__create_comment',
						'mcp__github_comment__update_comment',
					]
					disallowedTools = ['Bash(gh api:*)']

					logger.debug('Configured tool filtering for issue/PR workflow', { allowedTools, disallowedTools })
				} catch (error) {
					// Log warning but continue without MCP
					logger.warn(`Failed to generate MCP config: ${error instanceof Error ? error.message : 'Unknown error'}`)
				}
			}

			logger.debug('Launching Claude in current terminal', {
				type: context.type,
				model,
				permissionMode,
				workspacePath: context.workspacePath,
				hasMcpConfig: !!mcpConfig,
			})

			logger.info('✨ Launching Claude in current terminal...')

			// Step 5: Launch Claude with system instructions appended and user prompt
			await launchClaude(userPrompt, {
				...claudeOptions,
				appendSystemPrompt: systemInstructions,
				...(mcpConfig && { mcpConfig }),
				...(allowedTools && { allowedTools }),
				...(disallowedTools && { disallowedTools }),
			})
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			logger.error(`Failed to launch Claude: ${errorMessage}`)
			throw error
		}
	}

	/**
	 * Log user-friendly information about detected context
	 */
	private logDetectedContext(context: ClaudeWorkflowOptions): void {
		if (context.type === 'issue') {
			logger.info(`🎯 Detected issue workflow: Issue #${context.issueNumber}`)
		} else if (context.type === 'pr') {
			logger.info(`🔄 Detected PR workflow: PR #${context.prNumber}`)
		} else {
			logger.info('🌟 Detected regular workflow')
		}

		if (context.branchName) {
			logger.info(`🌿 Working on branch: ${context.branchName}`)
		}

		if (context.port) {
			logger.info(`🌐 Development server port: ${context.port}`)
		}
	}

	/**
	 * Build template variables from context
	 */
	private buildTemplateVariables(context: ClaudeWorkflowOptions): TemplateVariables {
		const variables: TemplateVariables = {
			WORKSPACE_PATH: context.workspacePath,
		}

		if (context.issueNumber !== undefined) {
			variables.ISSUE_NUMBER = context.issueNumber
		}

		if (context.prNumber !== undefined) {
			variables.PR_NUMBER = context.prNumber
		}

		if (context.title !== undefined) {
			if (context.type === 'issue') {
				variables.ISSUE_TITLE = context.title
			} else if (context.type === 'pr') {
				variables.PR_TITLE = context.title
			}
		}

		if (context.port !== undefined) {
			variables.PORT = context.port
		}

		return variables
	}

	/**
	 * Get the appropriate model for a workflow type
	 * Same logic as ClaudeService.getModelForWorkflow()
	 */
	private getModelForWorkflow(type: 'issue' | 'pr' | 'regular'): string | undefined {
		// Issue workflows use claude-sonnet-4-20250514
		if (type === 'issue') {
			return 'claude-sonnet-4-20250514'
		}
		// For PR and regular workflows, use Claude's default model
		return undefined
	}

	/**
	 * Get the appropriate permission mode for a workflow type
	 * Same logic as ClaudeService.getPermissionModeForWorkflow()
	 */
	private getPermissionModeForWorkflow(
		type: 'issue' | 'pr' | 'regular'
	): ClaudeCliOptions['permissionMode'] {
		// Issue workflows use acceptEdits mode
		if (type === 'issue') {
			return 'acceptEdits'
		}
		// For PR and regular workflows, use default permissions
		return 'default'
	}

	/**
	 * Auto-detect workspace context from current directory and git branch
	 *
	 * Detection priority:
	 * 1. Directory name patterns (_pr_N, issue-N)
	 * 2. Git branch name patterns
	 * 3. Fallback to 'regular' workflow
	 *
	 * This leverages the same logic as FinishCommand.autoDetectFromCurrentDirectory()
	 */
	private async detectWorkspaceContext(): Promise<ClaudeWorkflowOptions> {
		const workspacePath = process.cwd()
		const currentDir = path.basename(workspacePath)

		// Check for PR worktree pattern: _pr_N suffix
		// Pattern: /.*_pr_(\d+)$/
		const prPattern = /_pr_(\d+)$/
		const prMatch = currentDir.match(prPattern)

		if (prMatch?.[1]) {
			const prNumber = parseInt(prMatch[1], 10)
			logger.debug(`Auto-detected PR #${prNumber} from directory: ${currentDir}`)

			return this.buildContextForPR(prNumber, workspacePath)
		}

		// Check for issue pattern in directory name
		// Pattern: /issue-(\d+)/
		const issuePattern = /issue-(\d+)/
		const issueMatch = currentDir.match(issuePattern)

		if (issueMatch?.[1]) {
			const issueNumber = parseInt(issueMatch[1], 10)
			logger.debug(`Auto-detected issue #${issueNumber} from directory: ${currentDir}`)

			return this.buildContextForIssue(issueNumber, workspacePath)
		}

		// Fallback: Try to extract from git branch name
		try {
			const repoInfo = await this.gitWorktreeManager.getRepoInfo()
			const currentBranch = repoInfo.currentBranch

			if (currentBranch) {
				// Try to extract issue from branch name
				const branchIssueMatch = currentBranch.match(issuePattern)
				if (branchIssueMatch?.[1]) {
					const issueNumber = parseInt(branchIssueMatch[1], 10)
					logger.debug(`Auto-detected issue #${issueNumber} from branch: ${currentBranch}`)

					return this.buildContextForIssue(issueNumber, workspacePath, currentBranch)
				}
			}
		} catch (error) {
			// Git command failed - not a git repo or other git error
			logger.debug('Could not detect from git branch', { error })
		}

		// Last resort: use regular workflow
		logger.debug('No specific context detected, using regular workflow')
		return this.buildContextForRegular(workspacePath)
	}

	/**
	 * Build context for issue workflow
	 */
	private async buildContextForIssue(
		issueNumber: number,
		workspacePath: string,
		branchName?: string
	): Promise<ClaudeWorkflowOptions> {
		// Get branch name if not provided
		if (!branchName) {
			try {
				const repoInfo = await this.gitWorktreeManager.getRepoInfo()
				branchName = repoInfo.currentBranch ?? undefined
			} catch {
				// Ignore git errors
			}
		}

		const port = this.getPortFromEnv()
		const context: ClaudeWorkflowOptions = {
			type: 'issue',
			issueNumber,
			workspacePath,
			headless: false, // Interactive mode
		}

		if (port !== undefined) {
			context.port = port
		}

		if (branchName !== undefined) {
			context.branchName = branchName
		}

		return context
	}

	/**
	 * Build context for PR workflow
	 */
	private async buildContextForPR(
		prNumber: number,
		workspacePath: string
	): Promise<ClaudeWorkflowOptions> {
		// Get branch name
		let branchName: string | undefined
		try {
			const repoInfo = await this.gitWorktreeManager.getRepoInfo()
			branchName = repoInfo.currentBranch ?? undefined
		} catch {
			// Ignore git errors
		}

		const port = this.getPortFromEnv()
		const context: ClaudeWorkflowOptions = {
			type: 'pr',
			prNumber,
			workspacePath,
			headless: false, // Interactive mode
		}

		if (port !== undefined) {
			context.port = port
		}

		if (branchName !== undefined) {
			context.branchName = branchName
		}

		return context
	}

	/**
	 * Build context for regular workflow
	 */
	private async buildContextForRegular(workspacePath: string): Promise<ClaudeWorkflowOptions> {
		// Get branch name
		let branchName: string | undefined
		try {
			const repoInfo = await this.gitWorktreeManager.getRepoInfo()
			branchName = repoInfo.currentBranch ?? undefined
		} catch {
			// Ignore git errors
		}

		const port = this.getPortFromEnv()
		const context: ClaudeWorkflowOptions = {
			type: 'regular',
			workspacePath,
			headless: false, // Interactive mode
		}

		if (port !== undefined) {
			context.port = port
		}

		if (branchName !== undefined) {
			context.branchName = branchName
		}

		return context
	}

	/**
	 * Get PORT from environment variables
	 * Returns undefined if PORT is not set or invalid
	 */
	private getPortFromEnv(): number | undefined {
		const portStr = process.env.PORT
		if (!portStr) {
			return undefined
		}

		const port = parseInt(portStr, 10)
		if (isNaN(port)) {
			logger.warn(`Invalid PORT environment variable: ${portStr}`)
			return undefined
		}

		return port
	}

	/**
	 * Generate MCP configuration for GitHub comment broker
	 * Returns array of MCP server config objects
	 */
	private async generateMcpConfig(context: ClaudeWorkflowOptions): Promise<Record<string, unknown>[]> {
		// Get repository information
		const repoInfo = await getRepoInfo()

		// Determine GitHub event name based on context type
		const githubEventName = context.type === 'issue' ? 'issues' : 'pull_request'
		// const args = [path.join(path.dirname(new URL(import.meta.url).pathname), '../mcp/github-comment-server.js')]

		// logger.debug('')
		// Build MCP server configuration wrapped in github_comment key
		const mcpServerConfig = {
			mcpServers: {
				github_comment: {
					transport: 'stdio',
					command: 'node',
					args: [path.join(path.dirname(new globalThis.URL(import.meta.url).pathname), '../dist/mcp/github-comment-server.js')],
					env: {
						REPO_OWNER: repoInfo.owner,
						REPO_NAME: repoInfo.name,
						GITHUB_EVENT_NAME: githubEventName,
						GITHUB_API_URL: 'https://api.github.com/',
					},
				},
			},
		}

		logger.debug('Generated MCP config', { mcpServerConfig })

		// Return as array (user clarification: mcpConfig should be an array)
		return [mcpServerConfig]
	}
}
