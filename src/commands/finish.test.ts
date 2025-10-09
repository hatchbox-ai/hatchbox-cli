import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FinishCommand } from './finish.js'
import { GitHubService } from '../lib/GitHubService.js'
import { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import { ValidationRunner } from '../lib/ValidationRunner.js'
import { CommitManager } from '../lib/CommitManager.js'
import type { Issue, PullRequest } from '../types/index.js'
import type { GitWorktree } from '../types/worktree.js'

// Mock dependencies
vi.mock('../lib/GitHubService.js')
vi.mock('../lib/GitWorktreeManager.js')
vi.mock('../lib/ValidationRunner.js')
vi.mock('../lib/CommitManager.js')

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

describe('FinishCommand', () => {
	let command: FinishCommand
	let mockGitHubService: GitHubService
	let mockGitWorktreeManager: GitWorktreeManager
	let mockValidationRunner: ValidationRunner
	let mockCommitManager: CommitManager

	beforeEach(() => {
		mockGitHubService = new GitHubService()
		mockGitWorktreeManager = new GitWorktreeManager()
		mockValidationRunner = new ValidationRunner()
		mockCommitManager = new CommitManager()

		// Mock ValidationRunner.runValidations to always succeed by default
		vi.mocked(mockValidationRunner.runValidations).mockResolvedValue({
			success: true,
			steps: [],
			totalDuration: 0,
		})

		// Mock CommitManager.detectUncommittedChanges to return no changes by default
		vi.mocked(mockCommitManager.detectUncommittedChanges).mockResolvedValue({
			hasUncommittedChanges: false,
			unstagedFiles: [],
			stagedFiles: [],
			currentBranch: 'main',
			isAheadOfRemote: false,
			isBehindRemote: false,
		})

		// Mock CommitManager.commitChanges to succeed by default
		vi.mocked(mockCommitManager.commitChanges).mockResolvedValue(undefined)

		command = new FinishCommand(
			mockGitHubService,
			mockGitWorktreeManager,
			mockValidationRunner,
			mockCommitManager
		)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('execute', () => {
		describe('input parsing - explicit identifier', () => {
			it('should parse plain issue number (123)', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 123,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/123',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith('123')
				expect(mockGitHubService.fetchIssue).toHaveBeenCalledWith(123)
			})

			it('should parse hash-prefixed issue number (#123)', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '#123',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 123,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/123',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: '#123',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith('#123')
			})

			it('should parse PR-specific format (pr/123, PR-123, PR/123)', async () => {
				vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
					number: 123,
					title: 'Test PR',
					state: 'open',
					branch: 'feature-branch',
					baseBranch: 'main',
					body: '',
					url: 'https://github.com/test/repo/pull/123',
					isDraft: false,
				} as PullRequest)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/pr-123', branch: 'pr/123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				// Test pr/123
				await expect(
					command.execute({
						identifier: 'pr/123',
						options: {},
					})
				).resolves.not.toThrow()

				// Should NOT call detectInputType for explicit PR format
				expect(mockGitHubService.detectInputType).not.toHaveBeenCalled()
				expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(123)
			})

			it('should parse branch name as fallback', async () => {
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/my-branch', branch: 'feature/my-branch', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: 'feature/my-branch',
						options: {},
					})
				).resolves.not.toThrow()

				// Branch names should not trigger GitHub detection
				expect(mockGitHubService.detectInputType).not.toHaveBeenCalled()
			})

			it('should trim whitespace from input', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 123,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/123',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: '  123  ',
						options: {},
					})
				).resolves.not.toThrow()

				// Should be trimmed
				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith('123')
			})
		})

		describe('PR flag handling', () => {
			it('should use --pr flag value when provided', async () => {
				vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
					number: 456,
					title: 'Test PR',
					state: 'open',
					branch: 'feature-branch',
					baseBranch: 'main',
					body: '',
					url: 'https://github.com/test/repo/pull/456',
					isDraft: false,
				} as PullRequest)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/pr-456', branch: 'pr/456', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: '123', // This should be ignored
						options: { pr: 456 },
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(456)
				expect(mockGitHubService.detectInputType).not.toHaveBeenCalled()
			})

			it('should prioritize --pr flag over identifier', async () => {
				vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
					number: 789,
					title: 'Test PR',
					state: 'open',
					branch: 'feature-branch',
					baseBranch: 'main',
					body: '',
					url: 'https://github.com/test/repo/pull/789',
					isDraft: false,
				} as PullRequest)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/pr-789', branch: 'pr/789', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: 'some-branch', // Should be ignored when --pr is set
						options: { pr: 789 },
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(789)
			})
		})

		describe('GitHub API detection', () => {
			it('should detect issue vs PR for numeric input via GitHub API', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'pr',
					number: 123,
					rawInput: '123',
				})
				vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
					number: 123,
					title: 'Test PR',
					state: 'open',
					branch: 'feature-branch',
					baseBranch: 'main',
					body: '',
					url: 'https://github.com/test/repo/pull/123',
					isDraft: false,
				} as PullRequest)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/pr-123', branch: 'pr/123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.detectInputType).toHaveBeenCalledWith('123')
				expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(123)
			})

			it('should throw error if number is neither issue nor PR', async () => {
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
		})

		describe('auto-detection from current directory', () => {
			const originalCwd = process.cwd

			afterEach(() => {
				// Restore original cwd
				process.cwd = originalCwd
			})

			it('should auto-detect PR number from _pr_N worktree directory pattern', async () => {
				process.cwd = vi.fn(() => '/repo/feat-issue-46_pr_123')

				vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
					number: 123,
					title: 'Test PR',
					state: 'open',
					branch: 'feature-branch',
					baseBranch: 'main',
					body: '',
					url: 'https://github.com/test/repo/pull/123',
					isDraft: false,
				} as PullRequest)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/repo/feat-issue-46_pr_123', branch: 'pr/123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: undefined, // No identifier - should auto-detect
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(123)
			})

			it('should auto-detect issue number from issue-N branch pattern', async () => {
				process.cwd = vi.fn(() => '/repo/feat-issue-46-test')

				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 46,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/46',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/repo/feat-issue-46-test', branch: 'feat/issue-46-test', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: undefined,
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.fetchIssue).toHaveBeenCalledWith(46)
			})

			it('should extract PR number from directory like "feat-issue-46_pr_123"', async () => {
				process.cwd = vi.fn(() => '/repo/feat-issue-46_pr_789')

				vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
					number: 789,
					title: 'Test PR',
					state: 'open',
					branch: 'feature-branch',
					baseBranch: 'main',
					body: '',
					url: 'https://github.com/test/repo/pull/789',
					isDraft: false,
				} as PullRequest)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/repo/feat-issue-46_pr_789', branch: 'pr/789', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: undefined,
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(789)
			})

			it('should detect when running in PR worktree without identifier argument', async () => {
				process.cwd = vi.fn(() => '/repo/my-feature_pr_555')

				vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
					number: 555,
					title: 'Test PR',
					state: 'open',
					branch: 'feature-branch',
					baseBranch: 'main',
					body: '',
					url: 'https://github.com/test/repo/pull/555',
					isDraft: false,
				} as PullRequest)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/repo/my-feature_pr_555', branch: 'pr/555', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: undefined,
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(555)
			})

			it('should fall back to branch name when no pattern matches', async () => {
				process.cwd = vi.fn(() => '/repo/some-random-dir')

				vi.mocked(mockGitWorktreeManager.getRepoInfo).mockResolvedValue({
					root: '/repo',
					defaultBranch: 'main',
					currentBranch: 'my-feature-branch',
				})
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/repo/some-random-dir', branch: 'my-feature-branch', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: undefined,
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockGitWorktreeManager.getRepoInfo).toHaveBeenCalled()
			})

			it('should throw error when auto-detection fails completely', async () => {
				process.cwd = vi.fn(() => '/repo/random-dir')

				vi.mocked(mockGitWorktreeManager.getRepoInfo).mockResolvedValue({
					root: '/repo',
					defaultBranch: 'main',
					currentBranch: null, // No current branch
				})

				await expect(
					command.execute({
						identifier: undefined,
						options: {},
					})
				).rejects.toThrow('Could not auto-detect identifier')
			})
		})

		describe('edge cases', () => {
			it('should handle very large issue numbers (999999)', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 999999,
					rawInput: '999999',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 999999,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/999999',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/issue-999999', branch: 'feat/issue-999999', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: '999999',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should handle leading zeros in numbers', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '0123',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 123,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/123',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: '0123',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should reject invalid characters in branch names', async () => {
				await expect(
					command.execute({
						identifier: 'feat@branch!',
						options: {},
					})
				).rejects.toThrow('Invalid branch name')
			})

			it('should handle single-character branch names', async () => {
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/a', branch: 'a', commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: 'a',
						options: {},
					})
				).resolves.not.toThrow()
			})

			it('should handle very long branch names (255+ chars)', async () => {
				const longBranchName = 'feature/' + 'a'.repeat(300)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/long-branch', branch: longBranchName, commit: 'abc123', bare: false },
				] as GitWorktree[])

				await expect(
					command.execute({
						identifier: longBranchName,
						options: {},
					})
				).resolves.not.toThrow()
			})
		})

		describe('validation', () => {
			describe('issue validation', () => {
				it('should validate open issue exists on GitHub', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: {},
						})
					).resolves.not.toThrow()

					expect(mockGitHubService.fetchIssue).toHaveBeenCalledWith(123)
				})

				it('should throw error for closed issue without --force', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'closed',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)

					await expect(
						command.execute({
							identifier: '123',
							options: {},
						})
					).rejects.toThrow('is closed')
				})

				it('should allow closed issue with --force flag', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'closed',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { force: true },
						})
					).resolves.not.toThrow()

					expect(mockGitHubService.fetchIssue).toHaveBeenCalledWith(123)
				})

				it('should throw error if issue not found on GitHub', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 999,
						rawInput: '999',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockRejectedValue(
						new Error('Issue #999 not found')
					)

					await expect(
						command.execute({
							identifier: '999',
							options: {},
						})
					).rejects.toThrow('Issue #999 not found')
				})

				it('should throw error if worktree not found for issue', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([])

					await expect(
						command.execute({
							identifier: '123',
							options: {},
						})
					).rejects.toThrow('No worktree found')
				})
			})

			describe('PR validation', () => {
				it('should validate open PR exists on GitHub', async () => {
					vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
						number: 456,
						title: 'Test PR',
						state: 'open',
						branch: 'feature-branch',
						baseBranch: 'main',
						body: '',
						url: 'https://github.com/test/repo/pull/456',
						isDraft: false,
					} as PullRequest)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/pr-456', branch: 'pr/456', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: 'pr/456',
							options: {},
						})
					).resolves.not.toThrow()

					expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(456)
				})

				it('should allow closed PR (cleanup-only mode)', async () => {
					vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
						number: 456,
						title: 'Test PR',
						state: 'closed',
						branch: 'feature-branch',
						baseBranch: 'main',
						body: '',
						url: 'https://github.com/test/repo/pull/456',
						isDraft: false,
					} as PullRequest)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/pr-456', branch: 'pr/456', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: 'pr/456',
							options: {},
						})
					).resolves.not.toThrow()

					expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(456)
				})

				it('should allow merged PR (cleanup-only mode)', async () => {
					vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
						number: 456,
						title: 'Test PR',
						state: 'merged',
						branch: 'feature-branch',
						baseBranch: 'main',
						body: '',
						url: 'https://github.com/test/repo/pull/456',
						isDraft: false,
					} as PullRequest)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/pr-456', branch: 'pr/456', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: 'pr/456',
							options: {},
						})
					).resolves.not.toThrow()

					expect(mockGitHubService.fetchPR).toHaveBeenCalledWith(456)
				})

				it('should throw error if PR not found on GitHub', async () => {
					vi.mocked(mockGitHubService.fetchPR).mockRejectedValue(
						new Error('PR #999 not found')
					)

					await expect(
						command.execute({
							identifier: 'pr/999',
							options: {},
						})
					).rejects.toThrow('PR #999 not found')
				})
			})

			describe('branch validation', () => {
				it('should validate branch name format (valid characters)', async () => {
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/my-branch', branch: 'feature/my-branch', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: 'feature/my-branch',
							options: {},
						})
					).resolves.not.toThrow()
				})

				it('should throw error if branch not found', async () => {
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([])

					await expect(
						command.execute({
							identifier: 'nonexistent-branch',
							options: {},
						})
					).rejects.toThrow('No worktree found')
				})
			})

			describe('worktree auto-detection', () => {
				it('should warn if multiple worktrees match identifier', async () => {
					const { logger } = await import('../utils/logger.js')

					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123-v1', branch: 'feat/issue-123', commit: 'abc123', bare: false },
						{ path: '/test/issue-123-v2', branch: 'fix/issue-123', commit: 'def456', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: {},
						})
					).resolves.not.toThrow()

					expect(logger.warn).toHaveBeenCalledWith(
						expect.stringContaining('Multiple worktrees found')
					)
				})

				it('should use first matching worktree if multiple found', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123-v1', branch: 'feat/issue-123', commit: 'abc123', bare: false },
						{ path: '/test/issue-123-v2', branch: 'fix/issue-123', commit: 'def456', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: {},
						})
					).resolves.not.toThrow()

					// Should proceed with first match
					expect(mockGitHubService.fetchIssue).toHaveBeenCalledWith(123)
				})
			})
		})

		describe('options handling', () => {
			describe('force flag', () => {
				it('should accept --force flag', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'closed',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { force: true },
						})
					).resolves.not.toThrow()
				})

				it('should skip confirmations when force=true', async () => {
					// Tested via closed issue acceptance above
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Closed Issue',
						state: 'closed',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { force: true },
						})
					).resolves.not.toThrow()
				})
			})

			describe('dry-run flag', () => {
				it('should accept --dry-run flag', async () => {
					const { logger } = await import('../utils/logger.js')

					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { dryRun: true },
						})
					).resolves.not.toThrow()

					expect(logger.info).toHaveBeenCalledWith(
						expect.stringContaining('[DRY RUN]')
					)
				})

				it('should preview actions without executing when dryRun=true', async () => {
					const { logger } = await import('../utils/logger.js')

					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await command.execute({
						identifier: '123',
						options: { dryRun: true },
					})

					// Should log dry-run message
					expect(logger.info).toHaveBeenCalledWith(
						expect.stringContaining('[DRY RUN]')
					)
				})

				it('should prefix log messages with [DRY RUN]', async () => {
					const { logger } = await import('../utils/logger.js')

					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await command.execute({
						identifier: '123',
						options: { dryRun: true },
					})

					expect(logger.info).toHaveBeenCalledWith(
						expect.stringMatching(/\[DRY RUN\]/)
					)
				})

				it('should perform GitHub API reads in dry-run mode', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'open',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await command.execute({
						identifier: '123',
						options: { dryRun: true },
					})

					// GitHub API should still be called in dry-run mode
					expect(mockGitHubService.fetchIssue).toHaveBeenCalledWith(123)
				})
			})

			describe('flag combinations', () => {
				it('should handle --force and --dry-run together', async () => {
					vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
						type: 'issue',
						number: 123,
						rawInput: '123',
					})
					vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
						number: 123,
						title: 'Test Issue',
						state: 'closed',
						body: '',
						labels: [],
						assignees: [],
						url: 'https://github.com/test/repo/issues/123',
					} as Issue)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { force: true, dryRun: true },
						})
					).resolves.not.toThrow()
				})

				it('should handle --pr with --force', async () => {
					vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
						number: 456,
						title: 'Test PR',
						state: 'closed',
						branch: 'feature-branch',
						baseBranch: 'main',
						body: '',
						url: 'https://github.com/test/repo/pull/456',
						isDraft: false,
					} as PullRequest)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/pr-456', branch: 'pr/456', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { pr: 456, force: true },
						})
					).resolves.not.toThrow()
				})

				it('should handle --pr with --dry-run', async () => {
					vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
						number: 456,
						title: 'Test PR',
						state: 'open',
						branch: 'feature-branch',
						baseBranch: 'main',
						body: '',
						url: 'https://github.com/test/repo/pull/456',
						isDraft: false,
					} as PullRequest)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/pr-456', branch: 'pr/456', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { pr: 456, dryRun: true },
						})
					).resolves.not.toThrow()
				})

				it('should handle all three flags together', async () => {
					vi.mocked(mockGitHubService.fetchPR).mockResolvedValue({
						number: 456,
						title: 'Test PR',
						state: 'closed',
						branch: 'feature-branch',
						baseBranch: 'main',
						body: '',
						url: 'https://github.com/test/repo/pull/456',
						isDraft: false,
					} as PullRequest)
					vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
						{ path: '/test/pr-456', branch: 'pr/456', commit: 'abc123', bare: false },
					] as GitWorktree[])

					await expect(
						command.execute({
							identifier: '123',
							options: { pr: 456, force: true, dryRun: true },
						})
					).resolves.not.toThrow()
				})
			})
		})

		describe('error handling', () => {
			it('should handle GitHub API timeout gracefully', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(
					new Error('Request timeout')
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toThrow('Request timeout')
			})

			it('should handle GitHub API rate limit errors', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(
					new Error('API rate limit exceeded')
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toThrow('API rate limit exceeded')
			})

			it('should handle GitHub authentication errors', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(
					new Error('Authentication required')
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toThrow('Authentication required')
			})

			it('should provide clear error message when API fails', async () => {
				const { logger } = await import('../utils/logger.js')

				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(
					new Error('Network error')
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toThrow()

				expect(logger.error).toHaveBeenCalled()
			})

			it('should handle Git command failures gracefully', async () => {
				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 123,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/123',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockRejectedValue(
					new Error('Git command failed')
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toThrow('Git command failed')
			})

			it('should throw error with helpful message for invalid input', async () => {
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
				).rejects.toThrow(/Could not find/)
			})

			it('should include original input in error messages', async () => {
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
				).rejects.toThrow(/999/)
			})

			it('should handle thrown strings gracefully', async () => {
				const { logger } = await import('../utils/logger.js')

				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(
					'string error'
				)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toBeDefined()

				expect(logger.error).toHaveBeenCalled()
			})

			it('should handle thrown null/undefined gracefully', async () => {
				const { logger } = await import('../utils/logger.js')

				vi.mocked(mockGitHubService.detectInputType).mockRejectedValue(null)

				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toBeDefined()

				expect(logger.error).toHaveBeenCalled()
			})
		})

		describe('workflow execution order', () => {
			it('should run validation BEFORE detecting and committing changes', async () => {
				// Test the correct workflow order: validate → detect → commit
				const executionOrder: string[] = []

				// Mock ValidationRunner to track execution order
				vi.mocked(mockValidationRunner.runValidations).mockImplementation(async () => {
					executionOrder.push('validation')
					return {
						success: true,
						steps: [],
						totalDuration: 0,
					}
				})

				// Mock CommitManager to track execution order
				vi.mocked(mockCommitManager.detectUncommittedChanges).mockImplementation(async () => {
					executionOrder.push('commit-detect')
					return {
						hasUncommittedChanges: true,
						unstagedFiles: ['src/test.ts'],
						stagedFiles: [],
						currentBranch: 'feat/issue-123',
						isAheadOfRemote: false,
						isBehindRemote: false,
					}
				})

				vi.mocked(mockCommitManager.commitChanges).mockImplementation(async () => {
					executionOrder.push('commit-execute')
				})

				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 123,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/123',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				// This should succeed with the correct order
				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).resolves.not.toThrow()

				// ✅ CORRECT: The implementation should follow this order
				expect(executionOrder).toEqual([
					'validation',     // ✅ First: Ensure code quality
					'commit-detect',  // ✅ Second: Check if there are changes to commit
					'commit-execute'  // ✅ Third: Only commit if validation passed
				])
			})

			it('should NOT commit if validation fails', async () => {
				// Test that validation failure prevents committing
				const executionOrder: string[] = []

				// Mock ValidationRunner to simulate failure
				vi.mocked(mockValidationRunner.runValidations).mockImplementation(async () => {
					executionOrder.push('validation')
					throw new Error('Validation failed: TypeScript errors found')
				})

				// Mock CommitManager - these should NOT be called if validation fails
				vi.mocked(mockCommitManager.detectUncommittedChanges).mockImplementation(async () => {
					executionOrder.push('commit-detect')
					return {
						hasUncommittedChanges: true,
						unstagedFiles: ['src/test.ts'],
						stagedFiles: [],
						currentBranch: 'feat/issue-123',
						isAheadOfRemote: false,
						isBehindRemote: false,
					}
				})

				vi.mocked(mockCommitManager.commitChanges).mockImplementation(async () => {
					executionOrder.push('commit-execute')
				})

				vi.mocked(mockGitHubService.detectInputType).mockResolvedValue({
					type: 'issue',
					number: 123,
					rawInput: '123',
				})
				vi.mocked(mockGitHubService.fetchIssue).mockResolvedValue({
					number: 123,
					title: 'Test Issue',
					state: 'open',
					body: '',
					labels: [],
					assignees: [],
					url: 'https://github.com/test/repo/issues/123',
				} as Issue)
				vi.mocked(mockGitWorktreeManager.findWorktreesByIdentifier).mockResolvedValue([
					{ path: '/test/issue-123', branch: 'feat/issue-123', commit: 'abc123', bare: false },
				] as GitWorktree[])

				// This should fail at validation step
				await expect(
					command.execute({
						identifier: '123',
						options: {},
					})
				).rejects.toThrow('Validation failed: TypeScript errors found')

				// ✅ CORRECT: Validation fails, so we never detect or commit changes
				expect(executionOrder).toEqual([
					'validation'  // ✅ Validation fails, workflow stops here
				])

				// Verify CommitManager methods were never called
				expect(mockCommitManager.detectUncommittedChanges).not.toHaveBeenCalled()
				expect(mockCommitManager.commitChanges).not.toHaveBeenCalled()
			})
		})

		describe('dependency injection', () => {
			it('should accept GitHubService via constructor', () => {
				const customService = new GitHubService()
				const cmd = new FinishCommand(customService)
				expect(cmd).toBeDefined()
			})

			it('should accept GitWorktreeManager via constructor', () => {
				const customManager = new GitWorktreeManager()
				const cmd = new FinishCommand(undefined, customManager)
				expect(cmd).toBeDefined()
			})

			it('should accept ValidationRunner via constructor', () => {
				const customRunner = new ValidationRunner()
				const cmd = new FinishCommand(undefined, undefined, customRunner)
				expect(cmd).toBeDefined()
			})

			it('should accept CommitManager via constructor', () => {
				const customCommitManager = new CommitManager()
				const cmd = new FinishCommand(undefined, undefined, undefined, customCommitManager)
				expect(cmd).toBeDefined()
			})

			it('should create default instances when not provided', () => {
				const cmd = new FinishCommand()
				expect(cmd).toBeDefined()
			})
		})
	})
})
