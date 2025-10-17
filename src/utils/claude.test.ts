import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { existsSync } from 'node:fs'
import { detectClaudeCli, getClaudeVersion, launchClaude, generateBranchName, launchClaudeInNewTerminalWindow } from './claude.js'

vi.mock('execa')
vi.mock('node:fs')
vi.mock('./logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

type MockExecaReturn = Partial<ExecaReturnValue<string>>

describe('claude utils', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('detectClaudeCli', () => {
		it('should return true when Claude CLI is found', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '/usr/local/bin/claude',
				exitCode: 0,
			} as MockExecaReturn)

			const result = await detectClaudeCli()

			expect(result).toBe(true)
			expect(execa).toHaveBeenCalledWith('command', ['-v', 'claude'], {
				shell: true,
				timeout: 5000,
			})
		})

		it('should return false when Claude CLI is not found', async () => {
			vi.mocked(execa).mockRejectedValueOnce({
				exitCode: 1,
				stderr: 'command not found',
			})

			const result = await detectClaudeCli()

			expect(result).toBe(false)
		})

		it('should return false when command times out', async () => {
			vi.mocked(execa).mockRejectedValueOnce({
				message: 'Timeout',
			})

			const result = await detectClaudeCli()

			expect(result).toBe(false)
		})
	})

	describe('getClaudeVersion', () => {
		it('should return version when Claude CLI is available', async () => {
			const version = '1.2.3'
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: version,
				exitCode: 0,
			} as MockExecaReturn)

			const result = await getClaudeVersion()

			expect(result).toBe(version)
			expect(execa).toHaveBeenCalledWith('claude', ['--version'], {
				timeout: 5000,
			})
		})

		it('should return null when Claude CLI is not available', async () => {
			vi.mocked(execa).mockRejectedValueOnce({
				exitCode: 1,
				stderr: 'command not found',
			})

			const result = await getClaudeVersion()

			expect(result).toBeNull()
		})

		it('should trim whitespace from version string', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '  1.2.3\n',
				exitCode: 0,
			} as MockExecaReturn)

			const result = await getClaudeVersion()

			expect(result).toBe('1.2.3')
		})
	})

	describe('launchClaude', () => {
		describe('headless mode', () => {
			it('should launch in headless mode and return output', async () => {
				const prompt = 'Generate a branch name'
				const output = 'feat/issue-123-new-feature'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: output,
					exitCode: 0,
				} as MockExecaReturn)

				const result = await launchClaude(prompt, { headless: true })

				expect(result).toBe(output)
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--add-dir', '/tmp'],
					expect.objectContaining({
						input: prompt,
						timeout: 0, // Disabled timeout
					})
				)
			})

			it('should include model flag when model is specified', async () => {
				const prompt = 'Test prompt'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: 'output',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: true,
					model: 'opus',
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--model', 'opus', '--add-dir', '/tmp'],
					expect.any(Object)
				)
			})

			it('should include permission mode when specified', async () => {
				const prompt = 'Test prompt'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: 'output',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: true,
					permissionMode: 'plan',
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--permission-mode', 'plan', '--add-dir', '/tmp'],
					expect.any(Object)
				)
			})

			it('should not include permission mode when set to default', async () => {
				const prompt = 'Test prompt'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: 'output',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: true,
					permissionMode: 'default',
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--add-dir', '/tmp'],
					expect.any(Object)
				)
			})

			it('should include add-dir flag when specified', async () => {
				const prompt = 'Test prompt'
				const workspacePath = '/path/to/workspace'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: 'output',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: true,
					addDir: workspacePath,
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--add-dir', workspacePath, '--add-dir', '/tmp'],
					expect.any(Object)
				)
			})

			it('should set cwd to addDir in headless mode when addDir is specified', async () => {
				const prompt = 'Test prompt'
				const workspacePath = '/path/to/workspace'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: 'output',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: true,
					addDir: workspacePath,
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--add-dir', workspacePath, '--add-dir', '/tmp'],
					expect.objectContaining({
						input: prompt,
						timeout: 0,
						cwd: workspacePath,
					})
				)
			})

			it('should not set cwd in headless mode when addDir is not specified', async () => {
				const prompt = 'Test prompt'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: 'output',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: true,
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--add-dir', '/tmp'],
					expect.objectContaining({
						input: prompt,
						timeout: 0,
					})
				)

				// Ensure cwd is not in the options
				const execaCall = vi.mocked(execa).mock.calls[0]
				expect(execaCall[2]).not.toHaveProperty('cwd')
			})

			it('should throw error with context when Claude CLI fails', async () => {
				const prompt = 'Test prompt'
				vi.mocked(execa).mockRejectedValueOnce({
					stderr: 'API error',
					message: 'Command failed',
					exitCode: 1,
				})

				await expect(launchClaude(prompt, { headless: true })).rejects.toThrow(
					'Claude CLI error: API error'
				)
			})

			it('should use message when stderr is not available', async () => {
				const prompt = 'Test prompt'
				vi.mocked(execa).mockRejectedValueOnce({
					message: 'Network timeout',
					exitCode: 1,
				})

				await expect(launchClaude(prompt, { headless: true })).rejects.toThrow(
					'Claude CLI error: Network timeout'
				)
			})
		})

		describe('interactive mode', () => {
			it('should launch in interactive mode in current terminal with stdio inherit', async () => {
				const prompt = 'Resolve conflicts'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				const result = await launchClaude(prompt, { headless: false })

				expect(result).toBeUndefined()
				// Interactive mode runs in current terminal with stdio: inherit
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--add-dir', '/tmp', '--', prompt],
					expect.objectContaining({
						stdio: 'inherit',
						timeout: 0
					})
				)
			})

			it('should include model and permission-mode flags in interactive mode', async () => {
				const prompt = 'Resolve conflicts'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					model: 'opus',
					permissionMode: 'plan',
					addDir: '/workspace',
				})

				// Interactive mode runs in current terminal with all flags
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--model', 'opus', '--permission-mode', 'plan', '--add-dir', '/workspace', '--add-dir', '/tmp', '--', prompt],
					expect.objectContaining({
						stdio: 'inherit'
					})
				)
			})

			it('should set cwd to addDir in interactive mode when addDir is specified', async () => {
				const prompt = 'Resolve conflicts'
				const workspacePath = '/path/to/workspace'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					addDir: workspacePath,
				})

				// Verify cwd is set to workspace path
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--add-dir', workspacePath, '--add-dir', '/tmp', '--', prompt],
					expect.objectContaining({
						cwd: workspacePath,
						stdio: 'inherit'
					})
				)
			})

			it('should not set cwd in interactive mode when addDir is not specified', async () => {
				const prompt = 'Resolve conflicts'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
				})

				// Verify cwd is not set
				const execaCall = vi.mocked(execa).mock.calls[0]
				expect(execaCall[2]).not.toHaveProperty('cwd')
			})

			it('should use simple -- prompt format for interactive mode when appendSystemPrompt not provided', async () => {
				const prompt = 'Resolve the merge conflicts'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
				})

				// Verify simple -- prompt format is used (NOT --append-system-prompt)
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--add-dir', '/tmp', '--', prompt],
					expect.objectContaining({
						stdio: 'inherit'
					})
				)
			})

			it('should handle branchName option without applying terminal colors', async () => {
				const prompt = 'Resolve conflicts'
				const branchName = 'feat/issue-123-test'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					branchName, // branchName is ignored in simple interactive mode
				})

				// Verify simple command without terminal window manipulation
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--add-dir', '/tmp', '--', prompt],
					expect.objectContaining({
						stdio: 'inherit'
					})
				)
			})
		})

		describe('appendSystemPrompt parameter', () => {
			it('should use --append-system-prompt flag when provided in interactive mode', async () => {
				const systemPrompt = 'You are a helpful assistant. Follow these steps...'
				const userPrompt = 'Go!'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(userPrompt, {
					headless: false,
					appendSystemPrompt: systemPrompt,
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--add-dir', '/tmp', '--append-system-prompt', systemPrompt, '--', userPrompt],
					expect.objectContaining({
						stdio: 'inherit',
						timeout: 0,
					})
				)
			})

			it('should include all flags with --append-system-prompt in correct order', async () => {
				const systemPrompt = 'System instructions'
				const userPrompt = 'Go!'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(userPrompt, {
					headless: false,
					model: 'claude-sonnet-4-20250514',
					permissionMode: 'acceptEdits',
					addDir: '/workspace',
					appendSystemPrompt: systemPrompt,
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					[
						'--model', 'claude-sonnet-4-20250514',
						'--permission-mode', 'acceptEdits',
						'--add-dir', '/workspace',
						'--add-dir', '/tmp',
						'--append-system-prompt', systemPrompt,
						'--', userPrompt
					],
					expect.objectContaining({
						stdio: 'inherit',
						timeout: 0,
						cwd: '/workspace',
					})
				)
			})

			it('should handle special characters in appendSystemPrompt via execa', async () => {
				const systemPrompt = 'Instructions with "quotes" and \'apostrophes\' and $variables'
				const userPrompt = 'Go!'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(userPrompt, {
					headless: false,
					appendSystemPrompt: systemPrompt,
				})

				// execa handles escaping automatically, so we just pass the raw string
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--add-dir', '/tmp', '--append-system-prompt', systemPrompt, '--', userPrompt],
					expect.any(Object)
				)
			})

			it('should work with appendSystemPrompt in headless mode', async () => {
				const systemPrompt = 'You are a branch name generator'
				const userPrompt = 'Generate branch name'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: 'feat/issue-123-test',
					exitCode: 0,
				} as MockExecaReturn)

				const result = await launchClaude(userPrompt, {
					headless: true,
					model: 'sonnet',
					appendSystemPrompt: systemPrompt,
				})

				expect(result).toBe('feat/issue-123-test')
				expect(execa).toHaveBeenCalledWith(
					'claude',
					[
						'-p',
						'--model', 'sonnet',
						'--add-dir', '/tmp',
						'--append-system-prompt', systemPrompt
					],
					expect.objectContaining({
						input: userPrompt,
						timeout: 0,
					})
				)
			})

			it('should still use simple format when appendSystemPrompt not provided', async () => {
				const prompt = 'Resolve conflicts'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
				})

				// Should use simple -- format without --append-system-prompt
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--add-dir', '/tmp', '--', prompt],
					expect.objectContaining({
						stdio: 'inherit',
					})
				)
			})
		})
	})

	describe('launchClaudeInNewTerminalWindow', () => {
		it('should open new terminal window with hb ignite command', async () => {
			const prompt = 'Work on this issue'
			const workspacePath = '/path/to/workspace'

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				exitCode: 0,
			} as MockExecaReturn)

			await launchClaudeInNewTerminalWindow(prompt, { workspacePath })

			// Verify osascript was called for terminal window with hb ignite command
			const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
			expect(applescript).toContain('hb ignite')
			expect(execa).toHaveBeenCalledWith(
				'osascript',
				['-e', expect.stringContaining('tell application "Terminal"')]
			)
		})

		it('should throw error when workspacePath not provided', async () => {
			const prompt = 'Test prompt'

			await expect(
				launchClaudeInNewTerminalWindow(prompt, {} as unknown as { workspacePath: string })
			).rejects.toThrow(/workspacePath.*required/i)
		})

		it('should apply branch-specific background color when branchName provided', async () => {
			const prompt = 'Work on this issue'
			const workspacePath = '/path/to/workspace'
			const branchName = 'feat/issue-123-test'

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				exitCode: 0,
			} as MockExecaReturn)

			await launchClaudeInNewTerminalWindow(prompt, { workspacePath, branchName })

			// Verify terminal window was opened with hb ignite
			const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
			expect(applescript).toContain('hb ignite')
			expect(execa).toHaveBeenCalledWith(
				'osascript',
				['-e', expect.stringContaining('tell application "Terminal"')]
			)
		})

		it('should include .env sourcing when .env file exists in workspace', async () => {
			const prompt = 'Work on this issue'
			const workspacePath = '/path/to/workspace'

			// Mock .env file exists
			vi.mocked(existsSync).mockReturnValue(true)
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				exitCode: 0,
			} as MockExecaReturn)

			await launchClaudeInNewTerminalWindow(prompt, { workspacePath })

			// Verify .env sourcing is included and hb ignite is used
			const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
			expect(applescript).toContain('source .env')
			expect(applescript).toContain('hb ignite')
			expect(existsSync).toHaveBeenCalledWith('/path/to/workspace/.env')
		})

		it('should not include .env sourcing when .env file does not exist', async () => {
			const prompt = 'Work on this issue'
			const workspacePath = '/path/to/workspace'

			// Mock .env file does not exist
			vi.mocked(existsSync).mockReturnValue(false)
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				exitCode: 0,
			} as MockExecaReturn)

			await launchClaudeInNewTerminalWindow(prompt, { workspacePath })

			// Verify .env sourcing is NOT included but hb ignite is used
			const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
			expect(applescript).not.toContain('source .env')
			expect(applescript).toContain('hb ignite')
		})

		it('should not build complex claude command with prompt', async () => {
			const prompt = "Fix the user's \"authentication\" issue"
			const workspacePath = '/path/to/workspace'

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				exitCode: 0,
			} as MockExecaReturn)

			await launchClaudeInNewTerminalWindow(prompt, { workspacePath })

			// Verify simple hb ignite command is used, not complex claude command with prompt
			const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
			expect(applescript).toContain('hb ignite')
			expect(applescript).not.toContain('--append-system-prompt')
			expect(applescript).not.toContain(prompt)
		})

		it('should use hb ignite instead of building claude command with args', async () => {
			const prompt = 'Work on this issue'
			const workspacePath = '/path/to/workspace'

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				exitCode: 0,
			} as MockExecaReturn)

			await launchClaudeInNewTerminalWindow(prompt, { workspacePath })

			// Verify hb ignite is used, not claude with model/permission args
			const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
			expect(applescript).toContain('hb ignite')
			expect(applescript).not.toContain('--model')
			expect(applescript).not.toContain('--permission-mode')
			expect(applescript).not.toContain('--add-dir')
		})
	})

	describe('generateBranchName', () => {
		it('should generate branch name using Claude when available', async () => {
			const issueTitle = 'Add user authentication'
			const issueNumber = 123

			// Mock Claude CLI detection
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '/usr/local/bin/claude',
				exitCode: 0,
			} as MockExecaReturn)

			// Mock Claude response with full branch name
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'feat/issue-123-user-authentication',
				exitCode: 0,
			} as MockExecaReturn)

			const result = await generateBranchName(issueTitle, issueNumber)

			expect(result).toBe('feat/issue-123-user-authentication')
			expect(execa).toHaveBeenCalledWith(
				'claude',
				['-p', '--model', 'sonnet', '--add-dir', '/tmp'],
				expect.objectContaining({
					input: expect.stringContaining(issueTitle),
				})
			)
		})

		it('should use fallback when Claude CLI is not available', async () => {
			const issueTitle = 'Add user authentication'
			const issueNumber = 123

			// Mock Claude CLI not found
			vi.mocked(execa).mockRejectedValueOnce({
				exitCode: 1,
			})

			const result = await generateBranchName(issueTitle, issueNumber)

			expect(result).toBe('feat/issue-123')
		})

		it('should use fallback when Claude returns invalid output', async () => {
			const issueTitle = 'Add user authentication'
			const issueNumber = 123

			// Mock Claude CLI detection
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '/usr/local/bin/claude',
				exitCode: 0,
			} as MockExecaReturn)

			// Mock Claude returning error message
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'API error: rate limit exceeded',
				exitCode: 0,
			} as MockExecaReturn)

			const result = await generateBranchName(issueTitle, issueNumber)

			expect(result).toBe('feat/issue-123')
		})

		it('should use fallback when Claude returns empty output', async () => {
			const issueTitle = 'Add user authentication'
			const issueNumber = 123

			// Mock Claude CLI detection
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '/usr/local/bin/claude',
				exitCode: 0,
			} as MockExecaReturn)

			// Mock Claude returning empty string
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				exitCode: 0,
			} as MockExecaReturn)

			const result = await generateBranchName(issueTitle, issueNumber)

			expect(result).toBe('feat/issue-123')
		})

		it('should accept valid branch name from Claude', async () => {
			const issueTitle = 'Fix bug'
			const issueNumber = 123

			// Mock Claude CLI detection
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '/usr/local/bin/claude',
				exitCode: 0,
			} as MockExecaReturn)

			// Mock Claude returning properly formatted branch
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'fix/issue-123-authentication-bug',
				exitCode: 0,
			} as MockExecaReturn)

			const result = await generateBranchName(issueTitle, issueNumber)

			expect(result).toBe('fix/issue-123-authentication-bug')
		})

		it('should reject invalid branch name format from Claude', async () => {
			const issueTitle = 'Add feature'
			const issueNumber = 456

			// Mock Claude CLI detection
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '/usr/local/bin/claude',
				exitCode: 0,
			} as MockExecaReturn)

			// Mock Claude returning invalid format (no prefix)
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'add-user-auth',
				exitCode: 0,
			} as MockExecaReturn)

			const result = await generateBranchName(issueTitle, issueNumber)

			expect(result).toBe('feat/issue-456')
		})

		it('should use fallback when Claude CLI throws error', async () => {
			const issueTitle = 'Add feature'
			const issueNumber = 456

			// Mock Claude CLI detection succeeds
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '/usr/local/bin/claude',
				exitCode: 0,
			} as MockExecaReturn)

			// Mock Claude execution fails
			vi.mocked(execa).mockRejectedValueOnce({
				stderr: 'Claude error',
				exitCode: 1,
			})

			const result = await generateBranchName(issueTitle, issueNumber)

			expect(result).toBe('feat/issue-456')
		})
	})
})
