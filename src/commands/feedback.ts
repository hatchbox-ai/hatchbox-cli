import type { FeedbackOptions } from '../types/index.js'
import { IssueEnhancementService } from '../lib/IssueEnhancementService.js'
import { GitHubService } from '../lib/GitHubService.js'
import { AgentManager } from '../lib/AgentManager.js'
import { SettingsManager } from '../lib/SettingsManager.js'

// Hardcoded target repository for feedback
const FEEDBACK_REPOSITORY = 'hatchbox-ai/hatchbox-cli'

/**
 * Input structure for FeedbackCommand
 */
export interface FeedbackCommandInput {
	description: string
	options: FeedbackOptions
}

/**
 * Command to submit feedback/bug reports to the hatchbox-cli repository.
 * Mirrors add-issue command but targets hatchbox-ai/hatchbox-cli repo.
 */
export class FeedbackCommand {
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
	 * Execute the feedback command workflow:
	 * 1. Validate description format
	 * 2. Create GitHub issue in hatchbox-ai/hatchbox-cli (no AI enhancement)
	 * 3. Wait for keypress and open browser for review
	 * 4. Return issue number
	 */
	public async execute(input: FeedbackCommandInput): Promise<number> {
		const { description } = input

		// Step 1: Validate description format
		if (!description || !this.enhancementService.validateDescription(description)) {
			throw new Error('Description is required and must be more than 50 characters with at least 3 words')
		}

		// Step 2: Create GitHub issue in hatchbox-cli repo with cli-feedback label
		// Note: The description is used as both title and body - GitHub Action will enhance later
		const result = await this.enhancementService.createEnhancedIssue(
			description,
			description,
			FEEDBACK_REPOSITORY,
			['cli-feedback']
		)

		// Step 3: Wait for keypress and open issue in browser for review
		await this.enhancementService.waitForReviewAndOpen(result.number, false, FEEDBACK_REPOSITORY)

		// Step 4: Return issue number for reference
		return result.number
	}
}
