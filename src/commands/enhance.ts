import type { GitHubService } from '../lib/GitHubService.js'
import type { AgentManager } from '../lib/AgentManager.js'
import type { SettingsManager } from '../lib/SettingsManager.js'
import { launchClaude } from '../utils/claude.js'
import { openBrowser } from '../utils/browser.js'
import { waitForKeypress } from '../utils/prompt.js'
import { logger } from '../utils/logger.js'
import { GitHubService as DefaultGitHubService } from '../lib/GitHubService.js'
import { AgentManager as DefaultAgentManager } from '../lib/AgentManager.js'
import { SettingsManager as DefaultSettingsManager } from '../lib/SettingsManager.js'

export interface EnhanceCommandInput {
	issueNumber: number
	options: EnhanceOptions
}

export interface EnhanceOptions {
	noBrowser?: boolean // Skip browser opening prompt
}

/**
 * Command to enhance existing GitHub issues with AI assistance.
 * Applies the issue enhancer agent to an existing issue, respecting idempotency checks.
 */
export class EnhanceCommand {
	private gitHubService: GitHubService
	private agentManager: AgentManager
	private settingsManager: SettingsManager

	constructor(
		gitHubService?: GitHubService,
		agentManager?: AgentManager,
		settingsManager?: SettingsManager
	) {
		// Use provided services or create defaults
		this.gitHubService = gitHubService ?? new DefaultGitHubService()
		this.agentManager = agentManager ?? new DefaultAgentManager()
		this.settingsManager = settingsManager ?? new DefaultSettingsManager()
	}

	/**
	 * Execute the enhance command workflow:
	 * 1. Validate issue number
	 * 2. Fetch issue to verify it exists
	 * 3. Load agent configurations
	 * 4. Invoke Claude CLI with enhancer agent
	 * 5. Parse response to determine outcome
	 * 6. Handle browser interaction based on outcome
	 */
	public async execute(input: EnhanceCommandInput): Promise<void> {
		const { issueNumber, options } = input

		// Step 1: Validate issue number
		this.validateIssueNumber(issueNumber)

		// Step 2: Fetch issue to verify it exists
		logger.info(`Fetching issue #${issueNumber}...`)
		const issue = await this.gitHubService.fetchIssue(issueNumber)
		logger.debug('Issue fetched successfully', { number: issue.number, title: issue.title })

		// Step 3: Load agent configurations
		logger.debug('Loading agent configurations...')
		const settings = await this.settingsManager.loadSettings()
		const loadedAgents = await this.agentManager.loadAgents(settings)
		const agents = this.agentManager.formatForCli(loadedAgents)

		// Step 4: Invoke Claude CLI with enhancer agent
		logger.info('Invoking enhancer agent. This may take a moment...')
		const prompt = this.constructPrompt(issueNumber)
		const response = await launchClaude(prompt, {
			headless: true,
			model: 'sonnet',
			agents,
		})

		// Step 5: Parse response to determine outcome
		const result = this.parseEnhancerResponse(response)

		// Step 6: Handle browser interaction based on outcome
		if (!result.enhanced) {
			logger.success('Issue already has thorough description. No enhancement needed.')
			return
		}

		logger.success(`Issue #${issueNumber} enhanced successfully!`)
		logger.info(`Enhanced specification available at: ${result.url}`)

		// Prompt to open browser (unless --no-browser flag is set)
		if (!options.noBrowser && result.url) {
			await this.promptAndOpenBrowser(result.url)
		}
	}

	/**
	 * Validate that issue number is a valid positive integer
	 */
	private validateIssueNumber(issueNumber: number): void {
		if (issueNumber === undefined || issueNumber === null) {
			throw new Error('Issue number is required')
		}

		if (typeof issueNumber !== 'number' || Number.isNaN(issueNumber) || issueNumber <= 0 || !Number.isInteger(issueNumber)) {
			throw new Error('Issue number must be a valid positive integer')
		}
	}

	/**
	 * Construct the prompt for the orchestrating Claude instance.
	 * This prompt is very clear about expected output format to ensure reliable parsing.
	 */
	private constructPrompt(issueNumber: number): string {
		return `Execute @agent-hatchbox-issue-enhancer ${issueNumber}

## OUTPUT REQUIREMENTS
* If the issue was not enhanced, return ONLY: "No enhancement needed"
* If the issue WAS enhanced, return ONLY: <FULL URL OF THE COMMENT INCLUDING COMMENT ID>
* IMPORTANT: Return ONLY one of the above - DO NOT include commentary such as "I created a comment at <URL>" or "I examined the issue and found no enhancement was necessary"
* CONTEXT: Your output is going to be parsed programmatically, so adherence to the output requirements is CRITICAL.`
	}

	/**
	 * Parse the response from the enhancer agent.
	 * Returns either { enhanced: false } or { enhanced: true, url: "..." }
	 */
	private parseEnhancerResponse(response: string | void): { enhanced: boolean; url?: string } {
		// Handle empty or void response
		if (!response || typeof response !== 'string') {
			throw new Error('No response from enhancer agent')
		}

		const trimmed = response.trim()

		// Check for "No enhancement needed" (case-insensitive)
		if (trimmed.toLowerCase().includes('no enhancement needed')) {
			return { enhanced: false }
		}

		// Check if response looks like a GitHub comment URL
		const urlPattern = /https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+#issuecomment-\d+/
		const match = trimmed.match(urlPattern)

		if (match) {
			return { enhanced: true, url: match[0] }
		}

		// Unexpected response format
		throw new Error(`Unexpected response from enhancer agent: ${trimmed}`)
	}

	/**
	 * Prompt user and open browser to view enhanced issue.
	 * Matches the pattern from the issue specification.
	 */
	private async promptAndOpenBrowser(commentUrl: string): Promise<void> {
		try {
			// Prompt user with custom message
			await waitForKeypress(
				'Press q to quit or any other key to view the enhanced issue in a web browser...'
			)

			// Open browser with comment URL
			await openBrowser(commentUrl)
		} catch (error) {
			// Browser opening failures should not be fatal
			logger.warn(`Failed to open browser: ${error instanceof Error ? error.message : 'Unknown error'}`)
		}
	}
}
