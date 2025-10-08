import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { detectClaudeCli, getClaudeVersion, launchClaude, generateBranchName } from './claude.js'

vi.mock('execa')
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
					['-p', '--print'],
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
					model: 'claude-3-5-haiku-20241022',
				})

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['-p', '--print', '--model', 'claude-3-5-haiku-20241022'],
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
					['-p', '--print', '--permission-mode', 'plan'],
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
					['-p', '--print'],
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
					['-p', '--print', '--add-dir', workspacePath],
					expect.any(Object)
				)
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
				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--', prompt],
					expect.objectContaining({
						stdio: 'inherit',
						// No timeout in interactive mode anymore
					})
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

				expect(execa).toHaveBeenCalledWith(
					'claude',
					['--model', 'opusplan', '--permission-mode', 'plan', '--add-dir', '/workspace', '--', prompt],
					expect.objectContaining({
						stdio: 'inherit',
					})
				)
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
				['-p', '--print', '--model', 'claude-3-5-haiku-20241022'],
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
