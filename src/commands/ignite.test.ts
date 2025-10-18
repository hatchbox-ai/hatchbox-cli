import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IgniteCommand } from './ignite.js'
import type { PromptTemplateManager } from '../lib/PromptTemplateManager.js'
import type { GitWorktreeManager } from '../lib/GitWorktreeManager.js'
import * as claudeUtils from '../utils/claude.js'
import * as githubUtils from '../utils/github.js'

describe('IgniteCommand', () => {
	let command: IgniteCommand
	let mockTemplateManager: PromptTemplateManager
	let mockGitWorktreeManager: GitWorktreeManager

	beforeEach(() => {
		// Mock dependencies
		mockTemplateManager = {
			getPrompt: vi.fn().mockResolvedValue('mocked prompt content'),
		} as unknown as PromptTemplateManager

		mockGitWorktreeManager = {
			getRepoInfo: vi.fn().mockResolvedValue({
				currentBranch: 'feat/issue-70-test-branch',
			}),
		} as unknown as GitWorktreeManager

		// Create command with mocked dependencies
		command = new IgniteCommand(
			mockTemplateManager,
			mockGitWorktreeManager
		)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('Context Auto-Detection from Directory Name', () => {
		it('should detect issue workflow from directory name pattern: feat/issue-70-description', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			// Mock process.cwd() to return directory with issue- pattern
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-70-description')

			try {
				await command.execute()

				// Verify launchClaude was called with correct options
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String), // prompt
					expect.objectContaining({
						headless: false,
						addDir: '/path/to/feat/issue-70-description',
						model: 'claude-sonnet-4-20250514',
						permissionMode: 'acceptEdits',
					})
				)

				// Verify template manager was called with correct type and variables
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'issue',
					expect.objectContaining({
						WORKSPACE_PATH: '/path/to/feat/issue-70-description',
						ISSUE_NUMBER: 70,
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should detect PR workflow from directory name pattern: _pr_123', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			// Mock process.cwd() to return directory with _pr_ suffix
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feature-branch_pr_123')

			try {
				await command.execute()

				// Verify launchClaude was called with correct options (PR uses default model)
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String), // prompt
					expect.objectContaining({
						headless: false,
						addDir: '/path/to/feature-branch_pr_123',
						// PR workflow doesn't have model or permissionMode overrides
					})
				)

				// Verify template manager was called with PR type
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'pr',
					expect.objectContaining({
						WORKSPACE_PATH: '/path/to/feature-branch_pr_123',
						PR_NUMBER: 123,
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should detect issue workflow from git branch name when directory does not match', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			// Mock process.cwd() to return non-matching directory
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/some-worktree')

			// Mock git branch to return issue pattern
			mockGitWorktreeManager.getRepoInfo = vi.fn().mockResolvedValue({
				currentBranch: 'feat/issue-45-another-test',
			})

			try {
				await command.execute()

				// Verify launchClaude was called with correct options
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String),
					expect.objectContaining({
						headless: false,
						addDir: '/path/to/some-worktree',
						model: 'claude-sonnet-4-20250514',
						permissionMode: 'acceptEdits',
					})
				)

				// Verify template manager was called
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'issue',
					expect.objectContaining({
						ISSUE_NUMBER: 45,
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should fallback to regular workflow when no patterns match', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			// Mock process.cwd() to return non-matching directory
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/main')

			// Mock git branch to return non-matching branch
			mockGitWorktreeManager.getRepoInfo = vi.fn().mockResolvedValue({
				currentBranch: 'main',
			})

			try {
				await command.execute()

				// Verify launchClaude was called (regular workflow uses defaults)
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String),
					expect.objectContaining({
						headless: false,
						addDir: '/path/to/main',
						// Regular workflow doesn't override model or permissionMode
					})
				)

				// Verify template manager was called with regular type
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'regular',
					expect.objectContaining({
						WORKSPACE_PATH: '/path/to/main',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should read PORT from environment variables', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			// Mock environment variable
			const originalEnv = process.env.PORT
			process.env.PORT = '3070'

			// Mock process.cwd()
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-99-port-test')

			try {
				await command.execute()

				// Verify template manager was called with PORT
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'issue',
					expect.objectContaining({
						PORT: 3070,
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
				if (originalEnv !== undefined) {
					process.env.PORT = originalEnv
				} else {
					delete process.env.PORT
				}
			}
		})

		it('should handle missing PORT environment variable gracefully', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			// Ensure PORT is not set
			const originalEnv = process.env.PORT
			delete process.env.PORT

			// Mock process.cwd()
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-88-no-port')

			try {
				await command.execute()

				// Verify template manager was called without PORT
				const templateCall = vi.mocked(mockTemplateManager.getPrompt).mock.calls[0]
				expect(templateCall[0]).toBe('issue')
				expect(templateCall[1].PORT).toBeUndefined()
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
				if (originalEnv !== undefined) {
					process.env.PORT = originalEnv
				}
			}
		})
	})

	describe('Claude CLI Launch Configuration', () => {
		it('should use correct workflow type and model/permission settings', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-50-test')

			try {
				await command.execute()

				// Verify launchClaude was called with issue workflow settings
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String),
					expect.objectContaining({
						headless: false,
						model: 'claude-sonnet-4-20250514',
						permissionMode: 'acceptEdits',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should pass workspace directory as addDir', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const workspacePath = '/workspace/feat/issue-42-workspace'
			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue(workspacePath)

			try {
				await command.execute()

				// Verify addDir is passed correctly
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String),
					expect.objectContaining({
						addDir: workspacePath,
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should include branch name in Claude options', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-33-branch-test')

			mockGitWorktreeManager.getRepoInfo = vi.fn().mockResolvedValue({
				currentBranch: 'feat/issue-33-branch-test',
			})

			try {
				await command.execute()

				// Verify branchName is included
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String),
					expect.objectContaining({
						branchName: 'feat/issue-33-branch-test',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})
	})

	describe('Error Handling', () => {
		it('should handle git command failures gracefully', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			// Mock git failure
			mockGitWorktreeManager.getRepoInfo = vi
				.fn()
				.mockRejectedValue(new Error('Not a git repository'))

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/non-git-dir')

			try {
				await command.execute()

				// Should fallback to regular workflow
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'regular',
					expect.objectContaining({
						WORKSPACE_PATH: '/path/to/non-git-dir',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should propagate Claude launch errors', async () => {
			// Spy on launchClaude and make it fail
			const launchClaudeSpy = vi
				.spyOn(claudeUtils, 'launchClaude')
				.mockRejectedValue(new Error('Claude CLI not found'))

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/workspace')

			try {
				await expect(command.execute()).rejects.toThrow('Claude CLI not found')
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})
	})

	describe('Terminal Behavior - Expected behavior for hb ignite', () => {
		it('should call launchClaude directly with stdio inherit, not open new terminal window', async () => {
			// EXPECTED BEHAVIOR for hb ignite:
			// 1. Detect workspace context (issue/PR/regular)
			// 2. Get prompt template with variable substitution
			// 3. Call launchClaude() utility directly with:
			//    - headless: false (to enable stdio: 'inherit')
			//    - model: appropriate for workflow type (e.g., 'claude-sonnet-4-20250514' for issues)
			//    - permissionMode: appropriate for workflow type (e.g., 'acceptEdits' for issues)
			//    - addDir: workspace path
			//
			// This will make Claude run in the CURRENT terminal, not open a new window
			//
			// CURRENT INCORRECT BEHAVIOR:
			// Currently calls ClaudeService.launchForWorkflow() with headless: false
			// which routes to launchClaudeInNewTerminalWindow(), opening a NEW terminal
			//
			// WHY THIS TEST WILL FAIL:
			// The current implementation in IgniteCommand.execute() calls:
			//   await this.claudeService.launchForWorkflow(context)
			// which with headless: false goes to launchClaudeInNewTerminalWindow()
			//
			// WHAT NEEDS TO CHANGE:
			// IgniteCommand should bypass launchForWorkflow and call launchClaude directly

			// Spy on the launchClaude utility function
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude')
			const launchClaudeInNewTerminalWindowSpy = vi.spyOn(claudeUtils, 'launchClaudeInNewTerminalWindow')

			launchClaudeSpy.mockResolvedValue(undefined)
			launchClaudeInNewTerminalWindowSpy.mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-50-terminal-test')

			try {
				await command.execute()

				// EXPECTED: launchClaude should be called with headless: false and stdio: 'inherit'
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					expect.any(String), // prompt
					expect.objectContaining({
						headless: false,
						addDir: '/path/to/feat/issue-50-terminal-test',
						model: 'claude-sonnet-4-20250514', // issue workflow model
						permissionMode: 'acceptEdits', // issue workflow permission mode
					})
				)

				// EXPECTED: launchClaudeInNewTerminalWindow should NOT be called
				expect(launchClaudeInNewTerminalWindowSpy).not.toHaveBeenCalled()

				// This test will FAIL because:
				// 1. launchClaude is NOT called (current implementation doesn't call it)
				// 2. launchClaudeInNewTerminalWindow IS called (via launchForWorkflow)
				//
				// To verify the current behavior, uncomment these lines:
				// expect(launchClaudeSpy).not.toHaveBeenCalled() // passes - launchClaude NOT called
				// expect(launchClaudeInNewTerminalWindowSpy).toHaveBeenCalled() // passes - new terminal opened
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
				launchClaudeInNewTerminalWindowSpy.mockRestore()
			}
		})
	})

	describe('Edge Cases', () => {
		it('should handle directory names with multiple issue patterns (use first match)', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/issue-10-and-issue-20-combined')

			try {
				await command.execute()

				// Should detect first issue number
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'issue',
					expect.objectContaining({
						ISSUE_NUMBER: 10,
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should prioritize directory pattern over branch pattern', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-100-dir')

			// Branch has different issue number
			mockGitWorktreeManager.getRepoInfo = vi.fn().mockResolvedValue({
				currentBranch: 'feat/issue-200-branch',
			})

			try {
				await command.execute()

				// Should use directory pattern (100), not branch (200)
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'issue',
					expect.objectContaining({
						ISSUE_NUMBER: 100,
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should handle branch name with no current branch', async () => {
			// Spy on launchClaude
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/workspace')

			// Mock getRepoInfo to return null branch
			mockGitWorktreeManager.getRepoInfo = vi.fn().mockResolvedValue({
				currentBranch: null,
			})

			try {
				await command.execute()

				// Should fallback to regular workflow
				expect(mockTemplateManager.getPrompt).toHaveBeenCalledWith(
					'regular',
					expect.objectContaining({
						WORKSPACE_PATH: '/path/to/workspace',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})
	})

	describe('appendSystemPrompt usage in hb ignite', () => {
		it('should pass template content as appendSystemPrompt for issue workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-82-test')

			// Mock template manager to return known content
			mockTemplateManager.getPrompt = vi.fn().mockResolvedValue('System instructions for issue workflow')

			try {
				await command.execute()

				// Verify launchClaude was called with appendSystemPrompt
				expect(launchClaudeSpy).toHaveBeenCalledWith(
					'Go!', // User prompt should be "Go!"
					expect.objectContaining({
						headless: false,
						model: 'claude-sonnet-4-20250514',
						permissionMode: 'acceptEdits',
						appendSystemPrompt: 'System instructions for issue workflow',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should pass template content as appendSystemPrompt for PR workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feature_pr_123')

			mockTemplateManager.getPrompt = vi.fn().mockResolvedValue('System instructions for PR workflow')

			try {
				await command.execute()

				expect(launchClaudeSpy).toHaveBeenCalledWith(
					'Go!',
					expect.objectContaining({
						headless: false,
						appendSystemPrompt: 'System instructions for PR workflow',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should pass template content as appendSystemPrompt for regular workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/main')

			mockGitWorktreeManager.getRepoInfo = vi.fn().mockResolvedValue({
				currentBranch: 'main',
			})

			mockTemplateManager.getPrompt = vi.fn().mockResolvedValue('System instructions for regular workflow')

			try {
				await command.execute()

				expect(launchClaudeSpy).toHaveBeenCalledWith(
					'Go!',
					expect.objectContaining({
						headless: false,
						appendSystemPrompt: 'System instructions for regular workflow',
					})
				)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})
	})

	describe('MCP Configuration', () => {
		it('should generate MCP config for issue workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)
			const getRepoInfoSpy = vi.spyOn(githubUtils, 'getRepoInfo').mockResolvedValue({
				owner: 'testowner',
				name: 'testrepo',
			})

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-77-mcp-test')

			try {
				await command.execute()

				// Verify launchClaude was called with mcpConfig
				const launchClaudeCall = launchClaudeSpy.mock.calls[0]
				expect(launchClaudeCall[1]).toHaveProperty('mcpConfig')
				expect(launchClaudeCall[1].mcpConfig).toBeInstanceOf(Array)
				expect(launchClaudeCall[1].mcpConfig.length).toBeGreaterThan(0)

				// Verify MCP config structure
				const mcpConfig = launchClaudeCall[1].mcpConfig[0]
				expect(mcpConfig).toHaveProperty('mcpServers')
				expect(mcpConfig.mcpServers).toHaveProperty('github_comment')
				expect(mcpConfig.mcpServers.github_comment).toHaveProperty('command')
				expect(mcpConfig.mcpServers.github_comment).toHaveProperty('args')
				expect(mcpConfig.mcpServers.github_comment).toHaveProperty('env')
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
				getRepoInfoSpy.mockRestore()
			}
		})

		it('should generate MCP config for PR workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)
			const getRepoInfoSpy = vi.spyOn(githubUtils, 'getRepoInfo').mockResolvedValue({
				owner: 'testowner',
				name: 'testrepo',
			})

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feature_pr_456')

			try {
				await command.execute()

				// Verify launchClaude was called with mcpConfig
				const launchClaudeCall = launchClaudeSpy.mock.calls[0]
				expect(launchClaudeCall[1]).toHaveProperty('mcpConfig')
				expect(launchClaudeCall[1].mcpConfig).toBeInstanceOf(Array)
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
				getRepoInfoSpy.mockRestore()
			}
		})

		it('should NOT generate MCP config for regular workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/main')

			mockGitWorktreeManager.getRepoInfo = vi.fn().mockResolvedValue({
				currentBranch: 'main',
			})

			try {
				await command.execute()

				// Verify launchClaude was NOT called with mcpConfig
				const launchClaudeCall = launchClaudeSpy.mock.calls[0]
				expect(launchClaudeCall[1].mcpConfig).toBeUndefined()
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
			}
		})

		it('should include correct environment variables in MCP config for issue workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)
			const getRepoInfoSpy = vi.spyOn(githubUtils, 'getRepoInfo').mockResolvedValue({
				owner: 'testowner',
				name: 'testrepo',
			})

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feat/issue-88-env-test')

			try {
				await command.execute()

				const launchClaudeCall = launchClaudeSpy.mock.calls[0]
				const mcpConfig = launchClaudeCall[1].mcpConfig[0]
				const env = mcpConfig.mcpServers.github_comment.env

				expect(env).toHaveProperty('REPO_OWNER')
				expect(env).toHaveProperty('REPO_NAME')
				expect(env).toHaveProperty('GITHUB_EVENT_NAME', 'issues')
				expect(env).toHaveProperty('GITHUB_API_URL')
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
				getRepoInfoSpy.mockRestore()
			}
		})

		it('should include correct environment variables in MCP config for PR workflows', async () => {
			const launchClaudeSpy = vi.spyOn(claudeUtils, 'launchClaude').mockResolvedValue(undefined)
			const getRepoInfoSpy = vi.spyOn(githubUtils, 'getRepoInfo').mockResolvedValue({
				owner: 'testowner',
				name: 'testrepo',
			})

			const originalCwd = process.cwd
			process.cwd = vi.fn().mockReturnValue('/path/to/feature_pr_789')

			try {
				await command.execute()

				const launchClaudeCall = launchClaudeSpy.mock.calls[0]
				const mcpConfig = launchClaudeCall[1].mcpConfig[0]
				const env = mcpConfig.mcpServers.github_comment.env

				expect(env).toHaveProperty('GITHUB_EVENT_NAME', 'pull_request')
			} finally {
				process.cwd = originalCwd
				launchClaudeSpy.mockRestore()
				getRepoInfoSpy.mockRestore()
			}
		})
	})
})
