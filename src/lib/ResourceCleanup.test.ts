import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ResourceCleanup } from './ResourceCleanup.js'
import { GitWorktreeManager } from './GitWorktreeManager.js'
import { DatabaseManager } from './DatabaseManager.js'
import { ProcessManager } from './process/ProcessManager.js'
import type { GitWorktree } from '../types/worktree.js'
import type { ResourceCleanupOptions } from '../types/cleanup.js'

// Mock dependencies
vi.mock('./GitWorktreeManager.js')
vi.mock('./DatabaseManager.js')
vi.mock('./process/ProcessManager.js')
vi.mock('../utils/git.js')

describe('ResourceCleanup', () => {
	let resourceCleanup: ResourceCleanup
	let mockGitWorktree: GitWorktreeManager
	let mockProcessManager: ProcessManager
	let mockDatabase: DatabaseManager

	beforeEach(() => {
		// Create mock instances
		mockGitWorktree = new GitWorktreeManager()
		mockProcessManager = new ProcessManager()
		mockDatabase = new DatabaseManager()

		// Initialize ResourceCleanup with mocks
		resourceCleanup = new ResourceCleanup(mockGitWorktree, mockProcessManager, mockDatabase)

		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('cleanupWorktree', () => {
		const mockWorktree: GitWorktree = {
			path: '/path/to/worktree',
			branch: 'feat/issue-25',
			commit: 'abc123',
			bare: false,
			detached: false,
			locked: false,
		}

		it('should successfully cleanup complete worktree (dev server + worktree + branch + database)', async () => {
			// Mock worktree exists
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])

			// Mock process detection (dev server found)
			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3025)
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce({
				pid: 12345,
				name: 'node',
				command: 'node next dev',
				port: 3025,
				isDevServer: true,
			})
			vi.mocked(mockProcessManager.terminateProcess).mockResolvedValueOnce(true)
			vi.mocked(mockProcessManager.verifyPortFree).mockResolvedValueOnce(true)

			// Mock worktree removal
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValueOnce(undefined)

			// Mock branch deletion
			const { executeGitCommand } = await import('../utils/git.js')
			vi.mocked(executeGitCommand).mockResolvedValueOnce('')

			// Mock database cleanup (not implemented yet, should skip)
			// No mock needed as it's optional

			const result = await resourceCleanup.cleanupWorktree('issue-25', {
				deleteBranch: true,
				keepDatabase: false,
			} as ResourceCleanupOptions)

			expect(result.success).toBe(true)
			expect(result.errors).toHaveLength(0)
			expect(result.operations).toHaveLength(4) // dev-server, worktree, branch, database
			expect(result.operations[0]?.type).toBe('dev-server')
			expect(result.operations[0]?.success).toBe(true)
			expect(result.operations[1]?.type).toBe('worktree')
			expect(result.operations[2]?.type).toBe('branch')
			expect(result.operations[3]?.type).toBe('database')
		})

		it('should handle missing dev server gracefully', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3025)
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce(null)
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValueOnce(undefined)

			const result = await resourceCleanup.cleanupWorktree('issue-25', {
				keepDatabase: true,
			})

			expect(result.success).toBe(true)
			expect(result.operations[0]?.message).toContain('No dev server running')
		})

		it('should handle missing worktree gracefully', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([])

			const result = await resourceCleanup.cleanupWorktree('issue-99', {})

			expect(result.success).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.errors[0]?.message).toContain('No worktree found')
		})

		it('should handle missing database provider gracefully', async () => {
			// Create ResourceCleanup without database manager
			const cleanupWithoutDB = new ResourceCleanup(mockGitWorktree, mockProcessManager)

			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3025)
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce(null)
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValueOnce(undefined)

			const result = await cleanupWithoutDB.cleanupWorktree('issue-25', {
				keepDatabase: false,
			})

			expect(result.success).toBe(true)
			// Should skip database cleanup with warning
			const dbOperation = result.operations.find(op => op.type === 'database')
			expect(dbOperation?.message).toContain('skipped')
		})

		it('should continue cleanup on partial failures', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3025)

			// Dev server termination fails
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce({
				pid: 12345,
				name: 'node',
				command: 'node next dev',
				port: 3025,
				isDevServer: true,
			})
			vi.mocked(mockProcessManager.terminateProcess).mockRejectedValueOnce(
				new Error('Permission denied')
			)

			// But worktree removal succeeds
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValueOnce(undefined)

			const result = await resourceCleanup.cleanupWorktree('issue-25', {
				keepDatabase: true,
			})

			// Should continue despite dev server failure
			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.operations.some(op => op.type === 'dev-server' && !op.success)).toBe(true)
			expect(result.operations.some(op => op.type === 'worktree' && op.success)).toBe(true)
		})

		it('should report all operations in CleanupResult', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3025)
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce(null)
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValueOnce(undefined)

			const result = await resourceCleanup.cleanupWorktree('issue-25', {
				deleteBranch: false,
				keepDatabase: true,
			})

			expect(result.operations).toHaveLength(2) // dev-server check + worktree removal
			expect(result.operations.every(op => 'type' in op)).toBe(true)
			expect(result.operations.every(op => 'success' in op)).toBe(true)
			expect(result.operations.every(op => 'message' in op)).toBe(true)
		})

		it('should support dry-run mode without executing changes', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3025)

			const result = await resourceCleanup.cleanupWorktree('issue-25', {
				dryRun: true,
				deleteBranch: true,
				keepDatabase: false,
			})

			expect(result.success).toBe(true)
			expect(result.operations.every(op => op.message.includes('[DRY RUN]'))).toBe(true)

			// Verify no actual operations were performed
			expect(mockProcessManager.detectDevServer).not.toHaveBeenCalled()
			expect(mockGitWorktree.removeWorktree).not.toHaveBeenCalled()
		})

		it('should log debug information about worktree discovery', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3025)
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce(null)
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValueOnce(undefined)

			// Mock logger.debug to capture debug logs
			const { logger } = await import('../utils/logger.js')
			const debugSpy = vi.spyOn(logger, 'debug')

			await resourceCleanup.cleanupWorktree('issue-25', {
				keepDatabase: true,
			})

			// Verify debug information was logged
			expect(debugSpy).toHaveBeenCalledWith('Found 1 worktrees for identifier "issue-25":')
			expect(debugSpy).toHaveBeenCalledWith('  0: path="/path/to/worktree", branch="feat/issue-25"')
			expect(debugSpy).toHaveBeenCalledWith('Selected worktree: path="/path/to/worktree", branch="feat/issue-25"')
		})
	})

	describe('terminateDevServer', () => {
		it('should detect and terminate running dev server', async () => {
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce({
				pid: 12345,
				name: 'node',
				command: 'node next dev',
				port: 3025,
				isDevServer: true,
			})
			vi.mocked(mockProcessManager.terminateProcess).mockResolvedValueOnce(true)
			vi.mocked(mockProcessManager.verifyPortFree).mockResolvedValueOnce(true)

			const result = await resourceCleanup.terminateDevServer(3025)

			expect(result).toBe(true)
			expect(mockProcessManager.terminateProcess).toHaveBeenCalledWith(12345)
			expect(mockProcessManager.verifyPortFree).toHaveBeenCalledWith(3025)
		})

		it('should return false when no dev server is running', async () => {
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce(null)

			const result = await resourceCleanup.terminateDevServer(3030)

			expect(result).toBe(false)
			expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled()
		})

		it('should not terminate non-dev-server processes', async () => {
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce({
				pid: 99999,
				name: 'postgres',
				command: 'postgres: hatchbox hatchbox [local] idle',
				port: 5432,
				isDevServer: false,
			})

			const result = await resourceCleanup.terminateDevServer(5432)

			expect(result).toBe(false)
			expect(mockProcessManager.terminateProcess).not.toHaveBeenCalled()
		})

		it('should verify termination after kill', async () => {
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce({
				pid: 12345,
				name: 'node',
				command: 'node next dev',
				port: 3025,
				isDevServer: true,
			})
			vi.mocked(mockProcessManager.terminateProcess).mockResolvedValueOnce(true)
			vi.mocked(mockProcessManager.verifyPortFree).mockResolvedValueOnce(true)

			await resourceCleanup.terminateDevServer(3025)

			expect(mockProcessManager.verifyPortFree).toHaveBeenCalledWith(3025)
		})

		it('should throw error when termination verification fails', async () => {
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValueOnce({
				pid: 12345,
				name: 'node',
				command: 'node next dev',
				port: 3025,
				isDevServer: true,
			})
			vi.mocked(mockProcessManager.terminateProcess).mockResolvedValueOnce(true)
			vi.mocked(mockProcessManager.verifyPortFree).mockResolvedValueOnce(false)

			await expect(resourceCleanup.terminateDevServer(3025)).rejects.toThrow(
				/may still be running/
			)
		})
	})

	describe('deleteBranch', () => {
		it('should delete local branch using git command', async () => {
			const { executeGitCommand } = await import('../utils/git.js')
			vi.mocked(executeGitCommand).mockResolvedValueOnce('')

			const result = await resourceCleanup.deleteBranch('feat/test-branch', {
				force: false,
			})

			expect(result).toBe(true)
			expect(executeGitCommand).toHaveBeenCalledWith(['branch', '-d', 'feat/test-branch'])
		})

		it('should protect main/master/develop branches from deletion', async () => {
			await expect(resourceCleanup.deleteBranch('main')).rejects.toThrow(/Cannot delete protected/)
			await expect(resourceCleanup.deleteBranch('master')).rejects.toThrow(
				/Cannot delete protected/
			)
			await expect(resourceCleanup.deleteBranch('develop')).rejects.toThrow(
				/Cannot delete protected/
			)
		})

		it('should use safe delete (-d) by default', async () => {
			const { executeGitCommand } = await import('../utils/git.js')
			vi.mocked(executeGitCommand).mockResolvedValueOnce('')

			await resourceCleanup.deleteBranch('feat/test-branch')

			expect(executeGitCommand).toHaveBeenCalledWith(['branch', '-d', 'feat/test-branch'])
		})

		it('should use force delete (-D) when force option enabled', async () => {
			const { executeGitCommand } = await import('../utils/git.js')
			vi.mocked(executeGitCommand).mockResolvedValueOnce('')

			await resourceCleanup.deleteBranch('feat/test-branch', { force: true })

			expect(executeGitCommand).toHaveBeenCalledWith(['branch', '-D', 'feat/test-branch'])
		})

		it('should provide helpful error message for unmerged branches', async () => {
			const { executeGitCommand } = await import('../utils/git.js')
			vi.mocked(executeGitCommand).mockRejectedValueOnce(new Error('branch not fully merged'))

			await expect(resourceCleanup.deleteBranch('feat/unmerged-branch')).rejects.toThrow(
				/Cannot delete unmerged branch.*Use --force/
			)
		})

		it('should support dry-run mode', async () => {
			const { executeGitCommand } = await import('../utils/git.js')

			const result = await resourceCleanup.deleteBranch('feat/test-branch', { dryRun: true })

			expect(result).toBe(true)
			expect(executeGitCommand).not.toHaveBeenCalled()
		})
	})

	describe('cleanupDatabase', () => {
		it('should gracefully degrade when DatabaseManager is unavailable', async () => {
			const cleanupWithoutDB = new ResourceCleanup(mockGitWorktree, mockProcessManager)

			const result = await cleanupWithoutDB.cleanupDatabase('feat/issue-25')

			expect(result).toBe(false)
		})

		it('should handle database cleanup when DatabaseManager is available', async () => {
			// Currently returns false as DatabaseManager is not implemented
			const result = await resourceCleanup.cleanupDatabase('feat/issue-25')

			// Should return false since implementation is pending Issue #5
			expect(result).toBe(false)
		})
	})

	describe('cleanupMultipleWorktrees', () => {
		const mockWorktree1: GitWorktree = {
			path: '/path/to/worktree1',
			branch: 'feat/issue-1',
			commit: 'abc123',
			bare: false,
			detached: false,
			locked: false,
		}

		const mockWorktree2: GitWorktree = {
			path: '/path/to/worktree2',
			branch: 'feat/issue-2',
			commit: 'def456',
			bare: false,
			detached: false,
			locked: false,
		}

		it('should cleanup multiple worktrees sequentially', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier)
				.mockResolvedValueOnce([mockWorktree1])
				.mockResolvedValueOnce([mockWorktree2])

			vi.mocked(mockProcessManager.calculatePort)
				.mockReturnValueOnce(3001)
				.mockReturnValueOnce(3002)

			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue(undefined)

			const results = await resourceCleanup.cleanupMultipleWorktrees(['issue-1', 'issue-2'], {
				keepDatabase: true,
			})

			expect(results).toHaveLength(2)
			expect(results[0]?.identifier).toBe('issue-1')
			expect(results[1]?.identifier).toBe('issue-2')
		})

		it('should continue on individual failures', async () => {
			// First worktree fails
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier)
				.mockResolvedValueOnce([])
				.mockResolvedValueOnce([mockWorktree2])

			vi.mocked(mockProcessManager.calculatePort).mockReturnValueOnce(3002)
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue(undefined)

			const results = await resourceCleanup.cleanupMultipleWorktrees(['issue-99', 'issue-2'], {
				keepDatabase: true,
			})

			expect(results).toHaveLength(2)
			expect(results[0]?.success).toBe(false)
			expect(results[1]?.success).toBe(true)
		})

		it('should aggregate results from all cleanup operations', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier)
				.mockResolvedValueOnce([mockWorktree1])
				.mockResolvedValueOnce([mockWorktree2])

			vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3001)
			vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)
			vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue(undefined)

			const results = await resourceCleanup.cleanupMultipleWorktrees(['issue-1', 'issue-2'], {
				keepDatabase: true,
			})

			expect(results.every(r => 'identifier' in r)).toBe(true)
			expect(results.every(r => 'operations' in r)).toBe(true)
			expect(results.every(r => 'errors' in r)).toBe(true)
		})
	})

	describe('validateCleanupSafety', () => {
		const mockWorktree: GitWorktree = {
			path: '/path/to/worktree',
			branch: 'feat/issue-25',
			commit: 'abc123',
			bare: false,
			detached: false,
			locked: false,
		}

		it('should check for uncommitted changes and add warning', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockGitWorktree.isMainWorktree).mockResolvedValueOnce(false)

			const { hasUncommittedChanges } = await import('../utils/git.js')
			vi.mocked(hasUncommittedChanges).mockResolvedValueOnce(true)

			const result = await resourceCleanup.validateCleanupSafety('issue-25')

			expect(result.isSafe).toBe(true)
			expect(result.warnings).toContain('Worktree has uncommitted changes')
		})

		it('should block cleanup of main worktree', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([mockWorktree])
			vi.mocked(mockGitWorktree.isMainWorktree).mockResolvedValueOnce(true)

			const result = await resourceCleanup.validateCleanupSafety('issue-25')

			expect(result.isSafe).toBe(false)
			expect(result.blockers).toContain('Cannot cleanup main worktree')
		})

		it('should block when worktree does not exist', async () => {
			vi.mocked(mockGitWorktree.findWorktreesByIdentifier).mockResolvedValueOnce([])

			const result = await resourceCleanup.validateCleanupSafety('issue-99')

			expect(result.isSafe).toBe(false)
			expect(result.blockers.length).toBeGreaterThan(0)
		})
	})
})
