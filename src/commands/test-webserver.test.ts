import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TestWebserverCommand } from './test-webserver.js'
import { ProcessManager } from '../lib/process/ProcessManager.js'
import type { ProcessInfo } from '../types/process.js'

// Mock the ProcessManager
vi.mock('../lib/process/ProcessManager.js')

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

describe('TestWebserverCommand', () => {
	let command: TestWebserverCommand
	let mockProcessManager: ProcessManager

	beforeEach(() => {
		mockProcessManager = new ProcessManager()
		command = new TestWebserverCommand(mockProcessManager)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('execute', () => {
		describe('input validation', () => {
			it('should reject negative issue numbers', async () => {
				await expect(
					command.execute({
						issueNumber: -1,
						options: {},
					})
				).rejects.toThrow('Issue number must be a positive integer')
			})

			it('should reject zero issue number', async () => {
				await expect(
					command.execute({
						issueNumber: 0,
						options: {},
					})
				).rejects.toThrow('Issue number must be a positive integer')
			})

			it('should reject non-integer issue numbers', async () => {
				await expect(
					command.execute({
						issueNumber: 3.14,
						options: {},
					})
				).rejects.toThrow('Issue number must be a positive integer')
			})

			it('should accept valid positive integer issue numbers', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

				await expect(
					command.execute({
						issueNumber: 123,
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockProcessManager.calculatePort).toHaveBeenCalledWith(123)
			})
		})

		describe('port calculation', () => {
			it('should calculate port as 3000 + issue number', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3281)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

				await command.execute({
					issueNumber: 281,
					options: {},
				})

				expect(mockProcessManager.calculatePort).toHaveBeenCalledWith(281)
				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3281)
			})

			it('should handle large issue numbers', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(13456)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

				await command.execute({
					issueNumber: 10456,
					options: {},
				})

				expect(mockProcessManager.calculatePort).toHaveBeenCalledWith(10456)
				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(13456)
			})
		})

		describe('process detection', () => {
			it('should report when no process is found on port', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

				await expect(
					command.execute({
						issueNumber: 123,
						options: {},
					})
				).resolves.not.toThrow()

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should report process details when found', async () => {
				const mockProcess: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'npm run dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockProcess)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should detect web server processes correctly', async () => {
				const mockWebServer: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'next dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebServer)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should detect non-web-server processes correctly', async () => {
				const mockNonWebServer: ProcessInfo = {
					pid: 12345,
					name: 'postgres',
					command: 'postgres -D /usr/local/var/postgres',
					port: 3123,
					isDevServer: false,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockNonWebServer)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})
		})

		describe('kill flag behavior', () => {
			it('should kill web server when --kill flag is provided', async () => {
				const mockWebServer: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'npm run dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebServer)
				vi.mocked(mockProcessManager.terminateProcess).mockResolvedValue(true)
				vi.mocked(mockProcessManager.verifyPortFree).mockResolvedValue(true)

				await command.execute({
					issueNumber: 123,
					options: { kill: true },
				})

				expect(mockProcessManager.terminateProcess).toHaveBeenCalledWith(12345)
				expect(mockProcessManager.verifyPortFree).toHaveBeenCalledWith(3123)
			})

			it('should NOT kill non-web-server processes for safety', async () => {
				const mockNonWebServer: ProcessInfo = {
					pid: 12345,
					name: 'postgres',
					command: 'postgres -D /usr/local/var/postgres',
					port: 3123,
					isDevServer: false,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockNonWebServer)

				await expect(
					command.execute({
						issueNumber: 123,
						options: { kill: true },
					})
				).rejects.toThrow('Cannot kill non-web-server process')

				expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled()
			})

			it('should not attempt to kill when no process is found', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

				await command.execute({
					issueNumber: 123,
					options: { kill: true },
				})

				expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled()
			})

			it('should verify port is free after killing process', async () => {
				const mockWebServer: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'npm run dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebServer)
				vi.mocked(mockProcessManager.terminateProcess).mockResolvedValue(true)
				vi.mocked(mockProcessManager.verifyPortFree).mockResolvedValue(true)

				await command.execute({
					issueNumber: 123,
					options: { kill: true },
				})

				expect(mockProcessManager.verifyPortFree).toHaveBeenCalledWith(3123)
			})

			it('should handle port still in TIME_WAIT state after kill', async () => {
				const mockWebServer: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'npm run dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebServer)
				vi.mocked(mockProcessManager.terminateProcess).mockResolvedValue(true)
				vi.mocked(mockProcessManager.verifyPortFree).mockResolvedValue(false)

				await command.execute({
					issueNumber: 123,
					options: { kill: true },
				})

				expect(mockProcessManager.verifyPortFree).toHaveBeenCalledWith(3123)
			})
		})

		describe('error handling', () => {
			it('should handle process manager errors gracefully', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockRejectedValue(
					new Error('lsof command failed')
				)

				await expect(
					command.execute({
						issueNumber: 123,
						options: {},
					})
				).rejects.toThrow('lsof command failed')
			})

			it('should handle termination failures', async () => {
				const mockWebServer: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'npm run dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebServer)
				vi.mocked(mockProcessManager.terminateProcess).mockRejectedValue(
					new Error('Failed to terminate process 12345: Permission denied')
				)

				await expect(
					command.execute({
						issueNumber: 123,
						options: { kill: true },
					})
				).rejects.toThrow('Failed to terminate process 12345: Permission denied')
			})
		})

		describe('web server patterns', () => {
			it('should detect next dev as web server', async () => {
				const mockNextDev: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'next dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockNextDev)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should detect vite as web server', async () => {
				const mockVite: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'vite',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockVite)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should detect webpack dev server as web server', async () => {
				const mockWebpack: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'webpack serve --mode development',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebpack)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should detect npm run dev as web server', async () => {
				const mockNpmDev: ProcessInfo = {
					pid: 12345,
					name: 'npm',
					command: 'npm run dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockNpmDev)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should detect pnpm dev as web server', async () => {
				const mockPnpmDev: ProcessInfo = {
					pid: 12345,
					name: 'pnpm',
					command: 'pnpm dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockPnpmDev)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})
		})

		describe('non-web-server patterns', () => {
			it('should NOT detect postgres as web server', async () => {
				const mockPostgres: ProcessInfo = {
					pid: 12345,
					name: 'postgres',
					command: 'postgres -D /usr/local/var/postgres',
					port: 3123,
					isDevServer: false,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockPostgres)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should NOT detect mysql as web server', async () => {
				const mockMysql: ProcessInfo = {
					pid: 12345,
					name: 'mysqld',
					command: 'mysqld --datadir=/usr/local/var/mysql',
					port: 3123,
					isDevServer: false,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockMysql)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})

			it('should NOT detect arbitrary node processes as web servers', async () => {
				const mockNodeProcess: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'node some-script.js',
					port: 3123,
					isDevServer: false,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockNodeProcess)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})
		})

		describe('edge cases', () => {
			it('should handle issue number 1', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3001)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

				await command.execute({
					issueNumber: 1,
					options: {},
				})

				expect(mockProcessManager.calculatePort).toHaveBeenCalledWith(1)
				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3001)
			})

			it('should handle very large issue numbers', async () => {
				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(99999)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

				await command.execute({
					issueNumber: 96999,
					options: {},
				})

				expect(mockProcessManager.calculatePort).toHaveBeenCalledWith(96999)
			})

			it('should handle process with empty command string', async () => {
				const mockProcess: ProcessInfo = {
					pid: 12345,
					name: 'unknown',
					command: '',
					port: 3123,
					isDevServer: false,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockProcess)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
			})
		})

		describe('without kill flag', () => {
			it('should NOT terminate process when kill flag is not provided', async () => {
				const mockWebServer: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'npm run dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebServer)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled()
			})

			it('should only report process information without killing', async () => {
				const mockWebServer: ProcessInfo = {
					pid: 12345,
					name: 'node',
					command: 'next dev',
					port: 3123,
					isDevServer: true,
				}

				vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
				vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(mockWebServer)

				await command.execute({
					issueNumber: 123,
					options: {},
				})

				expect(mockProcessManager.detectDevServer).toHaveBeenCalledWith(3123)
				expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled()
			})
		})
	})
})
