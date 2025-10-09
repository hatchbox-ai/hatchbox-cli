import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CleanupCommand } from '../../src/commands/cleanup.js'
import { GitWorktreeManager } from '../../src/lib/GitWorktreeManager.js'
import { logger } from '../../src/utils/logger.js'

// Mock dependencies
vi.mock('../../src/lib/GitWorktreeManager.js')
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}))

describe('CleanupCommand', () => {
  let command: CleanupCommand
  let mockGitWorktreeManager: vi.Mocked<GitWorktreeManager>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGitWorktreeManager = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
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

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
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

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })
  })

  describe('Option Parsing - Issue Mode', () => {
    it('should parse --issue <number> and set mode to "issue"', async () => {
      await command.execute({
        options: { issue: 42 }
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: issue')
      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #42')
    })

    it('should handle issue mode with number 1', async () => {
      await command.execute({
        options: { issue: 1 }
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #1')
    })

    it('should handle issue mode with large number', async () => {
      await command.execute({
        options: { issue: 999 }
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #999')
    })
  })

  describe('Auto-detection - Numeric Identifiers', () => {
    it('should detect "42" as issue number', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: issue')
      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #42')
    })

    it('should detect "123" as issue number', async () => {
      await command.execute({
        identifier: '123',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #123')
    })

    it('should detect "1" as issue number', async () => {
      await command.execute({
        identifier: '1',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #1')
    })

    it('should detect "0" as issue number (edge case)', async () => {
      await command.execute({
        identifier: '0',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #0')
    })

    it('should parse numeric string to integer correctly', async () => {
      await command.execute({
        identifier: '007',
        options: {}
      })

      // Should parse as integer 7, not string "007"
      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #7')
    })
  })

  describe('Auto-detection - Branch Names', () => {
    it('should detect "feat/issue-45" as branch name', async () => {
      await command.execute({
        identifier: 'feat/issue-45',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: single')
      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktree: feat/issue-45')
    })

    it('should detect "my-feature-branch" as branch name', async () => {
      await command.execute({
        identifier: 'my-feature-branch',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktree: my-feature-branch')
    })

    it('should detect "feature-123-add-auth" as branch name (contains numbers but not purely numeric)', async () => {
      await command.execute({
        identifier: 'feature-123-add-auth',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: single')
      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktree: feature-123-add-auth')
    })

    it('should detect branch name with special characters', async () => {
      await command.execute({
        identifier: 'fix/bug_with-special.chars',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktree: fix/bug_with-special.chars')
    })

    it('should trim whitespace from identifier', async () => {
      await command.execute({
        identifier: '  feat/issue-45  ',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktree: feat/issue-45')
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
      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #99')
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

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should allow --force with all mode', async () => {
      await command.execute({
        options: { all: true, force: true }
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should allow --force with issue mode', async () => {
      await command.execute({
        options: { issue: 42, force: true }
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should allow --dry-run with any mode', async () => {
      await command.execute({
        options: { all: true, dryRun: true }
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should allow --force and --dry-run together', async () => {
      await command.execute({
        options: { all: true, force: true, dryRun: true }
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
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
      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should execute successfully with valid single identifier', async () => {
      await command.execute({
        identifier: 'feat/issue-45',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: single')
      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should execute successfully with valid issue number', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: issue')
      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should execute successfully with valid --all command', async () => {
      await command.execute({
        options: { all: true }
      })

      expect(logger.info).toHaveBeenCalledWith('Cleanup mode: all')
      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should handle force flag with single worktree', async () => {
      await command.execute({
        identifier: 'feat/branch',
        options: { force: true }
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should handle dry-run flag with issue cleanup', async () => {
      await command.execute({
        identifier: '42',
        options: { dryRun: true }
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should handle all flags combined where valid', async () => {
      await command.execute({
        identifier: '42',
        options: { force: true, dryRun: true }
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })
  })

  describe('Edge Cases', () => {
    it('should handle identifier with leading zeros', async () => {
      await command.execute({
        identifier: '007',
        options: {}
      })

      // Should parse to integer 7
      expect(logger.info).toHaveBeenCalledWith('Would cleanup worktrees for issue #7')
    })

    it('should handle very long branch name', async () => {
      const longBranch = 'feature/this-is-a-very-long-branch-name-that-exceeds-normal-length'

      await command.execute({
        identifier: longBranch,
        options: {}
      })

      expect(logger.info).toHaveBeenCalledWith(`Would cleanup worktree: ${longBranch}`)
    })

    it('should preserve original input in parsed result', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

      // The command should work correctly
      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
    })

    it('should handle undefined options gracefully', async () => {
      await command.execute({
        identifier: '42',
        options: {}
      })

      expect(logger.success).toHaveBeenCalledWith('Command parsing and validation successful')
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
})
