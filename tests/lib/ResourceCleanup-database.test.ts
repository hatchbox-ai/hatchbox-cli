import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ResourceCleanup } from '../../src/lib/ResourceCleanup.js'
import { GitWorktreeManager } from '../../src/lib/GitWorktreeManager.js'
import { ProcessManager } from '../../src/lib/process/ProcessManager.js'
import { DatabaseManager } from '../../src/lib/DatabaseManager.js'
import { createMockDatabaseManager } from '../mocks/MockDatabaseProvider.js'
import type { GitWorktree } from '../../src/types/worktree.js'
import type { ParsedInput } from '../../src/commands/start.js'

// Mock dependencies
vi.mock('../../src/lib/GitWorktreeManager.js')
vi.mock('../../src/lib/process/ProcessManager.js')
vi.mock('../../src/utils/git.js', () => ({
  executeGitCommand: vi.fn().mockResolvedValue(undefined),
  hasUncommittedChanges: vi.fn().mockResolvedValue(false),
}))

describe('ResourceCleanup - Database Integration', () => {
  let resourceCleanup: ResourceCleanup
  let mockGitWorktree: vi.Mocked<GitWorktreeManager>
  let mockProcessManager: vi.Mocked<ProcessManager>
  let mockDatabase: DatabaseManager

  beforeEach(() => {
    mockGitWorktree = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
    mockProcessManager = new ProcessManager() as vi.Mocked<ProcessManager>
    mockDatabase = createMockDatabaseManager()

    resourceCleanup = new ResourceCleanup(mockGitWorktree, mockProcessManager, mockDatabase)

    // Mock process manager methods
    vi.mocked(mockProcessManager.calculatePort).mockReturnValue(3123)
    vi.mocked(mockProcessManager.detectDevServer).mockResolvedValue(null)

    vi.clearAllMocks()
  })

  describe('cleanupDatabase', () => {
    it('should call DatabaseManager.deleteBranchIfConfigured with correct parameters', async () => {
      // GIVEN: DatabaseManager is available and configured
      const branchName = 'issue-123-test'
      const worktreePath = '/test/worktree-issue-123'

      // WHEN: cleanupDatabase is called with branch name and worktree path
      const result = await resourceCleanup.cleanupDatabase(branchName, worktreePath)

      // THEN: DatabaseManager.deleteBranchIfConfigured is called with branch name and .env path
      expect(mockDatabase.deleteBranchIfConfigured).toHaveBeenCalledWith(
        branchName,
        `${worktreePath}/.env`
      )

      // THEN: Returns true
      expect(result).toBe(true)
    })

    it('should return true when database cleanup succeeds', async () => {
      // GIVEN: DatabaseManager.deleteBranchIfConfigured completes successfully
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockResolvedValue(undefined)

      const branchName = 'issue-123-test'
      const worktreePath = '/test/worktree-issue-123'

      // WHEN: cleanupDatabase is called
      const result = await resourceCleanup.cleanupDatabase(branchName, worktreePath)

      // THEN: Returns true
      expect(result).toBe(true)
    })

    it('should log warning and return false when DatabaseManager not available', async () => {
      // GIVEN: ResourceCleanup constructed without DatabaseManager
      const resourceCleanupWithoutDb = new ResourceCleanup(mockGitWorktree, mockProcessManager)

      const branchName = 'issue-123-test'
      const worktreePath = '/test/worktree-issue-123'

      // WHEN: cleanupDatabase is called
      const result = await resourceCleanupWithoutDb.cleanupDatabase(branchName, worktreePath)

      // THEN: Returns false without throwing
      expect(result).toBe(false)
    })

    it('should log warning and return false when database cleanup fails', async () => {
      // GIVEN: DatabaseManager.deleteBranchIfConfigured throws error
      const dbError = new Error('Neon CLI error: branch not found')
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockRejectedValue(dbError)

      const branchName = 'issue-123-test'
      const worktreePath = '/test/worktree-issue-123'

      // WHEN: cleanupDatabase is called
      const result = await resourceCleanup.cleanupDatabase(branchName, worktreePath)

      // THEN: Returns false without throwing (non-fatal)
      expect(result).toBe(false)
    })
  })

  describe('cleanupWorktree with database cleanup', () => {
    const mockWorktree: GitWorktree = {
      path: '/test/worktree-issue-123',
      branch: 'issue-123-test',
      commit: 'abc123',
      bare: false,
      detached: false,
      locked: false,
    }

    const parsedIssue: ParsedInput = {
      type: 'issue',
      number: 123,
      originalInput: '123',
    }

    beforeEach(() => {
      // Mock worktree finding
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(mockWorktree)
      vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue()
    })

    it('should include database cleanup in operations when not keepDatabase', async () => {
      // GIVEN: DatabaseManager available, keepDatabase = false
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockResolvedValue(undefined)

      // WHEN: cleanupWorktree is called
      const result = await resourceCleanup.cleanupWorktree(parsedIssue, { keepDatabase: false })

      // THEN: cleanupDatabase is called (without envFilePath since it's pre-read)
      expect(mockDatabase.deleteBranchIfConfigured).toHaveBeenCalledWith(
        'issue-123-test'
      )

      // THEN: Operation result includes database cleanup success
      const dbOperation = result.operations.find((op) => op.type === 'database')
      expect(dbOperation).toBeDefined()
      expect(dbOperation?.success).toBe(true)
      expect(dbOperation?.message).toContain('cleaned up')
    })

    it('should skip database cleanup when keepDatabase = true', async () => {
      // GIVEN: keepDatabase option is true
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockResolvedValue(undefined)

      // WHEN: cleanupWorktree is called with keepDatabase
      const result = await resourceCleanup.cleanupWorktree(parsedIssue, { keepDatabase: true })

      // THEN: cleanupDatabase is not called
      expect(mockDatabase.deleteBranchIfConfigured).not.toHaveBeenCalled()

      // THEN: No database operation in results
      const dbOperation = result.operations.find((op) => op.type === 'database')
      expect(dbOperation).toBeUndefined()
    })

    it('should skip database cleanup in dry-run mode', async () => {
      // GIVEN: dryRun option is true
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockResolvedValue(undefined)

      // WHEN: cleanupWorktree is called with dryRun
      const result = await resourceCleanup.cleanupWorktree(parsedIssue, { dryRun: true })

      // THEN: cleanupDatabase is not called
      expect(mockDatabase.deleteBranchIfConfigured).not.toHaveBeenCalled()

      // THEN: Operation result includes "[DRY RUN]" database cleanup message
      const dbOperation = result.operations.find((op) => op.type === 'database')
      expect(dbOperation).toBeDefined()
      expect(dbOperation?.message).toContain('[DRY RUN]')
    })

    it('should handle database cleanup failure gracefully (non-fatal)', async () => {
      // GIVEN: Database cleanup fails
      const dbError = new Error('Database deletion failed')
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockRejectedValue(dbError)

      // WHEN: cleanupWorktree is called
      const result = await resourceCleanup.cleanupWorktree(parsedIssue, { keepDatabase: false })

      // THEN: Database cleanup returns false and doesn't throw (non-fatal)
      // The cleanupDatabase method catches errors and returns false instead of throwing
      // This means the result should still be success=true since worktree cleanup succeeded
      expect(result.success).toBe(true)

      // THEN: Database operation shows skipped (because deleteBranchIfConfigured is called but returns false)
      const dbOperation = result.operations.find((op) => op.type === 'database')
      expect(dbOperation).toBeDefined()
      expect(dbOperation?.success).toBe(true)
      expect(dbOperation?.message).toContain('skipped')

      const worktreeOperation = result.operations.find((op) => op.type === 'worktree')
      expect(worktreeOperation?.success).toBe(true)
    })

    it('should skip database cleanup when DatabaseManager not provided', async () => {
      // GIVEN: ResourceCleanup without DatabaseManager
      const resourceCleanupWithoutDb = new ResourceCleanup(mockGitWorktree, mockProcessManager)
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(mockWorktree)
      vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue()

      // WHEN: cleanupWorktree is called
      const result = await resourceCleanupWithoutDb.cleanupWorktree(parsedIssue, {
        keepDatabase: false,
      })

      // THEN: Database operation shows skipped
      const dbOperation = result.operations.find((op) => op.type === 'database')
      expect(dbOperation).toBeDefined()
      expect(dbOperation?.success).toBe(true)
      expect(dbOperation?.message).toContain('skipped')
    })

    it('should cleanup database for PR worktrees', async () => {
      // GIVEN: PR worktree
      const prWorktree: GitWorktree = {
        path: '/test/worktree-feature-branch_pr_42',
        branch: 'feature-branch',
        commit: 'def456',
        bare: false,
        detached: false,
        locked: false,
      }

      const parsedPR: ParsedInput = {
        type: 'pr',
        number: 42,
        originalInput: 'pr/42',
      }

      vi.mocked(mockGitWorktree.findWorktreeForPR).mockResolvedValue(prWorktree)
      vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue()
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockResolvedValue(undefined)

      // WHEN: cleanupWorktree is called for PR
      const result = await resourceCleanup.cleanupWorktree(parsedPR, { keepDatabase: false })

      // THEN: Database cleanup is called with PR branch name (without envFilePath since it's pre-read)
      expect(mockDatabase.deleteBranchIfConfigured).toHaveBeenCalledWith(
        'feature-branch'
      )

      // THEN: Database operation succeeds
      const dbOperation = result.operations.find((op) => op.type === 'database')
      expect(dbOperation?.success).toBe(true)
    })

    it('should cleanup database for branch worktrees', async () => {
      // GIVEN: Branch worktree
      const branchWorktree: GitWorktree = {
        path: '/test/worktree-feature-xyz',
        branch: 'feature-xyz',
        commit: 'ghi789',
        bare: false,
        detached: false,
        locked: false,
      }

      const parsedBranch: ParsedInput = {
        type: 'branch',
        branchName: 'feature-xyz',
        originalInput: 'feature-xyz',
      }

      vi.mocked(mockGitWorktree.findWorktreeForBranch).mockResolvedValue(branchWorktree)
      vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue()
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockResolvedValue(undefined)

      // WHEN: cleanupWorktree is called for branch
      const result = await resourceCleanup.cleanupWorktree(parsedBranch, { keepDatabase: false })

      // THEN: Database cleanup is called with branch name (without envFilePath since it's pre-read)
      expect(mockDatabase.deleteBranchIfConfigured).toHaveBeenCalledWith(
        'feature-xyz'
      )

      // THEN: Database operation succeeds
      const dbOperation = result.operations.find((op) => op.type === 'database')
      expect(dbOperation?.success).toBe(true)
    })
  })

  describe('cleanupMultipleWorktrees with database', () => {
    it('should cleanup databases for multiple worktrees', async () => {
      // GIVEN: Multiple worktrees
      const worktree1: GitWorktree = {
        path: '/test/worktree-issue-123',
        branch: 'issue-123-test',
        commit: 'abc123',
        bare: false,
        detached: false,
        locked: false,
      }

      const worktree2: GitWorktree = {
        path: '/test/worktree-issue-456',
        branch: 'issue-456-test',
        commit: 'def456',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitWorktree.findWorktreeForIssue)
        .mockResolvedValueOnce(worktree1)
        .mockResolvedValueOnce(worktree2)
      vi.mocked(mockGitWorktree.removeWorktree).mockResolvedValue()
      mockDatabase.deleteBranchIfConfigured = vi.fn().mockResolvedValue(undefined)

      // WHEN: cleanupMultipleWorktrees is called
      const results = await resourceCleanup.cleanupMultipleWorktrees(['123', '456'], {
        keepDatabase: false,
      })

      // THEN: Database cleanup is called for both worktrees (without envFilePath since it's pre-read)
      expect(mockDatabase.deleteBranchIfConfigured).toHaveBeenCalledTimes(2)
      expect(mockDatabase.deleteBranchIfConfigured).toHaveBeenCalledWith(
        'issue-123-test'
      )
      expect(mockDatabase.deleteBranchIfConfigured).toHaveBeenCalledWith(
        'issue-456-test'
      )

      // THEN: Both results include database cleanup operations
      expect(results).toHaveLength(2)
      results.forEach((result) => {
        const dbOperation = result.operations.find((op) => op.type === 'database')
        expect(dbOperation).toBeDefined()
        expect(dbOperation?.success).toBe(true)
      })
    })
  })
})
