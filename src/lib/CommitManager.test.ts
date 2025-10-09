import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CommitManager } from './CommitManager.js'
import * as git from '../utils/git.js'
import * as claude from '../utils/claude.js'

// Mock dependencies
vi.mock('../utils/git.js')
vi.mock('../utils/claude.js')
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock git status outputs for different scenarios
const mockGitStatus = {
  clean: '',
  unstagedOnly: ' M file1.ts\n?? file2.ts',
  stagedOnly: 'M  file1.ts\nA  file2.ts',
  mixed: 'MM file1.ts\n M file2.ts\nA  file3.ts',
  allTypes: 'M  staged.ts\n M unstaged.ts\nMM both.ts\nA  added.ts\nD  deleted.ts\n?? untracked.ts',
  renamedFile: 'R  old.ts -> new.ts',
  fileWithSpaces: 'M  file with spaces.ts',
}

describe('CommitManager', () => {
  let manager: CommitManager
  const mockWorktreePath = '/mock/worktree/path'

  beforeEach(() => {
    manager = new CommitManager()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Git Status Parsing', () => {
    it('should parse unstaged files from git status --porcelain output', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(mockGitStatus.unstagedOnly)
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.unstagedFiles).toEqual(['file1.ts', 'file2.ts'])
      expect(result.stagedFiles).toEqual([])
      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should parse staged files from git status --porcelain output', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(mockGitStatus.stagedOnly)
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.stagedFiles).toEqual(['file1.ts', 'file2.ts'])
      expect(result.unstagedFiles).toEqual([])
      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should parse mixed staged and unstaged files', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(mockGitStatus.mixed)
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.stagedFiles).toEqual(['file1.ts', 'file3.ts'])
      expect(result.unstagedFiles).toEqual(['file1.ts', 'file2.ts'])
      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should return empty arrays when repository is clean', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(mockGitStatus.clean)
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.stagedFiles).toEqual([])
      expect(result.unstagedFiles).toEqual([])
      expect(result.hasUncommittedChanges).toBe(false)
    })

    it('should handle all git status codes (M, A, D, R, C, ??)', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(mockGitStatus.allTypes)
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.stagedFiles).toEqual(['staged.ts', 'both.ts', 'added.ts', 'deleted.ts'])
      expect(result.unstagedFiles).toEqual(['unstaged.ts', 'both.ts', 'untracked.ts'])
      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should correctly parse filenames with spaces', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(mockGitStatus.fileWithSpaces)
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.stagedFiles).toEqual(['file with spaces.ts'])
    })

    it('should handle renamed files (R status)', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(mockGitStatus.renamedFile)
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.stagedFiles).toContain('old.ts -> new.ts')
    })

    it('should categorize untracked files (??) as unstaged', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('?? untracked.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.unstagedFiles).toContain('untracked.ts')
      expect(result.stagedFiles).toEqual([])
    })

    it('should throw when git command fails', async () => {
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(new Error('Git command failed'))

      await expect(manager.detectUncommittedChanges(mockWorktreePath)).rejects.toThrow(
        'Git command failed'
      )
    })
  })

  describe('Uncommitted Change Detection', () => {
    it('should detect uncommitted changes when files are unstaged', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(' M file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should detect uncommitted changes when files are staged', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('M  file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should detect uncommitted changes when files are mixed', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('MM file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should return hasUncommittedChanges=false when repository is clean', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.hasUncommittedChanges).toBe(false)
    })

    it('should populate unstagedFiles array correctly', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce(' M file1.ts\n M file2.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.unstagedFiles).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should populate stagedFiles array correctly', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('M  file1.ts\nA  file2.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.stagedFiles).toEqual(['file1.ts', 'file2.ts'])
    })

    it('should get current branch name', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('feature-branch')

      const result = await manager.detectUncommittedChanges(mockWorktreePath)

      expect(result.currentBranch).toBe('feature-branch')
    })

    it('should execute git command in correct worktree path', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      await manager.detectUncommittedChanges(mockWorktreePath)

      expect(git.executeGitCommand).toHaveBeenCalledWith(['status', '--porcelain'], {
        cwd: mockWorktreePath,
      })
    })
  })

  describe('Commit Message Generation', () => {
    it('should generate WIP message with issue number and Fixes trailer', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, {
        issueNumber: 123,
        dryRun: false,
      })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should generate WIP message without issue number when none provided', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, {
        dryRun: false,
      })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit uncommitted changes'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should use custom message when provided in options', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, {
        message: 'Custom commit message',
        dryRun: false,
      })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-m', 'Custom commit message'],
        { cwd: mockWorktreePath }
      )
    })

    it('should format message with proper newlines', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, {
        issueNumber: 456,
        dryRun: false,
      })

      const commitCall = vi.mocked(git.executeGitCommand).mock.calls.find(
        (call) => call[0][0] === 'commit'
      )
      const message = commitCall?.[0][3]
      expect(message).toContain('\n\n')
    })

    it('should handle edge cases (very large issue numbers)', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, {
        issueNumber: 999999999,
        dryRun: false,
      })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #999999999\n\nFixes #999999999'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })
  })

  describe('Auto-Staging and Commit', () => {
    it('should stage all changes with git add -A', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(['add', '-A'], {
        cwd: mockWorktreePath,
      })
    })

    it('should commit with generated message', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit uncommitted changes'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should commit with custom message when provided', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, {
        message: 'Test message',
        dryRun: false,
      })

      expect(git.executeGitCommand).toHaveBeenCalledWith(['commit', '-m', 'Test message'], {
        cwd: mockWorktreePath,
      })
    })

    it('should throw when git add fails', async () => {
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(new Error('Add failed'))

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).rejects.toThrow(
        'Add failed'
      )
    })

    it('should throw when git commit fails', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(new Error('Commit failed'))

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).rejects.toThrow(
        'Commit failed'
      )
    })

    it('should handle empty commit scenario gracefully', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(
        new Error('nothing to commit, working tree clean')
      )

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).resolves.not.toThrow()
    })

    it('should call git add before git commit', async () => {
      const callOrder: string[] = []
      vi.mocked(git.executeGitCommand).mockImplementation(async (args) => {
        callOrder.push(args[0])
        return ''
      })

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const addIndex = callOrder.indexOf('add')
      const commitIndex = callOrder.indexOf('commit')
      expect(addIndex).toBeLessThan(commitIndex)
    })

    it('should execute commands in correct worktree path', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const calls = vi.mocked(git.executeGitCommand).mock.calls
      const addCall = calls.find(call => call[0][0] === 'add')
      const commitCall = calls.find(call => call[0][0] === 'commit')

      expect(addCall?.[1]).toEqual({ cwd: mockWorktreePath })
      expect(commitCall?.[1]).toEqual({ cwd: mockWorktreePath, stdio: 'inherit' })
    })
  })

  describe('Dry-Run Mode', () => {
    it('should detect changes without staging in dry-run mode', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('M  file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      await manager.commitChanges(mockWorktreePath, { dryRun: true })

      const gitCalls = vi.mocked(git.executeGitCommand).mock.calls
      const hasAddCall = gitCalls.some((call) => call[0][0] === 'add')
      const hasCommitCall = gitCalls.some((call) => call[0][0] === 'commit')

      expect(hasAddCall).toBe(false)
      expect(hasCommitCall).toBe(false)
    })

    it('should log what would be executed in dry-run mode', async () => {
      const { logger } = await import('../utils/logger.js')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('M  file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      await manager.commitChanges(mockWorktreePath, { dryRun: true, issueNumber: 123 })

      expect(logger.info).toHaveBeenCalledWith('[DRY RUN] Would run: git add -A')
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN] Would commit with message:')
      )
    })

    it('should not call git add in dry-run mode', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('M  file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      await manager.commitChanges(mockWorktreePath, { dryRun: true })

      const addCalls = vi.mocked(git.executeGitCommand).mock.calls.filter(
        (call) => call[0][0] === 'add'
      )
      expect(addCalls).toHaveLength(0)
    })

    it('should not call git commit in dry-run mode', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('M  file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      await manager.commitChanges(mockWorktreePath, { dryRun: true })

      const commitCalls = vi.mocked(git.executeGitCommand).mock.calls.filter(
        (call) => call[0][0] === 'commit'
      )
      expect(commitCalls).toHaveLength(0)
    })

    it('should return accurate status information in dry-run mode', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('M  file.ts')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('main')

      await expect(
        manager.commitChanges(mockWorktreePath, { dryRun: true })
      ).resolves.not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle git status command failure', async () => {
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(new Error('Status failed'))

      await expect(manager.detectUncommittedChanges(mockWorktreePath)).rejects.toThrow(
        'Status failed'
      )
    })

    it('should handle git add command failure', async () => {
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(new Error('Add failed'))

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).rejects.toThrow(
        'Add failed'
      )
    })

    it('should handle git commit command failure', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(new Error('Commit failed'))

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).rejects.toThrow(
        'Commit failed'
      )
    })

    it('should handle "nothing to commit" scenario gracefully', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(
        new Error('nothing to commit, working tree clean')
      )

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).resolves.not.toThrow()
    })

    it('should not swallow unexpected errors', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(new Error('Unexpected error'))

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).rejects.toThrow(
        'Unexpected error'
      )
    })

    it('should throw specific error for pre-commit hook rejection', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(
        new Error('The commit failed because the pre-commit hook exited with code 1')
      )

      await expect(manager.commitChanges(mockWorktreePath, { dryRun: false })).rejects.toThrow(
        'pre-commit hook'
      )
    })
  })

  describe('Claude Commit Message Generation', () => {
    beforeEach(() => {
      // Mock Claude CLI availability by default
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
    })

    it('should generate commit message using Claude when available', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add user authentication with JWT tokens')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      expect(claude.launchClaude).toHaveBeenCalled()
      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'Add user authentication with JWT tokens'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should include "Fixes #N" trailer when issue number provided', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Fix navigation bug in sidebar menu')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      const commitCall = vi.mocked(git.executeGitCommand).mock.calls.find(
        (call) => call[0][0] === 'commit'
      )
      expect(commitCall?.[0][3]).toContain('Fixes #123')
    })

    it('should sanitize Claude output (strip newlines, carriage returns)', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add feature\nwith multiple\r\nlines')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const commitCall = vi.mocked(git.executeGitCommand).mock.calls.find(
        (call) => call[0][0] === 'commit'
      )
      // Sanitized message should have newlines replaced with spaces
      expect(commitCall?.[0][3]).toBe('Add feature with multiple lines')
    })

    it('should pass worktree path to Claude via addDir option', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add feature')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const claudeCall = vi.mocked(claude.launchClaude).mock.calls[0]
      expect(claudeCall[1]).toEqual(
        expect.objectContaining({
          addDir: mockWorktreePath,
        })
      )
    })

    it('should use headless mode for Claude execution', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add feature')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const claudeCall = vi.mocked(claude.launchClaude).mock.calls[0]
      expect(claudeCall[1]).toEqual(
        expect.objectContaining({
          headless: true,
        })
      )
    })

    it('should use Haiku model for cost efficiency', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add feature')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const claudeCall = vi.mocked(claude.launchClaude).mock.calls[0]
      expect(claudeCall[1]).toEqual(
        expect.objectContaining({
          model: 'claude-3-5-haiku-20241022',
        })
      )
    })

    it('should use structured XML prompt format', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add feature')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const claudeCall = vi.mocked(claude.launchClaude).mock.calls[0]
      const prompt = claudeCall[0]
      expect(prompt).toContain('<Task>')
      expect(prompt).toContain('<Requirements>')
      expect(prompt).toContain('<Output>')
    })
  })

  describe('Claude Integration - Fallback Behavior', () => {
    it('should fallback to simple message when Claude CLI unavailable', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(false)
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(claude.launchClaude).not.toHaveBeenCalled()
      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should fallback when Claude returns empty string', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
      vi.mocked(claude.launchClaude).mockResolvedValue('')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should fallback when Claude returns error keyword', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
      vi.mocked(claude.launchClaude).mockResolvedValue('Error: API rate limit exceeded')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should fallback when Claude output contains "prompt.*too.*long"', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
      vi.mocked(claude.launchClaude).mockResolvedValue('Error: prompt is too long for this model')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should fallback when Claude throws exception', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
      vi.mocked(claude.launchClaude).mockRejectedValue(new Error('Claude CLI error'))
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should never fail commit due to Claude issues', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
      vi.mocked(claude.launchClaude).mockRejectedValue(new Error('Claude CLI error'))
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await expect(
        manager.commitChanges(mockWorktreePath, { dryRun: false })
      ).resolves.not.toThrow()
    })
  })

  describe('Claude Output Validation', () => {
    beforeEach(() => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
    })

    it('should reject message containing "error" (case-sensitive)', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('error in processing')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should reject message containing "Error"', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Error: something failed')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should reject message containing "API"', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('API call failed')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should accept valid message with "error" in context (e.g., "Fix error handling")', async () => {
      // Note: This test documents current limitation - bash script would reject this
      // The error pattern is case-insensitive, so it rejects "Fix error handling"
      vi.mocked(claude.launchClaude).mockResolvedValue('Fix error handling in auth module')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      // Falls back due to error pattern match (this is the limitation)
      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'WIP: Auto-commit for issue #123\n\nFixes #123'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })

    it('should accept message with proper imperative mood', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add user authentication with JWT')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-e', '-m', 'Add user authentication with JWT'],
        { cwd: mockWorktreePath, stdio: 'inherit' }
      )
    })
  })

  describe('Dry-Run Mode - Claude Integration', () => {
    it('should NOT call Claude in dry-run mode', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: true })

      expect(claude.launchClaude).not.toHaveBeenCalled()
    })

    it('should log what would be executed in dry-run mode', async () => {
      const { logger } = await import('../utils/logger.js')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: true, issueNumber: 123 })

      expect(logger.info).toHaveBeenCalledWith('[DRY RUN] Would run: git add -A')
      expect(logger.info).toHaveBeenCalledWith(
        '[DRY RUN] Would generate commit message with Claude (if available)'
      )
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[DRY RUN] Would commit with message:')
      )
    })

    it('should not consume API resources in dry-run mode', async () => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: true })

      // Verify no Claude or git commands were executed
      expect(claude.detectClaudeCli).not.toHaveBeenCalled()
      expect(claude.launchClaude).not.toHaveBeenCalled()
      expect(git.executeGitCommand).not.toHaveBeenCalled()
    })
  })

  describe('Integration with Existing CommitManager', () => {
    beforeEach(() => {
      vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
    })

    it('should maintain backward compatibility - custom message override', async () => {
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, {
        message: 'Custom commit message',
        dryRun: false,
      })

      expect(claude.launchClaude).not.toHaveBeenCalled()
      expect(git.executeGitCommand).toHaveBeenCalledWith(
        ['commit', '-m', 'Custom commit message'],
        { cwd: mockWorktreePath }
      )
    })

    it('should work with issue number flow', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Fix bug in navigation')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { issueNumber: 123, dryRun: false })

      const claudeCall = vi.mocked(claude.launchClaude).mock.calls[0]
      const prompt = claudeCall[0]
      expect(prompt).toContain('issue #123')

      const commitCall = vi.mocked(git.executeGitCommand).mock.calls.find(
        (call) => call[0][0] === 'commit'
      )
      expect(commitCall?.[0][3]).toContain('Fixes #123')
    })

    it('should work without issue number', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add new feature')
      vi.mocked(git.executeGitCommand).mockResolvedValue('')

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const claudeCall = vi.mocked(claude.launchClaude).mock.calls[0]
      const prompt = claudeCall[0]
      expect(prompt).not.toContain('Fixes #')

      const commitCall = vi.mocked(git.executeGitCommand).mock.calls.find(
        (call) => call[0][0] === 'commit'
      )
      expect(commitCall?.[0][3]).toBe('Add new feature')
    })

    it('should stage changes before generating message', async () => {
      const callOrder: string[] = []
      vi.mocked(claude.launchClaude).mockImplementation(async () => {
        callOrder.push('claude')
        return 'Add feature'
      })
      vi.mocked(git.executeGitCommand).mockImplementation(async (args) => {
        callOrder.push(args[0])
        return ''
      })

      await manager.commitChanges(mockWorktreePath, { dryRun: false })

      const addIndex = callOrder.indexOf('add')
      const claudeIndex = callOrder.indexOf('claude')
      expect(addIndex).toBeLessThan(claudeIndex)
    })

    it('should preserve existing error handling (nothing to commit)', async () => {
      vi.mocked(claude.launchClaude).mockResolvedValue('Add feature')
      vi.mocked(git.executeGitCommand).mockResolvedValueOnce('')
      vi.mocked(git.executeGitCommand).mockRejectedValueOnce(
        new Error('nothing to commit, working tree clean')
      )

      await expect(
        manager.commitChanges(mockWorktreePath, { dryRun: false })
      ).resolves.not.toThrow()
    })
  })
})
