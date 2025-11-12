import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FeedbackCommand } from './feedback.js'
import { IssueEnhancementService } from '../lib/IssueEnhancementService.js'
import type { GitHubService } from '../lib/GitHubService.js'
import type { AgentManager } from '../lib/AgentManager.js'
import type { SettingsManager } from '../lib/SettingsManager.js'

// Mock dependencies
vi.mock('../lib/IssueEnhancementService.js')

// Mock the logger to prevent console output during tests
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

describe('FeedbackCommand', () => {
	let command: FeedbackCommand
	let mockEnhancementService: IssueEnhancementService

	beforeEach(() => {
		mockEnhancementService = new IssueEnhancementService(
			{} as GitHubService,
			{} as AgentManager,
			{} as SettingsManager
		)
		command = new FeedbackCommand(mockEnhancementService)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('execute', () => {
		const validDescription = 'This is a valid feedback description that has more than fifty characters and multiple spaces'

		describe('input validation', () => {
			it('should throw error when description is empty or missing', async () => {
				await expect(
					command.execute({ description: '', options: {} })
				).rejects.toThrow('Description is required and must be more than 30 characters with at least 3 words')
			})

			it('should throw error when description is too short (<50 chars)', async () => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(false)

				await expect(
					command.execute({ description: 'Short description', options: {} })
				).rejects.toThrow('Description is required and must be more than 30 characters with at least 3 words')
			})

			it('should throw error when description has insufficient spaces (<=2)', async () => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(false)

				await expect(
					command.execute({ description: 'This has twospacesbutmorethanthirtycharactersintotal', options: {} })
				).rejects.toThrow('Description is required and must be more than 30 characters with at least 3 words')
			})

			it('should accept valid descriptions (>30 chars AND >2 spaces)', async () => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await expect(
					command.execute({ description: validDescription, options: {} })
				).resolves.toBe(123)
			})
		})


		describe('GitHub integration', () => {
			beforeEach(() => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')
			})

			it('should call createEnhancedIssue with hatchbox-cli repository parameter and no labels', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 456,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/456',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				// Verify repository parameter is 'hatchbox-ai/hatchbox-cli' and no labels are passed
				expect(mockEnhancementService.createEnhancedIssue).toHaveBeenCalledWith(
					validDescription,
					expect.stringContaining('<!-- CLI GENERATED FEEDBACK'),
					'hatchbox-ai/hatchbox-cli',
					undefined // No labels
				)
			})

			it('should return the created issue number', async () => {
				const expectedIssueNumber = 789
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: expectedIssueNumber,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/789',
				})
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				const result = await command.execute({ description: validDescription, options: {} })

				expect(result).toBe(expectedIssueNumber)
			})

			it('should propagate errors from createEnhancedIssue', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockRejectedValue(
					new Error('GitHub API error')
				)

				await expect(
					command.execute({ description: validDescription, options: {} })
				).rejects.toThrow('GitHub API error')
			})
		})

		describe('browser interaction', () => {
			beforeEach(() => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.enhanceDescription).mockResolvedValue('Enhanced description')
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123',
				})
			})

			it('should call waitForReviewAndOpen with issue number', async () => {
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				expect(mockEnhancementService.waitForReviewAndOpen).toHaveBeenCalledWith(123, false, 'hatchbox-ai/hatchbox-cli')
				expect(mockEnhancementService.waitForReviewAndOpen).toHaveBeenCalledTimes(1)
			})

			it('should wait for review and open browser', async () => {
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)

				await command.execute({ description: validDescription, options: {} })

				expect(mockEnhancementService.waitForReviewAndOpen).toHaveBeenCalledWith(123, false, 'hatchbox-ai/hatchbox-cli')
			})

			it('should wait for review after issue creation', async () => {
				const calls: string[] = []

				vi.mocked(mockEnhancementService.createEnhancedIssue).mockImplementation(async () => {
					calls.push('create')
					return { number: 123, url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123' }
				})

				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockImplementation(async () => {
					calls.push('review')
				})

				await command.execute({ description: validDescription, options: {} })

				expect(calls).toEqual(['create', 'review'])
			})

			it('should handle browser opening failures gracefully', async () => {
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockRejectedValue(
					new Error('Browser opening failed')
				)

				await expect(
					command.execute({ description: validDescription, options: {} })
				).rejects.toThrow('Browser opening failed')
			})
		})

		describe('complete workflow', () => {
			it('should execute full workflow in correct order', async () => {
				const calls: string[] = []

				vi.mocked(mockEnhancementService.validateDescription).mockImplementation(() => {
					calls.push('validate')
					return true
				})


				vi.mocked(mockEnhancementService.createEnhancedIssue).mockImplementation(async () => {
					calls.push('create')
					return { number: 123, url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123' }
				})

				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockImplementation(async () => {
					calls.push('review')
				})

				await command.execute({ description: validDescription, options: {} })

				expect(calls).toEqual(['validate', 'create', 'review'])
			})
		})

		describe('diagnostic information', () => {
			beforeEach(() => {
				vi.mocked(mockEnhancementService.validateDescription).mockReturnValue(true)
				vi.mocked(mockEnhancementService.waitForReviewAndOpen).mockResolvedValue(undefined)
			})

			it('should include CLI version marker in issue body', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123',
				})

				await command.execute({ description: validDescription, options: {} })

				expect(mockEnhancementService.createEnhancedIssue).toHaveBeenCalledWith(
					validDescription,
					expect.stringContaining('<!-- CLI GENERATED FEEDBACK v'),
					'hatchbox-ai/hatchbox-cli',
					undefined
				)
			})

			it('should include diagnostic information in issue body', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123',
				})

				await command.execute({ description: validDescription, options: {} })

				const callArgs = vi.mocked(mockEnhancementService.createEnhancedIssue).mock.calls[0]
				const issueBody = callArgs[1]

				// Check for diagnostic section
				expect(issueBody).toContain('Diagnostic Information')
				expect(issueBody).toContain('CLI Version')
				expect(issueBody).toContain('Node.js Version')
				expect(issueBody).toContain('OS')
				expect(issueBody).toContain('OS Version')
				expect(issueBody).toContain('Architecture')
			})

			it('should include original description in issue body', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123',
				})

				await command.execute({ description: validDescription, options: {} })

				const callArgs = vi.mocked(mockEnhancementService.createEnhancedIssue).mock.calls[0]
				const issueBody = callArgs[1]

				expect(issueBody).toContain(validDescription)
			})

			it('should handle diagnostic gathering failures gracefully', async () => {
				vi.mocked(mockEnhancementService.createEnhancedIssue).mockResolvedValue({
					number: 123,
					url: 'https://github.com/hatchbox-ai/hatchbox-cli/issues/123',
				})

				// Even if diagnostics fail, the command should still succeed
				await expect(
					command.execute({ description: validDescription, options: {} })
				).resolves.toBe(123)
			})
		})
	})
})
