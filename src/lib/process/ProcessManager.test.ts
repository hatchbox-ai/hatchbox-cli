import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProcessManager } from './ProcessManager.js'
import { execa, type ExecaReturnValue } from 'execa'

// Mock execa
vi.mock('execa')

// Helper to create mock execa result
function mockExecaResult(stdout: string, stderr: string = ''): Partial<ExecaReturnValue> {
	return {
		stdout,
		stderr,
		exitCode: 0,
		command: 'mock command',
		escapedCommand: 'mock command',
		failed: false,
		timedOut: false,
		isCanceled: false,
		killed: false,
	}
}

describe('ProcessManager', () => {
	let processManager: ProcessManager

	beforeEach(() => {
		processManager = new ProcessManager()
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('detectDevServer', () => {
		it('should detect Node.js dev server on specified port', async () => {
			// Mock lsof output showing node process listening on port
			vi.mocked(execa).mockResolvedValueOnce(
				mockExecaResult('node      12345 user   23u  IPv4 0x123  0t0  TCP *:3025 (LISTEN)') as ExecaReturnValue
			)

			// Mock ps output showing dev command
			vi.mocked(execa).mockResolvedValueOnce(
				mockExecaResult('node /app/node_modules/.bin/next dev') as ExecaReturnValue
			)

			const result = await processManager.detectDevServer(3025)

			expect(result).not.toBeNull()
			expect(result?.pid).toBe(12345)
			expect(result?.name).toBe('node')
			expect(result?.isDevServer).toBe(true)
			expect(result?.port).toBe(3025)
		})

		it('should detect pnpm dev server on specified port', async () => {
			// Mock lsof output showing pnpm process
			vi.mocked(execa).mockResolvedValueOnce(
				mockExecaResult('pnpm      54321 user   23u  IPv4 0x456  0t0  TCP *:3030 (LISTEN)') as ExecaReturnValue
			)

			// Mock ps output showing pnpm dev command
			vi.mocked(execa).mockResolvedValueOnce(
				mockExecaResult('pnpm dev') as ExecaReturnValue
			)

			const result = await processManager.detectDevServer(3030)

			expect(result).not.toBeNull()
			expect(result?.pid).toBe(54321)
			expect(result?.name).toBe('pnpm')
			expect(result?.isDevServer).toBe(true)
		})

		it('should return null when no process is listening on port', async () => {
			// Mock lsof returning no results
			vi.mocked(execa).mockResolvedValueOnce(
				mockExecaResult('') as ExecaReturnValue
			)

			const result = await processManager.detectDevServer(3040)

			expect(result).toBeNull()
		})

		it('should return null when process is not a dev server (e.g., database)', async () => {
			// Mock lsof showing postgres process
			vi.mocked(execa).mockResolvedValueOnce(
				mockExecaResult('postgres  99999 user   23u  IPv4 0x789  0t0  TCP *:5432 (LISTEN)') as ExecaReturnValue
			)

			// Mock ps output showing postgres command
			vi.mocked(execa).mockResolvedValueOnce(
				mockExecaResult('postgres: iloom iloom [local] idle') as ExecaReturnValue
			)

			const result = await processManager.detectDevServer(5432)

			expect(result).not.toBeNull()
			expect(result?.isDevServer).toBe(false)
		})

		it('should correctly parse process information from lsof output', async () => {
			// Mock lsof with multiple lines, should parse first LISTEN line
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: `COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 user   23u  IPv4 0x123456      0t0  TCP *:3025 (LISTEN)`,
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node server.js',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.detectDevServer(3025)

			expect(result).not.toBeNull()
			expect(result?.pid).toBe(12345)
			expect(result?.name).toBe('node')
		})

		it('should handle lsof command errors gracefully', async () => {
			// Mock lsof throwing error (e.g., no process found)
			vi.mocked(execa).mockRejectedValueOnce(new Error('lsof error'))

			const result = await processManager.detectDevServer(3050)

			expect(result).toBeNull()
		})
	})

	describe('terminateProcess', () => {
		it('should successfully terminate process by PID on Unix', async () => {
			const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

			const result = await processManager.terminateProcess(12345)

			expect(killSpy).toHaveBeenCalledWith(12345, 'SIGKILL')
			expect(result).toBe(true)

			killSpy.mockRestore()
		})

		it('should throw error when PID does not exist', async () => {
			const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
				throw new Error('No such process')
			})

			await expect(processManager.terminateProcess(99999)).rejects.toThrow(
				/Failed to terminate process/
			)

			killSpy.mockRestore()
		})

		it('should handle permission denied errors', async () => {
			const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
				const error = new Error('Operation not permitted') as Error & { code: string }
				error.code = 'EPERM'
				throw error
			})

			await expect(processManager.terminateProcess(1)).rejects.toThrow(
				/Failed to terminate process/
			)

			killSpy.mockRestore()
		})
	})

	describe('verifyPortFree', () => {
		it('should return true when port is free', async () => {
			// Mock no process on port
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: '',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.verifyPortFree(3060)

			expect(result).toBe(true)
		})

		it('should return false when port is in use', async () => {
			// Mock process found on port
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node      12345 user   23u  IPv4 0x123  0t0  TCP *:3061 (LISTEN)',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node server.js',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.verifyPortFree(3061)

			expect(result).toBe(false)
		})
	})

	describe('calculatePort', () => {
		it('should calculate correct port from issue/PR number', () => {
			expect(processManager.calculatePort(25)).toBe(3025)
			expect(processManager.calculatePort(1)).toBe(3001)
			expect(processManager.calculatePort(999)).toBe(3999)
			expect(processManager.calculatePort(0)).toBe(3000)
		})
	})

	describe('dev server validation', () => {
		it('should validate node process running "next dev"', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node      12345 user   23u  IPv4 0x123  0t0  TCP *:3070 (LISTEN)',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node /path/to/next dev',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.detectDevServer(3070)

			expect(result?.isDevServer).toBe(true)
		})

		it('should validate pnpm process running "dev" script', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'pnpm      12345 user   23u  IPv4 0x123  0t0  TCP *:3071 (LISTEN)',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'pnpm run dev',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.detectDevServer(3071)

			expect(result?.isDevServer).toBe(true)
		})

		it('should reject postgres process', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'postgres  12345 user   23u  IPv4 0x123  0t0  TCP *:5432 (LISTEN)',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'postgres: postgres iloom [local] idle',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.detectDevServer(5432)

			expect(result?.isDevServer).toBe(false)
		})

		it('should reject redis process', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'redis-ser 12345 user   23u  IPv4 0x123  0t0  TCP *:6379 (LISTEN)',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'redis-server *:6379',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.detectDevServer(6379)

			expect(result?.isDevServer).toBe(false)
		})

		it('should validate vite process', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node      12345 user   23u  IPv4 0x123  0t0  TCP *:3072 (LISTEN)',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node /path/to/vite',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.detectDevServer(3072)

			expect(result?.isDevServer).toBe(true)
		})

		it('should validate webpack-dev-server', async () => {
			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node      12345 user   23u  IPv4 0x123  0t0  TCP *:3073 (LISTEN)',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			vi.mocked(execa).mockResolvedValueOnce({
				stdout: 'node /path/to/webpack serve',
				stderr: '',
				exitCode: 0,
			} as ExecaReturnValue)

			const result = await processManager.detectDevServer(3073)

			expect(result?.isDevServer).toBe(true)
		})
	})

	describe('platform detection', () => {
		it('should detect macOS platform', () => {
			// Platform detection happens in constructor, which we can't easily test
			// without mocking process.platform, but we can verify it doesn't throw
			expect(() => new ProcessManager()).not.toThrow()
		})
	})
})
