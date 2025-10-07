import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StartCommand } from './start.js'
import { GitHubService } from '../lib/GitHubService.js'

// Mock the GitHubService
vi.mock('../lib/GitHubService.js')

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

describe('StartCommand', () => {
	let command: StartCommand
	let mockGitHubService: GitHubService

	beforeEach(() => {
		mockGitHubService = new GitHubService()
		command = new StartCommand(mockGitHubService)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('execute', () => {
		describe('input parsing', () => {
			it('should parse plain number as GitHub entity (issue)', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith(
					'123'
				)
			})

			it('should parse plain number as GitHub entity (PR)', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'pr',
					number: 456,
					rawInput: '456',
				})

				await expect(
					command.execute({
						identifier: '456',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith(
					'456'
				)
			})

			it('should parse hash-prefixed number', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 456,
					rawInput: '#456',
				})

				await expect(
					command.execute({
						identifier: '#456',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith(
					'#456'
				)
			})

			it('should parse pr/123 format as PR without GitHub call', async () => {
				// PR-specific format should not trigger GitHub detection
				await expect(
					command.execute({
						identifier: 'pr/123',
						options: {},
					})
				).resolves.not.toThrow()

				// Should NOT call detectInputType for explicit PR format
				expect(
					mockGitHubService.detectInputType
				).not.toHaveBeenCalled()
			})

			it('should parse PR-456 format as PR without GitHub call', async () => {
				await expect(
					command.execute({
						identifier: 'PR-456',
						options: {},
					})
				).resolves.not.toThrow()

				expect(
					mockGitHubService.detectInputType
				).not.toHaveBeenCalled()
			})

			it('should parse PR/789 format (uppercase with slash)', async () => {
				await expect(
					command.execute({
						identifier: 'PR/789',
						options: {},
					})
				).resolves.not.toThrow()

				expect(
					mockGitHubService.detectInputType
				).not.toHaveBeenCalled()
			})

			it('should parse branch name', async () => {
				await expect(
					command.execute({
						identifier: 'feature/my-branch',
						options: {},
					})
				).resolves.not.toThrow()

				// Branch names should not trigger GitHub detection
				expect(
					mockGitHubService.detectInputType
				).not.toHaveBeenCalled()
			})

			it('should handle mixed case PR formats (Pr/123)', async () => {
				// The regex is case-insensitive for PR prefix
				await expect(
					command.execute({
						identifier: 'Pr-789',
						options: {},
					})
				).resolves.not.toThrow()
			})
		})

		describe('validation', () => {
			it('should reject empty identifier', async () => {
				await expect(
					command.execute({
						identifier: '',
						options: {},
					})
				).rejects.toThrow('Missing required argument: identifier')
			})

			it('should reject whitespace-only identifier', async () => {
				await expect(
					command.execute({
						identifier: '   ',
						options: {},
					})
				).rejects.toThrow('Missing required argument: identifier')
			})

			it('should reject invalid branch characters (special chars)', async () => {
				await expect(
					command.execute({
						identifier: 'feat@branch!',
						options: {},
					})
				).rejects.toThrow('Invalid branch name')
			})

			it('should reject invalid branch characters (spaces)', async () => {
				await expect(
					command.execute({
						identifier: 'my branch name',
						options: {},
					})
				).rejects.toThrow('Invalid branch name')
			})

			it('should reject when GitHub entity not found', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'unknown',
					number: null,
					rawInput: '999',
				})

				await expect(
					command.execute({
						identifier: '999',
						options: {},
					})
				).rejects.toThrow('Could not find issue or PR #999')
			})

			it('should accept valid branch names with slashes', async () => {
				await expect(
					command.execute({
						identifier: 'feature/user-auth',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should accept branch names with underscores', async () => {
				await expect(
					command.execute({
						identifier: 'fix_bug_123',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should accept branch names with hyphens', async () => {
				await expect(
					command.execute({
						identifier: 'feature-user-auth',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should accept branch names with mixed separators', async () => {
				await expect(
					command.execute({
						identifier: 'feature/user-auth_v2',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should accept alphanumeric branch names', async () => {
				await expect(
					command.execute({
						identifier: 'branch123',
						options: {},
					})
				).resolves.not.toThrow()
			})
		})

		describe('options handling', () => {
			it('should pass urgent option through', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})

				await expect(
					command.execute({
						identifier: '123',
						options: { urgent: true },
					})
				).resolves.not.toThrow()
			})

			it('should handle no-claude option', async () => {
				await expect(
					command.execute({
						identifier: 'fix/bug',
						options: { claude: false },
					})
				).resolves.not.toThrow()
			})

			it('should handle both options together', async () => {
				await expect(
					command.execute({
						identifier: 'feature/test',
						options: { urgent: true, claude: false },
					})
				).resolves.not.toThrow()
			})
		})

		describe('GitHub detection', () => {
			it('should detect PR when number is a PR', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'pr',
					number: 42,
					rawInput: '42',
				})

				await expect(
					command.execute({
						identifier: '42',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith(
					'42'
				)
			})

			it('should detect issue when number is an issue', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 24,
					rawInput: '24',
				})

				await expect(
					command.execute({
						identifier: '24',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith(
					'24'
				)
			})

			it('should handle leading zeros in numbers', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '0123',
				})

				await expect(
					command.execute({
						identifier: '0123',
						options: {},
					})
				).resolves.not.toThrow()

				// The number should be parsed as 123, not 0123
				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith(
					'0123'
				)
			})
		})

		describe('error handling', () => {
			it('should handle detection returning pr type with null number gracefully', async () => {
				// This edge case tests that even if GitHub detection returns pr with null number,
				// the command uses the fallback number from parsing
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'pr',
					number: null, // Edge case: PR type with null number
					rawInput: '999',
				})

				// Should NOT throw - it should use the parsed number (999) as fallback
				await expect(
					command.execute({
						identifier: '999',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should rethrow errors from GitHubService', async () => {
				const testError = new Error('GitHub API error')
				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(
					testError
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toThrow('GitHub API error')
			})

			it('should handle unknown errors gracefully', async () => {
				// Test non-Error object being thrown
				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(
					'string error'
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toBeDefined()
			})
		})

		describe('edge cases', () => {
			it('should handle very large issue numbers', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 999999,
					rawInput: '999999',
				})

				await expect(
					command.execute({
						identifier: '999999',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should handle single character branch names', async () => {
				await expect(
					command.execute({
						identifier: 'a',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should handle very long branch names', async () => {
				const longBranchName = 'feature/' + 'a'.repeat(100)
				await expect(
					command.execute({
						identifier: longBranchName,
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should handle branch names with numbers only', async () => {
				// Note: This will be treated as a branch name since it doesn't
				// match the strict PR format patterns
				await expect(
					command.execute({
						identifier: 'branch123test',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should differentiate between pr/123 (PR format) and pr-123 (branch name)', async () => {
				// pr/123 or PR-123 are PR formats
				await expect(
					command.execute({
						identifier: 'pr/123',
						options: {},
					})
				).resolves.not.toThrow()

				// But something like pr-abc-123 is a branch name
				await expect(
					command.execute({
						identifier: 'pr-abc-123',
						options: {},
					})
				).resolves.not.toThrow()
			})
		})

		describe('format detection priority', () => {
			it('should prioritize PR-specific format over numeric detection', async () => {
				// When using pr/123 format, it should NOT call GitHub detection
				await expect(
					command.execute({
						identifier: 'pr/123',
						options: {},
					})
				).resolves.not.toThrow()

				expect(
					mockGitHubService.detectInputType
				).not.toHaveBeenCalled()
			})

			it('should use GitHub detection for plain numbers', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith(
					'123'
				)
			})

			it('should treat non-PR-format, non-numeric input as branch', async () => {
				await expect(
					command.execute({
						identifier: 'my-feature',
						options: {},
					})
				).resolves.not.toThrow()

				expect(
					mockGitHubService.detectInputType
				).not.toHaveBeenCalled()
			})
		})
	})
})
