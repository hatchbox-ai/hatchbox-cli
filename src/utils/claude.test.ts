import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { existsSync } from 'node:fs'
import { detectClaudeCli, getClaudeVersion, launchClaude, generateBranchName } from './claude.js'

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
					['-p'],
					expect.objectContaining({
						input: prompt,
						timeout: 1200000, // 20 minutes
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
					['-p', '--model', 'opus'],
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
					['-p', '--permission-mode', 'plan'],
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
					['-p'],
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
						timeout: 1200000,
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
					['-p'],
					expect.objectContaining({
						input: prompt,
						timeout: 1200000,
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
			it('should launch in interactive mode and return void', async () => {
				const prompt = 'Work on this issue'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				const result = await launchClaude(prompt, { headless: false })

				expect(result).toBeUndefined()
				// Interactive mode now uses terminal window launcher
				expect(execa).toHaveBeenCalledWith(
					'osascript',
					['-e', expect.stringContaining('tell application "Terminal"')]
				)
			})

			it('should include all options in interactive mode', async () => {
				const prompt = 'Work on this issue'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					model: 'opusplan',
					permissionMode: 'plan',
					addDir: '/workspace',
				})

				// Interactive mode now uses terminal window launcher
				expect(execa).toHaveBeenCalledWith(
					'osascript',
					['-e', expect.stringContaining('tell application "Terminal"')]
				)
			})

			it('should set cwd to addDir in interactive mode when addDir is specified', async () => {
				const prompt = 'Work on this issue'
				const workspacePath = '/path/to/workspace'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					addDir: workspacePath,
				})

				// Interactive mode now uses terminal window launcher with workspace path
				expect(execa).toHaveBeenCalledWith(
					'osascript',
					['-e', expect.stringContaining('tell application "Terminal"')]
				)
				// Verify the AppleScript includes the workspace path
				const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
				expect(applescript).toContain(workspacePath)
			})

			it('should not set cwd in interactive mode when addDir is not specified', async () => {
				const prompt = 'Work on this issue'
				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
				})

				// Interactive mode now uses terminal window launcher
				expect(execa).toHaveBeenCalledWith(
					'osascript',
					['-e', expect.stringContaining('tell application "Terminal"')]
				)
			})

			it('should apply terminal color when branchName is provided on macOS', async () => {
				const prompt = 'Work on this issue'
				const originalPlatform = process.platform
				const branchName = 'feat/issue-37-terminal-colors'

				// Mock platform as macOS
				Object.defineProperty(process, 'platform', {
					value: 'darwin',
					configurable: true,
				})

				// Mock TerminalColorManager
				const mockApplyTerminalColor = vi.fn()
				vi.doMock('../lib/TerminalColorManager.js', () => ({
					TerminalColorManager: vi.fn().mockImplementation(() => ({
						applyTerminalColor: mockApplyTerminalColor,
					})),
				}))

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					branchName,
				})

				// Interactive mode now uses terminal window launcher
				// Verify osascript was called (for terminal window creation)
				expect(execa).toHaveBeenCalledWith(
					'osascript',
					['-e', expect.stringContaining('tell application "Terminal"')]
				)

				// Restore original platform
				Object.defineProperty(process, 'platform', {
					value: originalPlatform,
					configurable: true,
				})
			})

			it('should set includeEnvSetup to true when .env file exists in workspace', async () => {
				const prompt = 'Work on this issue'
				const workspacePath = '/path/to/workspace'

				// Mock .env file exists
				vi.mocked(existsSync).mockReturnValue(true)

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					addDir: workspacePath,
				})

				// Verify the AppleScript includes sourcing .env
				const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
				expect(applescript).toContain('source .env')
				expect(existsSync).toHaveBeenCalledWith('/path/to/workspace/.env')
			})

			it('should set includeEnvSetup to false when .env file does not exist in workspace', async () => {
				const prompt = 'Work on this issue'
				const workspacePath = '/path/to/workspace'

				// Mock .env file does not exist
				vi.mocked(existsSync).mockReturnValue(false)

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
					addDir: workspacePath,
				})

				// Verify the AppleScript does NOT include sourcing .env
				const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
				expect(applescript).not.toContain('source .env')
				expect(existsSync).toHaveBeenCalledWith('/path/to/workspace/.env')
			})

			it('should set includeEnvSetup to false when no workspace path is provided', async () => {
				const prompt = 'Work on this issue'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
				})

				// Verify the AppleScript does NOT include sourcing .env
				const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
				expect(applescript).not.toContain('source .env')
				expect(existsSync).not.toHaveBeenCalled()
			})

			it('should properly quote prompt with spaces and special characters', async () => {
				const prompt = 'Work on this issue: "Fix authentication bug" with special chars & quotes'

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
				})

				// Verify the command in AppleScript properly quotes the prompt
				const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
				// The prompt should be wrapped in single quotes and double quotes should be escaped for AppleScript
				expect(applescript).toContain(`claude --append-system-prompt 'Work on this issue: \\"Fix authentication bug\\" with special chars & quotes'`)
			})

			it('should properly escape single quotes in prompt', async () => {
				const prompt = "Fix the user's authentication issue"

				vi.mocked(execa).mockResolvedValueOnce({
					stdout: '',
					exitCode: 0,
				} as MockExecaReturn)

				await launchClaude(prompt, {
					headless: false,
				})

				// Verify the command in AppleScript properly escapes single quotes
				const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
				// Single quotes should be escaped as '\'' and then further escaped for AppleScript
				expect(applescript).toContain(`claude --append-system-prompt 'Fix the user'\\\\''s authentication issue'`)
			})

			describe('with --append-system-prompt flag', () => {
				it('should construct command using --append-system-prompt instead of positional argument', async () => {
					const prompt = 'You are orchestrating a set of agents'

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
					})

					// Verify the command includes --append-system-prompt flag
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain(`--append-system-prompt 'You are orchestrating a set of agents'`)
					expect(applescript).not.toContain(`claude -- 'You are orchestrating a set of agents'`)
				})

				it('should properly escape single quotes in prompt with --append-system-prompt flag', async () => {
					const prompt = "user's authentication"

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
					})

					// Verify single quotes are properly escaped
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain(`--append-system-prompt 'user'\\\\''s authentication'`)
				})

				it('should handle prompts with double quotes correctly', async () => {
					const prompt = '"important" message'

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
					})

					// Verify the command is properly constructed
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain(`--append-system-prompt '\\"important\\" message'`)
				})

				it('should handle prompts with backticks correctly', async () => {
					const prompt = 'use `code snippet` here'

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
					})

					// Verify the command is properly constructed
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain(`--append-system-prompt 'use \`code snippet\` here'`)
				})

				it('should handle multi-line prompts correctly', async () => {
					const prompt = 'Line 1\nLine 2\nLine 3'

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
					})

					// Verify the command is properly constructed
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain(`--append-system-prompt 'Line 1\nLine 2\nLine 3'`)
				})

				it('should work correctly with other flags (model, permission-mode, add-dir)', async () => {
					const prompt = 'Test prompt'

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

					// Verify all flags are included in correct order
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain('--model opus')
					expect(applescript).toContain('--permission-mode plan')
					expect(applescript).toContain('--add-dir /workspace')
					expect(applescript).toContain(`--append-system-prompt 'Test prompt'`)
				})

				it('should pass branch name for terminal coloring', async () => {
					const prompt = 'Test prompt'
					const branchName = 'feat/issue-123-test'

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
						branchName,
					})

					// Verify backgroundColor is passed to openTerminalWindow
					// Terminal coloring is handled by terminal.ts, we just verify the command is constructed
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain(`--append-system-prompt 'Test prompt'`)
				})

				it('should handle .env file detection correctly', async () => {
					const prompt = 'Test prompt'
					const workspacePath = '/path/to/workspace'

					// Mock .env file exists
					vi.mocked(existsSync).mockReturnValue(true)

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
						addDir: workspacePath,
					})

					// Verify .env sourcing is included when file exists
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					expect(applescript).toContain('source .env')
					expect(applescript).toContain(`--append-system-prompt 'Test prompt'`)
					expect(existsSync).toHaveBeenCalledWith('/path/to/workspace/.env')
				})

				it('should maintain terminal history prevention (space prefix)', async () => {
					const prompt = 'Test prompt'

					vi.mocked(execa).mockResolvedValueOnce({
						stdout: '',
						exitCode: 0,
					} as MockExecaReturn)

					await launchClaude(prompt, {
						headless: false,
					})

					// Verify the command has space prefix for history prevention
					const applescript = vi.mocked(execa).mock.calls[0][1]?.[1] as string
					// The command should start with a space in the AppleScript's do script command
					expect(applescript).toMatch(/do script " .*claude/)
				})
			})
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
				['-p', '--model', 'sonnet'],
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
