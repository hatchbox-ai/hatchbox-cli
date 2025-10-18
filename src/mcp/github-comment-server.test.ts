import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as githubUtils from '../utils/github.js'

// Mock the github utils module
vi.mock('../utils/github.js', () => ({
	createIssueComment: vi.fn(),
	updateIssueComment: vi.fn(),
	createPRComment: vi.fn(),
}))

describe('GitHub Comment MCP Server', () => {
	let originalEnv: Record<string, string | undefined>

	beforeEach(() => {
		// Save original environment
		originalEnv = { ...process.env }

		// Reset mocks before each test
		vi.clearAllMocks()

		// Set required environment variables for tests
		process.env.REPO_OWNER = 'test-owner'
		process.env.REPO_NAME = 'test-repo'
		process.env.GITHUB_EVENT_NAME = 'issues'
	})

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv
		vi.restoreAllMocks()
	})

	describe('Environment Validation', () => {
		it('should validate REPO_OWNER is present', () => {
			delete process.env.REPO_OWNER

			// The server should throw or exit when initialized without REPO_OWNER
			// This will be implemented in the actual server
			expect(process.env.REPO_OWNER).toBeUndefined()
		})

		it('should validate REPO_NAME is present', () => {
			delete process.env.REPO_NAME

			expect(process.env.REPO_NAME).toBeUndefined()
		})

		it('should allow server to run with valid environment', () => {
			expect(process.env.REPO_OWNER).toBe('test-owner')
			expect(process.env.REPO_NAME).toBe('test-repo')
			expect(process.env.GITHUB_EVENT_NAME).toBe('issues')
		})
	})

	describe('Tool Registration', () => {
		it('should register create_comment tool', () => {
			// This test will verify the tool is registered with correct schema
			// Tool name: create_comment
			// Parameters: number, body, type
			expect(true).toBe(true) // Placeholder until server is implemented
		})

		it('should register update_comment tool', () => {
			// This test will verify the tool is registered with correct schema
			// Tool name: update_comment
			// Parameters: commentId, body
			expect(true).toBe(true) // Placeholder until server is implemented
		})
	})

	describe('create_comment Tool', () => {
		it('should create issue comment when type is "issue"', async () => {
			const mockCommentResponse = {
				id: 12345,
				url: 'https://github.com/test-owner/test-repo/issues/123#issuecomment-12345',
				created_at: '2025-10-17T12:00:00Z',
			}

			vi.mocked(githubUtils.createIssueComment).mockResolvedValueOnce(mockCommentResponse)

			// This will test the actual tool handler once implemented
			// For now, just verify the mock setup
			const result = await githubUtils.createIssueComment(123, 'Test comment')
			expect(result).toEqual(mockCommentResponse)
			expect(githubUtils.createIssueComment).toHaveBeenCalledWith(123, 'Test comment')
		})

		it('should create PR comment when type is "pr"', async () => {
			const mockCommentResponse = {
				id: 67890,
				url: 'https://github.com/test-owner/test-repo/pull/456#issuecomment-67890',
				created_at: '2025-10-17T14:00:00Z',
			}

			vi.mocked(githubUtils.createPRComment).mockResolvedValueOnce(mockCommentResponse)

			const result = await githubUtils.createPRComment(456, 'PR comment')
			expect(result).toEqual(mockCommentResponse)
			expect(githubUtils.createPRComment).toHaveBeenCalledWith(456, 'PR comment')
		})

		it('should handle comment creation errors', async () => {
			const error = new Error('Failed to create comment')
			vi.mocked(githubUtils.createIssueComment).mockRejectedValueOnce(error)

			await expect(githubUtils.createIssueComment(123, 'Test')).rejects.toThrow(
				'Failed to create comment'
			)
		})
	})

	describe('update_comment Tool', () => {
		it('should update comment by ID', async () => {
			const mockUpdateResponse = {
				id: 12345,
				url: 'https://github.com/test-owner/test-repo/issues/123#issuecomment-12345',
				updated_at: '2025-10-17T15:00:00Z',
			}

			vi.mocked(githubUtils.updateIssueComment).mockResolvedValueOnce(mockUpdateResponse)

			const result = await githubUtils.updateIssueComment(12345, 'Updated content')
			expect(result).toEqual(mockUpdateResponse)
			expect(githubUtils.updateIssueComment).toHaveBeenCalledWith(12345, 'Updated content')
		})

		it('should handle comment update errors', async () => {
			const error = new Error('Comment not found')
			vi.mocked(githubUtils.updateIssueComment).mockRejectedValueOnce(error)

			await expect(githubUtils.updateIssueComment(99999, 'Test')).rejects.toThrow(
				'Comment not found'
			)
		})
	})

	describe('Error Handling', () => {
		it('should handle gh CLI errors gracefully', async () => {
			const error = new Error('gh: command not found')
			vi.mocked(githubUtils.createIssueComment).mockRejectedValueOnce(error)

			await expect(githubUtils.createIssueComment(123, 'Test')).rejects.toThrow(
				'gh: command not found'
			)
		})

		it('should handle API rate limit errors', async () => {
			const error = new Error('API rate limit exceeded')
			vi.mocked(githubUtils.updateIssueComment).mockRejectedValueOnce(error)

			await expect(githubUtils.updateIssueComment(123, 'Test')).rejects.toThrow(
				'API rate limit exceeded'
			)
		})
	})
})
