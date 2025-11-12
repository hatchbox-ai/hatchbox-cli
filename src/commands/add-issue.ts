import type { AddIssueOptions } from '../types/index.js'
import { IssueEnhancementService } from '../lib/IssueEnhancementService.js'
import { GitHubService } from '../lib/GitHubService.js'
import { AgentManager } from '../lib/AgentManager.js'
import { SettingsManager } from '../lib/SettingsManager.js'

/**
 * Input structure for AddIssueCommand
 */
export interface AddIssueCommandInput {
	description: string
	options: AddIssueOptions
}

/**
 * Command to create and enhance GitHub issues without creating workspaces.
 * This separates the "document the work" step from the "start the work" step.
 */
export class AddIssueCommand {
	private enhancementService: IssueEnhancementService

	constructor(enhancementService?: IssueEnhancementService) {
		// Use provided service or create default
		this.enhancementService = enhancementService ?? new IssueEnhancementService(
			new GitHubService(),
			new AgentManager(),
			new SettingsManager()
		)
	}

	/**
	 * Execute the add-issue command workflow:
	 * 1. Validate description format
	 * 2. Enhance description with Claude AI
	 * 3. Create GitHub issue
	 * 4. Wait for keypress and open browser for review
	 * 5. Return issue number
	 */
	public async execute(input: AddIssueCommandInput): Promise<number> {
		const { description } = input

		// Step 1: Validate description format
		if (!description || !this.enhancementService.validateDescription(description)) {
			throw new Error('Description is required and must be more than 30 characters with at least 3 words')
		}

		// Step 2: Enhance description using Claude AI
		const enhancedDescription = await this.enhancementService.enhanceDescription(description)

		// Step 3: Create GitHub issue with original as title, enhanced as body
		const result = await this.enhancementService.createEnhancedIssue(
			description,
			enhancedDescription
		)

		// Step 4: Wait for keypress and open issue in browser for review
		await this.enhancementService.waitForReviewAndOpen(result.number)

		// Step 5: Return issue number for reference
		return result.number
	}
}
