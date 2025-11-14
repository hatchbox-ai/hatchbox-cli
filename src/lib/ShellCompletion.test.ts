import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ShellCompletion } from './ShellCompletion.js'
import { GitWorktreeManager } from './GitWorktreeManager.js'

// Mock omelette
vi.mock('omelette', () => ({
  default: vi.fn(() => ({
    on: vi.fn(),
    init: vi.fn(),
    setupShellInitFile: vi.fn((shell: string) => `# ${shell} completion script`),
  })),
}))

// Mock GitWorktreeManager
vi.mock('./GitWorktreeManager.js', () => ({
  GitWorktreeManager: vi.fn(() => ({
    listWorktrees: vi.fn(),
    getRepoInfo: vi.fn(),
  })),
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('ShellCompletion', () => {
  let shellCompletion: ShellCompletion
  let originalShell: string | undefined
  let originalArgv: string[]

  beforeEach(() => {
    vi.clearAllMocks()
    originalShell = process.env.SHELL
    originalArgv = [...process.argv]
  })

  afterEach(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL
    } else {
      process.env.SHELL = originalShell
    }
    process.argv = originalArgv
  })

  describe('command name detection', () => {
    it('should detect command name from process.argv[1]', () => {
      process.argv[1] = '/usr/local/bin/il-94'
      shellCompletion = new ShellCompletion()
      const instructions = shellCompletion.getSetupInstructions('bash')
      expect(instructions).toContain('eval "$(il-94 --completion)"')
    })

    it('should handle custom command names', () => {
      process.argv[1] = '/home/user/.local/bin/my-iloom'
      shellCompletion = new ShellCompletion()
      const instructions = shellCompletion.getSetupInstructions('zsh')
      expect(instructions).toContain('eval "$(my-iloom --completion)"')
    })

    it('should remove .js extension from command name', () => {
      process.argv[1] = '/path/to/cli.js'
      shellCompletion = new ShellCompletion()
      const instructions = shellCompletion.getSetupInstructions('bash')
      expect(instructions).toContain('eval "$(cli --completion)"')
    })

    it('should use explicit command name when provided', () => {
      shellCompletion = new ShellCompletion('custom-command')
      const instructions = shellCompletion.getSetupInstructions('bash')
      expect(instructions).toContain('eval "$(custom-command --completion)"')
    })

    it('should fallback to "il" when argv[1] is not available', () => {
      process.argv = ['node'] // Remove argv[1]
      shellCompletion = new ShellCompletion()
      const instructions = shellCompletion.getSetupInstructions('bash')
      expect(instructions).toContain('eval "$(il --completion)"')
    })
  })

  describe('detectShell', () => {
    it('should detect bash from SHELL environment variable', () => {
      process.env.SHELL = '/bin/bash'
      shellCompletion = new ShellCompletion()
      expect(shellCompletion.detectShell()).toBe('bash')
    })

    it('should detect zsh from SHELL environment variable', () => {
      process.env.SHELL = '/usr/local/bin/zsh'
      shellCompletion = new ShellCompletion()
      expect(shellCompletion.detectShell()).toBe('zsh')
    })

    it('should detect fish from SHELL environment variable', () => {
      process.env.SHELL = '/usr/bin/fish'
      shellCompletion = new ShellCompletion()
      expect(shellCompletion.detectShell()).toBe('fish')
    })

    it('should return unknown for unsupported shells', () => {
      process.env.SHELL = '/bin/sh'
      shellCompletion = new ShellCompletion()
      expect(shellCompletion.detectShell()).toBe('unknown')
    })

    it('should handle missing SHELL environment variable', () => {
      delete process.env.SHELL
      shellCompletion = new ShellCompletion()
      expect(shellCompletion.detectShell()).toBe('unknown')
    })
  })

  describe('getCompletionScript', () => {
    beforeEach(() => {
      shellCompletion = new ShellCompletion()
    })

    it('should generate bash completion script', () => {
      const script = shellCompletion.getCompletionScript('bash')
      expect(script).toContain('bash')
    })

    it('should generate zsh completion script', () => {
      const script = shellCompletion.getCompletionScript('zsh')
      expect(script).toContain('zsh')
    })

    it('should generate fish completion script', () => {
      const script = shellCompletion.getCompletionScript('fish')
      expect(script).toContain('fish')
    })

    it('should throw error for unsupported shell type', () => {
      expect(() => shellCompletion.getCompletionScript('unknown')).toThrow(
        'Unsupported shell type: unknown'
      )
    })
  })

  describe('getBranchSuggestions', () => {
    beforeEach(() => {
      shellCompletion = new ShellCompletion()
    })

    it('should return list of worktree branch names excluding main and current', async () => {
      const mockWorktrees = [
        { path: '/repo', branch: 'main', commit: 'abc123', bare: false, detached: false, locked: false },
        { path: '/repo/wt1', branch: 'feature-1', commit: 'def456', bare: false, detached: false, locked: false },
        { path: '/repo/wt2', branch: 'feature-2', commit: 'ghi789', bare: false, detached: false, locked: false },
        { path: '/repo/wt3', branch: 'current-branch', commit: 'jkl012', bare: false, detached: false, locked: false },
      ]

      // Mock the GitWorktreeManager constructor to return mocked methods
      vi.mocked(GitWorktreeManager).mockImplementation(
        () =>
          ({
            listWorktrees: vi.fn().mockResolvedValue(mockWorktrees),
            getRepoInfo: vi.fn().mockResolvedValue({
              root: '/repo',
              defaultBranch: 'main',
              currentBranch: 'current-branch',
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
      )

      const suggestions = await shellCompletion.getBranchSuggestions()

      expect(suggestions).toEqual(['feature-1', 'feature-2'])
    })

    it('should filter out main worktree (by path) and current worktree (by branch)', async () => {
      const mockWorktrees = [
        { path: '/repo', branch: 'main', commit: 'abc123', bare: false, detached: false, locked: false },
        { path: '/repo/wt1', branch: 'feature-branch', commit: 'def456', bare: false, detached: false, locked: false },
      ]

      vi.mocked(GitWorktreeManager).mockImplementation(
        () =>
          ({
            listWorktrees: vi.fn().mockResolvedValue(mockWorktrees),
            getRepoInfo: vi.fn().mockResolvedValue({
              root: '/repo',
              defaultBranch: 'main',
              currentBranch: 'feature-branch',
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
      )

      const suggestions = await shellCompletion.getBranchSuggestions()

      // Both should be filtered out: main worktree by path, current worktree by branch
      expect(suggestions).toEqual([])
    })

    it('should include worktrees that can be cleaned up', async () => {
      const mockWorktrees = [
        { path: '/repo', branch: 'main', commit: 'abc123', bare: false, detached: false, locked: false },
        { path: '/repo/wt1', branch: 'feat/issue-94-shell-autocomplete', commit: 'def456', bare: false, detached: false, locked: false },
        { path: '/repo/wt2', branch: 'feat/issue-99-cleanup', commit: 'ghi789', bare: false, detached: false, locked: false },
        { path: '/repo/wt3', branch: 'feat/issue-100-testing', commit: 'jkl012', bare: false, detached: false, locked: false },
      ]

      vi.mocked(GitWorktreeManager).mockImplementation(
        () =>
          ({
            listWorktrees: vi.fn().mockResolvedValue(mockWorktrees),
            getRepoInfo: vi.fn().mockResolvedValue({
              root: '/repo',
              defaultBranch: 'main',
              currentBranch: 'feat/issue-94-shell-autocomplete',
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
      )

      const suggestions = await shellCompletion.getBranchSuggestions()

      // Should show branches that can be cleaned up (not main worktree, not current)
      expect(suggestions).toEqual(['feat/issue-99-cleanup', 'feat/issue-100-testing'])
    })

    it('should handle GitWorktreeManager errors gracefully', async () => {
      vi.mocked(GitWorktreeManager).mockImplementation(
        () =>
          ({
            listWorktrees: vi.fn().mockRejectedValue(new Error('Git error')),
            getRepoInfo: vi.fn(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
      )

      const suggestions = await shellCompletion.getBranchSuggestions()

      expect(suggestions).toEqual([])
    })

    it('should return empty array when no worktrees exist', async () => {
      vi.mocked(GitWorktreeManager).mockImplementation(
        () =>
          ({
            listWorktrees: vi.fn().mockResolvedValue([]),
            getRepoInfo: vi.fn().mockResolvedValue({
              root: '/repo',
              defaultBranch: 'main',
              currentBranch: 'main',
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any
      )

      const suggestions = await shellCompletion.getBranchSuggestions()

      expect(suggestions).toEqual([])
    })

    it('should timeout after 1000ms to prevent blocking', async () => {
      const mockManager = new GitWorktreeManager()

      // Create a promise that never resolves to simulate a slow operation
      vi.mocked(mockManager.listWorktrees).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      const startTime = Date.now()

      // Use the private method through the public interface
      // We can't test the private method directly, but we can test that completion
      // handlers don't block indefinitely
      const suggestions = await shellCompletion.getBranchSuggestions()

      const elapsed = Date.now() - startTime

      // Should return empty array quickly, not hang indefinitely
      expect(suggestions).toEqual([])
      expect(elapsed).toBeLessThan(2000) // Should fail fast on error
    }, 3000)
  })

  describe('getSetupInstructions', () => {
    beforeEach(() => {
      shellCompletion = new ShellCompletion('test-command')
    })

    it('should provide bash setup instructions with correct paths', () => {
      const instructions = shellCompletion.getSetupInstructions('bash')
      expect(instructions).toContain('~/.bashrc')
      expect(instructions).toContain('~/.bash_profile')
      expect(instructions).toContain('eval "$(test-command --completion)"')
    })

    it('should provide zsh setup instructions with correct paths', () => {
      const instructions = shellCompletion.getSetupInstructions('zsh')
      expect(instructions).toContain('~/.zshrc')
      expect(instructions).toContain('eval "$(test-command --completion)"')
    })

    it('should provide fish setup instructions with correct paths', () => {
      const instructions = shellCompletion.getSetupInstructions('fish')
      expect(instructions).toContain('~/.config/fish/config.fish')
      expect(instructions).toContain('test-command --completion | source')
    })

    it('should return generic instructions for unknown shells', () => {
      const instructions = shellCompletion.getSetupInstructions('unknown')
      expect(instructions).toContain('Shell autocomplete is supported for bash, zsh, and fish')
      expect(instructions).toContain('Your current shell (unknown) may not be supported')
    })
  })

  describe('init', () => {
    it('should initialize completion without throwing', () => {
      shellCompletion = new ShellCompletion()
      expect(() => shellCompletion.init()).not.toThrow()
    })
  })
})
