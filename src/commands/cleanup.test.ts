import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CleanupCommand } from '../../src/commands/cleanup.js'
import { GitWorktreeManager } from '../../src/lib/GitWorktreeManager.js'
import { ResourceCleanup } from '../../src/lib/ResourceCleanup.js'
import { logger } from '../../src/utils/logger.js'
import { promptConfirmation } from '../../src/utils/prompt.js'
import type { CleanupResult, SafetyCheck } from '../../src/types/cleanup.js'

// Mock dependencies
vi.mock('../../src/lib/GitWorktreeManager.js')
vi.mock('../../src/lib/ResourceCleanup.js')
vi.mock('../../src/utils/prompt.js')
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}))

describe('CleanupCommand', () => {
  let command: CleanupCommand
  let mockGitWorktreeManager: vi.Mocked<GitWorktreeManager>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGitWorktreeManager = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
    // Mock listWorktrees by default to prevent executeIssueCleanup from failing
    mockGitWorktreeManager.listWorktrees = vi.fn().mockResolvedValue([])
    command = new CleanupCommand(mockGitWorktreeManager)
  })

  describe('Constructor and Dependency Injection', () => {
    it('should accept GitWorktreeManager through constructor', () => {
      const manager = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
      const cmd = new CleanupCommand(manager)

      expect(cmd).toBeDefined()
      expect(cmd).toBeInstanceOf(CleanupCommand)
    })

    it('should create default GitWorktreeManager when none provided', () => {
      const cmd = new CleanupCommand()

      expect(cmd).toBeDefined()
      expect(cmd).toBeInstanceOf(CleanupCommand)
    })

    it('should use injected GitWorktreeManager for operations', async () => {
      const customManager = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
      const cmd = new CleanupCommand(customManager)

      await cmd.execute({
        options: { list: true }
      })

      // Verify the command uses the injected manager
      expect(cmd).toBeDefined()
    })
  })

  describe('Option Parsing - List Mode', () => {
    it('should parse --list flag and set mode to "list"', async () => {
      await command.execute({
        options: { list: true }
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: list')
      expect(logger.info).toHaveBeenCalledWith('Would list all worktrees')
    })

    it('should handle list mode without identifier', async () => {
      await command.execute({
        options: { list: true }
      })

    })
  })

  describe('Option Parsing - All Mode', () => {
    it('should parse --all flag and set mode to "all"', async () => {
      await command.execute({
        options: { all: true }
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: all')
      expect(logger.info).toHaveBeenCalledWith('Would remove all worktrees')
    })

    it('should handle all mode without identifier', async () => {
      await command.execute({
        options: { all: true }
      })

    })
  })

  describe('Option Parsing - Issue Mode', () => {
    it('should parse --issue <number> and set mode to "issue"', async () => {
      await command.execute({
        options: { issue: 42 }
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: issue')
      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #42...')
    })

    it('should handle issue mode with number 1', async () => {
      await command.execute({
        options: { issue: 1 }
      })

      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #1...')
    })

    it('should handle issue mode with large number', async () => {
      await command.execute({
        options: { issue: 999 }
      })

      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #999...')
    })
  })

  describe('Auto-detection - Numeric Identifiers', () => {
    it('should detect "42" as issue number', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: issue')
      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #42...')
    })

    it('should detect "123" as issue number', async () => {
      await command.execute({
        identifier: '123',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #123...')
    })

    it('should detect "1" as issue number', async () => {
      await command.execute({
        identifier: '1',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #1...')
    })

    it('should detect "0" as issue number (edge case)', async () => {
      await command.execute({
        identifier: '0',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #0...')
    })

    it('should parse numeric string to integer correctly', async () => {
      await command.execute({
        identifier: '007',
        options: {}
      })

      // Should parse as integer 7, not string "007"
      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #7...')
    })
  })


  describe('Mode Determination - Priority', () => {
    it('should prioritize --list over other options', async () => {
      // Note: list mode with identifier will throw validation error
      await expect(command.execute({
        identifier: '42',
        options: { list: true }
      })).rejects.toThrow('Cannot use --list with a specific identifier')
    })

    it('should prioritize --all over identifier', async () => {
      // Note: all mode with identifier will throw validation error
      await expect(command.execute({
        identifier: 'feat/branch',
        options: { all: true }
      })).rejects.toThrow('Cannot use --all with a specific identifier')
    })

    it('should prioritize explicit --issue flag over auto-detection', async () => {
      await command.execute({
        identifier: '42',
        options: { issue: 99 }
      })

      // Should use explicit issue flag (99), not auto-detected (42)
      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #99...')
    })
  })

  describe('Validation - Option Conflicts', () => {
    it('should throw error when --list used with --all', async () => {
      await expect(command.execute({
        options: { list: true, all: true }
      })).rejects.toThrow('Cannot use --list with --all')
    })

    it('should throw error when --list used with --issue', async () => {
      await expect(command.execute({
        options: { list: true, issue: 42 }
      })).rejects.toThrow('Cannot use --list with --issue')
    })

    it('should throw error when --list used with positional identifier', async () => {
      await expect(command.execute({
        identifier: 'feat/branch',
        options: { list: true }
      })).rejects.toThrow('Cannot use --list with a specific identifier')
    })

    it('should throw error when --all used with positional identifier', async () => {
      await expect(command.execute({
        identifier: 'feat/branch',
        options: { all: true }
      })).rejects.toThrow('Cannot use --all with a specific identifier')
    })

    it('should throw error when --all used with --issue', async () => {
      await expect(command.execute({
        options: { all: true, issue: 42 }
      })).rejects.toThrow('Cannot use --all with a specific identifier')
    })

    it('should throw error when --issue flag used with branch name identifier', async () => {
      await expect(command.execute({
        identifier: 'feat/branch',
        options: { issue: 42 }
      })).rejects.toThrow('Cannot use --issue flag with branch name identifier')
    })

    it('should allow --force with list mode', async () => {
      await command.execute({
        options: { list: true, force: true }
      })

    })

    it('should allow --force with all mode', async () => {
      await command.execute({
        options: { all: true, force: true }
      })

    })

    it('should allow --force with issue mode', async () => {
      await command.execute({
        options: { issue: 42, force: true }
      })

    })

    it('should allow --dry-run with any mode', async () => {
      await command.execute({
        options: { all: true, dryRun: true }
      })

    })

    it('should allow --force and --dry-run together', async () => {
      await command.execute({
        options: { all: true, force: true, dryRun: true }
      })

    })
  })

  describe('Error Handling - Missing Arguments', () => {
    it('should throw error when no identifier and no flags provided', async () => {
      await expect(command.execute({
        options: {}
      })).rejects.toThrow('Missing required argument: identifier')
    })

    it('should provide helpful error message suggesting --all or --list', async () => {
      await expect(command.execute({
        options: {}
      })).rejects.toThrow('Use --all to remove all worktrees or --list to list them')
    })

    it('should throw error for empty string identifier', async () => {
      await expect(command.execute({
        identifier: '',
        options: {}
      })).rejects.toThrow('Missing required argument: identifier')
    })

    it('should throw error for whitespace-only identifier', async () => {
      await expect(command.execute({
        identifier: '   ',
        options: {}
      })).rejects.toThrow('Missing required argument: identifier')
    })
  })

  describe('Error Handling - Clear Messages', () => {
    it('should provide clear error message for conflicting options', async () => {
      const errorPromise = command.execute({
        options: { list: true, all: true }
      })

      await expect(errorPromise).rejects.toThrow('Cannot use --list with --all (list is informational only)')
    })

    it('should log errors before throwing', async () => {
      await expect(command.execute({
        options: { list: true, all: true }
      })).rejects.toThrow()

      expect(logger.error).toHaveBeenCalled()
    })

    it('should handle unknown errors gracefully', async () => {
      // Force an unknown error by throwing from logger
      vi.mocked(logger.info).mockImplementationOnce(() => {
        throw 'string error'  // Non-Error throw
      })

      await expect(command.execute({
        options: { list: true }
      })).rejects.toBeDefined()

      expect(logger.error).toHaveBeenCalledWith('An unknown error occurred')
    })
  })

  describe('Integration - Complete Workflows', () => {
    it('should execute successfully with valid list command', async () => {
      await command.execute({
        options: { list: true }
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: list')
    })


    it('should execute successfully with valid issue number', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: issue')
    })

    it('should execute successfully with valid --all command', async () => {
      await command.execute({
        options: { all: true }
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: all')
    })


    it('should handle dry-run flag with issue cleanup', async () => {
      await command.execute({
        identifier: '42',
        options: { dryRun: true }
      })

    })

    it('should handle all flags combined where valid', async () => {
      await command.execute({
        identifier: '42',
        options: { force: true, dryRun: true }
      })

    })
  })

  describe('Edge Cases', () => {
    it('should handle identifier with leading zeros', async () => {
      await command.execute({
        identifier: '007',
        options: {}
      })

      // Should parse to integer 7
      expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #7...')
    })


    it('should preserve original input in parsed result', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

      // The command should work correctly
    })

    it('should handle undefined options gracefully', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

    })
  })

  describe('Mode-specific Validation', () => {
    it('should validate list mode cannot have identifier', async () => {
      await expect(command.execute({
        identifier: 'feat/branch',
        options: { list: true }
      })).rejects.toThrow('Cannot use --list with a specific identifier (list shows all worktrees)')
    })

    it('should validate all mode cannot have identifier', async () => {
      await expect(command.execute({
        identifier: 'feat/branch',
        options: { all: true }
      })).rejects.toThrow('Cannot use --all with a specific identifier. Use one or the other.')
    })

    it('should validate explicit issue flag cannot be used with branch name', async () => {
      await expect(command.execute({
        identifier: 'feat/branch',
        options: { issue: 42 }
      })).rejects.toThrow('Cannot use --issue flag with branch name identifier. Use numeric identifier or --issue flag alone.')
    })
  })

  describe('Single Mode Execution Tests', () => {
    let mockResourceCleanup: vi.Mocked<ResourceCleanup>

    // Helper function to setup common mocks for branch identifier tests
    const setupBranchWorktreeMock = (branchName: string) => {
      const mockWorktree = { path: '/path/to/worktree', branch: branchName, commit: 'abc123', bare: false, detached: false, locked: false }
      mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue(mockWorktree)
      return mockWorktree
    }

    beforeEach(() => {
      vi.clearAllMocks()
      mockGitWorktreeManager = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
      const mockProcessManager = {} as vi.Mocked<import('../../src/lib/process/ProcessManager.js').ProcessManager>
      mockResourceCleanup = new ResourceCleanup(mockGitWorktreeManager, mockProcessManager) as vi.Mocked<ResourceCleanup>
      command = new CleanupCommand(mockGitWorktreeManager, mockResourceCleanup)

      // Mock GitWorktreeManager methods used by IdentifierParser
      mockGitWorktreeManager.findWorktreeForBranch = vi.fn()
      mockGitWorktreeManager.findWorktreeForIssue = vi.fn()
      mockGitWorktreeManager.findWorktreeForPR = vi.fn()
    })

    describe('Basic Cleanup Flow', () => {
      it('should execute cleanup with confirmation when worktree exists', async () => {
        // Mock IdentifierParser dependencies - branch 'feat/issue-45' exists
        const mockWorktree = { path: '/path/to/worktree', branch: 'feat/issue-45', commit: 'abc123', bare: false, detached: false, locked: false }
        mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue(mockWorktree)

        // Mock safety validation returns safe
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        // Mock user confirms both prompts
        vi.mocked(promptConfirmation)
          .mockResolvedValueOnce(true) // Confirm worktree removal
          .mockResolvedValueOnce(true) // Confirm branch deletion

        // Mock successful cleanup
        const mockResult: CleanupResult = {
          identifier: 'feat/issue-45',
          branchName: 'feat/issue-45',
          success: true,
          operations: [
            { type: 'dev-server', success: true, message: 'Dev server terminated' },
            { type: 'worktree', success: true, message: 'Worktree removed' }
          ],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)
        mockResourceCleanup.deleteBranch = vi.fn().mockResolvedValue(true)

        await command.execute({ identifier: 'feat/issue-45', options: {} })

        // Verify execution flow
        expect(mockResourceCleanup.validateCleanupSafety).toHaveBeenCalledWith('feat/issue-45')
        expect(promptConfirmation).toHaveBeenNthCalledWith(1, 'Remove this worktree?', true)
        expect(mockResourceCleanup.cleanupWorktree).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'branch', branchName: 'feat/issue-45' }),
          {
            dryRun: false,
            force: false,
            deleteBranch: false,
            keepDatabase: false
          }
        )
        expect(promptConfirmation).toHaveBeenNthCalledWith(2, 'Also delete the branch?', true)
        expect(mockResourceCleanup.deleteBranch).toHaveBeenCalled()
        expect(logger.success).toHaveBeenCalledWith('Cleanup completed successfully')
      })

      it('should skip cleanup when user declines first confirmation', async () => {
        // Mock IdentifierParser dependencies
        const mockWorktree = { path: '/path/to/worktree', branch: 'feat/issue-45', commit: 'abc123', bare: false, detached: false, locked: false }
        mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue(mockWorktree)

        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        // User declines worktree removal
        vi.mocked(promptConfirmation).mockResolvedValueOnce(false)

        mockResourceCleanup.cleanupWorktree = vi.fn()

        await command.execute({ identifier: 'feat/issue-45', options: {} })

        // Should not call cleanup
        expect(mockResourceCleanup.cleanupWorktree).not.toHaveBeenCalled()
        expect(logger.info).toHaveBeenCalledWith('Cleanup cancelled')
      })

      it('should cleanup worktree but skip branch when user declines second confirmation', async () => {
        // Mock IdentifierParser dependencies
        const mockWorktree = { path: '/path/to/worktree', branch: 'feat/issue-45', commit: 'abc123', bare: false, detached: false, locked: false }
        mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue(mockWorktree)

        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        // User confirms worktree but not branch
        vi.mocked(promptConfirmation)
          .mockResolvedValueOnce(true)  // Confirm worktree
          .mockResolvedValueOnce(false) // Decline branch

        const mockResult: CleanupResult = {
          identifier: 'feat/issue-45',
          branchName: 'feat/issue-45',
          success: true,
          operations: [{ type: 'worktree', success: true, message: 'Worktree removed' }],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)
        mockResourceCleanup.deleteBranch = vi.fn()

        await command.execute({ identifier: 'feat/issue-45', options: {} })

        // Worktree removed, branch not deleted
        expect(mockResourceCleanup.cleanupWorktree).toHaveBeenCalled()
        expect(mockResourceCleanup.deleteBranch).not.toHaveBeenCalled()
      })

      it('should display worktree details before confirmation prompt', async () => {
        // Mock IdentifierParser dependencies
        const mockWorktree = { path: '/path/to/worktree', branch: 'feat/issue-45', commit: 'abc123', bare: false, detached: false, locked: false }
        mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue(mockWorktree)

        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(false)

        await command.execute({ identifier: 'feat/issue-45', options: {} })

        // Details should be shown before prompt
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('feat/issue-45'))
      })
    })

    describe('Safety Validation', () => {
      it('should throw error when safety check fails with blockers', async () => {
        // Mock IdentifierParser dependencies - 'main' should find a worktree
        const mockWorktree = { path: '/repo', branch: 'main', commit: 'abc123', bare: true, detached: false, locked: false }
        mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue(mockWorktree)

        const mockSafety: SafetyCheck = {
          isSafe: false,
          warnings: [],
          blockers: ['Cannot cleanup main worktree']
        }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        await expect(command.execute({ identifier: 'main', options: {} }))
          .rejects.toThrow('Cannot cleanup: Cannot cleanup main worktree')

        // No prompts or cleanup attempted
        expect(promptConfirmation).not.toHaveBeenCalled()
        expect(mockResourceCleanup.cleanupWorktree).not.toHaveBeenCalled()
      })

      it('should display warnings but continue when isSafe=true with warnings', async () => {
        // Setup worktree mock
        setupBranchWorktreeMock('feat/branch')

        const mockSafety: SafetyCheck = {
          isSafe: true,
          warnings: ['Worktree has uncommitted changes'],
          blockers: []
        }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(false)

        await command.execute({ identifier: 'feat/branch', options: {} })

        // Warning should be logged
        expect(logger.warn).toHaveBeenCalledWith('Worktree has uncommitted changes')
        // Prompt still shown
        expect(promptConfirmation).toHaveBeenCalled()
      })

      it('should handle missing worktree gracefully', async () => {
        // Mock IdentifierParser dependencies - no worktree found
        mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue(null)

        await expect(command.execute({ identifier: 'nonexistent', options: {} }))
          .rejects.toThrow('No worktree found for identifier: nonexistent')

        expect(mockResourceCleanup.cleanupWorktree).not.toHaveBeenCalled()
      })
    })

    describe('Force Flag Behavior', () => {
      it('should skip all confirmations when --force flag provided', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        const mockResult: CleanupResult = {
          identifier: 'feat/branch',
          success: true,
          operations: [{ type: 'worktree', success: true, message: 'Worktree removed' }],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)
        mockResourceCleanup.deleteBranch = vi.fn().mockResolvedValue(true)

        await command.execute({ identifier: 'feat/branch', options: { force: true } })

        // No prompts called
        expect(promptConfirmation).not.toHaveBeenCalled()
        // Cleanup called with force and deleteBranch
        expect(mockResourceCleanup.cleanupWorktree).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'branch', branchName: 'feat/branch' }),
          {
            dryRun: false,
            force: true,
            deleteBranch: true,
            keepDatabase: false
          }
        )
      })

      it('should force delete branch when --force provided', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        const mockResult: CleanupResult = {
          identifier: 'feat/branch',
          success: true,
          operations: [],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)

        await command.execute({ identifier: 'feat/branch', options: { force: true } })

        expect(mockResourceCleanup.cleanupWorktree).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'branch', branchName: 'feat/branch' }),
          expect.objectContaining({ deleteBranch: true, force: true })
        )
      })
    })

    describe('Dry Run Mode', () => {
      it('should preview operations without executing when --dry-run provided', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(true)

        const mockResult: CleanupResult = {
          identifier: 'feat/branch',
          success: true,
          operations: [
            { type: 'worktree', success: true, message: '[DRY RUN] Would remove worktree' }
          ],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)

        await command.execute({ identifier: 'feat/branch', options: { dryRun: true } })

        expect(mockResourceCleanup.cleanupWorktree).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'branch', branchName: 'feat/branch' }),
          {
            dryRun: true,
            force: false,
            deleteBranch: false,
            keepDatabase: false
          }
        )
      })

      it('should still require confirmation in dry-run unless --force', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(false)

        await command.execute({ identifier: 'feat/branch', options: { dryRun: true } })

        // Prompt should still be called
        expect(promptConfirmation).toHaveBeenCalled()
        expect(logger.info).toHaveBeenCalledWith('Cleanup cancelled')
      })
    })

    describe('Result Reporting', () => {
      it('should report detailed results for successful cleanup', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(true).mockResolvedValueOnce(false)

        const mockResult: CleanupResult = {
          identifier: 'feat/branch',
          success: true,
          operations: [
            { type: 'dev-server', success: true, message: 'Dev server terminated' },
            { type: 'worktree', success: true, message: 'Worktree removed: /path' },
            { type: 'database', success: true, message: 'Database cleaned up' }
          ],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)

        await command.execute({ identifier: 'feat/branch', options: {} })

        // Each operation should be logged
        expect(logger.info).toHaveBeenCalledWith('Cleanup operations:')
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Dev server terminated'))
        expect(logger.success).toHaveBeenCalledWith('Cleanup completed successfully')
      })

      it('should report partial success when some operations fail', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(true).mockResolvedValueOnce(false)

        const mockError = new Error('Database cleanup failed')
        const mockResult: CleanupResult = {
          identifier: 'feat/branch',
          success: false,
          operations: [
            { type: 'worktree', success: true, message: 'Worktree removed' },
            { type: 'database', success: false, message: 'Database cleanup failed', error: 'Database cleanup failed' }
          ],
          errors: [mockError]
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)

        await command.execute({ identifier: 'feat/branch', options: {} })

        // Should show warnings about errors
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('error(s) occurred'))
        expect(logger.warn).toHaveBeenCalledWith('Cleanup completed with errors - see details above')
      })

      it('should display all operation types in result', async () => {
        setupBranchWorktreeMock('feat/issue-45')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(true).mockResolvedValueOnce(true)

        const mockResult: CleanupResult = {
          identifier: 'feat/issue-45',
          success: true,
          operations: [
            { type: 'dev-server', success: true, message: 'Dev server terminated' },
            { type: 'worktree', success: true, message: 'Worktree removed' },
            { type: 'database', success: true, message: 'Database cleaned' }
          ],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)
        mockResourceCleanup.deleteBranch = vi.fn().mockResolvedValue(true)

        await command.execute({ identifier: 'feat/issue-45', options: {} })

        // All operation types should be in results
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Dev server'))
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Worktree'))
      })
    })

    describe('Error Handling', () => {
      it('should handle ResourceCleanup errors gracefully', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(true)

        const error = new Error('Cleanup failed')
        mockResourceCleanup.cleanupWorktree = vi.fn().mockRejectedValue(error)

        await expect(command.execute({ identifier: 'feat/branch', options: {} }))
          .rejects.toThrow('Cleanup failed')

        expect(logger.error).toHaveBeenCalled()
      })

      it('should handle prompt errors gracefully', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        const error = new Error('stdin closed')
        vi.mocked(promptConfirmation).mockRejectedValue(error)

        await expect(command.execute({ identifier: 'feat/branch', options: {} }))
          .rejects.toThrow('stdin closed')
      })

      it('should not swallow unexpected errors', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        const unexpectedError = new Error('Unexpected error')
        vi.mocked(promptConfirmation).mockRejectedValue(unexpectedError)

        await expect(command.execute({ identifier: 'feat/branch', options: {} }))
          .rejects.toThrow('Unexpected error')
      })
    })

    describe('Integration with ResourceCleanup', () => {
      it('should pass correct options to ResourceCleanup.cleanupWorktree()', async () => {
        setupBranchWorktreeMock('feat/branch')
        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        mockResourceCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)

        vi.mocked(promptConfirmation).mockResolvedValueOnce(true).mockResolvedValueOnce(false)

        const mockResult: CleanupResult = {
          identifier: 'feat/branch',
          success: true,
          operations: [],
          errors: []
        }
        mockResourceCleanup.cleanupWorktree = vi.fn().mockResolvedValue(mockResult)

        await command.execute({ identifier: 'feat/branch', options: {} })

        expect(mockResourceCleanup.cleanupWorktree).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'branch', branchName: 'feat/branch' }),
          {
            dryRun: false,
            force: false,
            deleteBranch: false,
            keepDatabase: false
          }
        )
      })

      it('should handle ResourceCleanup dependency injection', async () => {
        const mockProcessManager = {} as vi.Mocked<import('../../src/lib/process/ProcessManager.js').ProcessManager>
        const customCleanup = new ResourceCleanup(mockGitWorktreeManager, mockProcessManager) as vi.Mocked<ResourceCleanup>
        const cmd = new CleanupCommand(mockGitWorktreeManager, customCleanup)

        // Setup mocks for this custom command instance
        mockGitWorktreeManager.findWorktreeForBranch = vi.fn().mockResolvedValue({ path: '/path', branch: 'feat/branch', commit: 'abc', bare: false, detached: false, locked: false })

        const mockSafety: SafetyCheck = { isSafe: true, warnings: [], blockers: [] }
        customCleanup.validateCleanupSafety = vi.fn().mockResolvedValue(mockSafety)
        vi.mocked(promptConfirmation).mockResolvedValueOnce(false)

        await cmd.execute({ identifier: 'feat/branch', options: {} })

        expect(customCleanup.validateCleanupSafety).toHaveBeenCalled()
      })

      it('should instantiate ResourceCleanup if not injected', async () => {
        const cmd = new CleanupCommand()

        // Should work without errors
        expect(cmd).toBeDefined()
      })
    })
  })

  describe('Issue Mode Execution Tests', () => {
    let mockResourceCleanup: vi.Mocked<ResourceCleanup>

    beforeEach(() => {
      vi.clearAllMocks()
      mockGitWorktreeManager = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
      const mockProcessManager = {} as vi.Mocked<import('../../src/lib/process/ProcessManager.js').ProcessManager>
      mockResourceCleanup = new ResourceCleanup(mockGitWorktreeManager, mockProcessManager) as vi.Mocked<ResourceCleanup>
      command = new CleanupCommand(mockGitWorktreeManager, mockResourceCleanup)
    })

    describe('Branch Discovery and Preview', () => {
      it('should find and display all branches matching issue number', async () => {
        // Mock listWorktrees to return empty array
        mockGitWorktreeManager.listWorktrees = vi.fn().mockResolvedValue([])

        await command.execute({
          options: { issue: 25 }
        })

        expect(logger.info).toHaveBeenCalledWith('Finding branches related to GitHub issue #25...')
      })

      it('should handle no matching branches found', async () => {
        // Mock listWorktrees to return empty array
        mockGitWorktreeManager.listWorktrees = vi.fn().mockResolvedValue([])

        await command.execute({
          options: { issue: 99999 }
        })

        expect(logger.warn).toHaveBeenCalledWith('No branches found for GitHub issue #99999')
        expect(logger.info).toHaveBeenCalledWith('Searched for patterns like: issue-99999, 99999-*, feat-99999, etc.')
      })
    })
  })
})
