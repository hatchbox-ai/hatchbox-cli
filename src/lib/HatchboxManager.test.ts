import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HatchboxManager } from './HatchboxManager.js'
import { GitWorktreeManager } from './GitWorktreeManager.js'
import { GitHubService } from './GitHubService.js'
import { EnvironmentManager } from './EnvironmentManager.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import type { CreateHatchboxInput } from '../types/hatchbox.js'
import { installDependencies } from '../utils/package-manager.js'

// Mock all dependencies
vi.mock('./GitWorktreeManager.js')
vi.mock('./GitHubService.js')
vi.mock('./EnvironmentManager.js')
vi.mock('./ClaudeContextManager.js')

// Mock branchExists utility
vi.mock('../utils/git.js', () => ({
  branchExists: vi.fn().mockResolvedValue(false),
}))

// Mock package-manager utilities
vi.mock('../utils/package-manager.js', () => ({
  installDependencies: vi.fn().mockResolvedValue(undefined),
}))

describe('HatchboxManager', () => {
  let manager: HatchboxManager
  let mockGitWorktree: vi.Mocked<GitWorktreeManager>
  let mockGitHub: vi.Mocked<GitHubService>
  let mockEnvironment: vi.Mocked<EnvironmentManager>
  let mockClaude: vi.Mocked<ClaudeContextManager>

  beforeEach(() => {
    mockGitWorktree = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
    mockGitHub = new GitHubService() as vi.Mocked<GitHubService>
    mockEnvironment = new EnvironmentManager() as vi.Mocked<EnvironmentManager>
    mockClaude = new ClaudeContextManager() as vi.Mocked<ClaudeContextManager>

    manager = new HatchboxManager(
      mockGitWorktree,
      mockGitHub,
      mockEnvironment,
      mockClaude
    )

    vi.clearAllMocks()
  })

  describe('createHatchbox', () => {
    const baseInput: CreateHatchboxInput = {
      type: 'issue',
      identifier: 123,
      originalInput: '123',
    }

    it('should create hatchbox for issue successfully', async () => {
      // Mock GitHub data fetch
      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 123,
        title: 'Test Issue',
        body: 'Test description',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/owner/repo/issues/123',
      })

      // Mock worktree creation
      const expectedPath = '/test/worktree-issue-123'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)

      // Mock environment setup
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3123)

      // Mock Claude context preparation
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      const result = await manager.createHatchbox(baseInput)

      expect(result.id).toBeDefined()
      expect(result.path).toBe(expectedPath)
      expect(result.type).toBe('issue')
      expect(result.identifier).toBe(123)
      expect(result.port).toBe(3123)
      expect(result.githubData?.title).toBe('Test Issue')
      expect(result.createdAt).toBeInstanceOf(Date)

      // Verify installDependencies was called with the correct path
      expect(installDependencies).toHaveBeenCalledWith(expectedPath, true)
    })

    it('should create hatchbox for PR successfully', async () => {
      const prInput: CreateHatchboxInput = {
        type: 'pr',
        identifier: 456,
        originalInput: 'pr/456',
      }

      // Mock GitHub PR fetch
      vi.mocked(mockGitHub.fetchPR).mockResolvedValue({
        number: 456,
        title: 'Test PR',
        body: 'Test PR description',
        state: 'open',
        branch: 'feature-branch',
        baseBranch: 'main',
        url: 'https://github.com/owner/repo/pull/456',
        isDraft: false,
      })

      // Mock worktree creation
      const expectedPath = '/test/worktree-feature-branch'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)

      // Mock environment setup
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3456)

      // Mock Claude context preparation
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      const result = await manager.createHatchbox(prInput)

      expect(result.type).toBe('pr')
      expect(result.identifier).toBe(456)
      expect(result.port).toBe(3456)
      expect(result.branch).toBe('feature-branch')

      // Verify installDependencies was called with the correct path
      expect(installDependencies).toHaveBeenCalledWith(expectedPath, true)
    })

    it('should create hatchbox for branch successfully', async () => {
      const branchInput: CreateHatchboxInput = {
        type: 'branch',
        identifier: 'feature-xyz',
        originalInput: 'feature-xyz',
      }

      // Mock worktree creation
      const expectedPath = '/test/worktree-feature-xyz'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)

      // Mock environment setup
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3000)

      // Mock Claude context preparation
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      const result = await manager.createHatchbox(branchInput)

      expect(result.type).toBe('branch')
      expect(result.identifier).toBe('feature-xyz')
      expect(result.branch).toBe('feature-xyz')
      expect(result.port).toBeGreaterThanOrEqual(3000)

      // Verify installDependencies was called with the correct path
      expect(installDependencies).toHaveBeenCalledWith(expectedPath, true)
    })

    it('should calculate correct port for issue', async () => {
      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 42,
        title: 'Test',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/owner/repo/issues/42',
      })

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      const result = await manager.createHatchbox({
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      })

      expect(result.port).toBe(3042)
      expect(mockEnvironment.setPortForWorkspace).toHaveBeenCalledWith(
        expect.stringContaining('.env'),
        42,
        undefined
      )
    })

    it('should throw when GitHub fetch fails', async () => {
      vi.mocked(mockGitHub.fetchIssue).mockRejectedValue(new Error('Issue not found'))

      await expect(manager.createHatchbox(baseInput)).rejects.toThrow('Issue not found')
    })

    it('should throw when worktree creation fails', async () => {
      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 123,
        title: 'Test',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/owner/repo/issues/123',
      })

      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue('/test/path')
      vi.mocked(mockGitWorktree.createWorktree).mockRejectedValue(
        new Error('Worktree creation failed')
      )

      await expect(manager.createHatchbox(baseInput)).rejects.toThrow('Worktree creation failed')
    })

    it('should throw when environment setup fails', async () => {
      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 123,
        title: 'Test',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/owner/repo/issues/123',
      })

      const expectedPath = '/test/path'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockRejectedValue(
        new Error('Environment setup failed')
      )

      await expect(manager.createHatchbox(baseInput)).rejects.toThrow('Environment setup failed')
    })

    it('should continue creation even if installDependencies fails', async () => {
      // Mock installDependencies to throw an error
      vi.mocked(installDependencies).mockRejectedValueOnce(new Error('npm install failed'))

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 123,
        title: 'Test',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/owner/repo/issues/123',
      })

      const expectedPath = '/test/path'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3123)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      // Should not throw even if installDependencies fails
      const result = await manager.createHatchbox(baseInput)

      expect(result.path).toBe(expectedPath)
      expect(installDependencies).toHaveBeenCalledWith(expectedPath, true)

      // Reset mock for next tests
      vi.mocked(installDependencies).mockResolvedValue(undefined)
    })

    it('should skip Claude context when skipClaude option is true', async () => {
      const inputWithSkipClaude: CreateHatchboxInput = {
        ...baseInput,
        options: { skipClaude: true },
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 123,
        title: 'Test',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/owner/repo/issues/123',
      })

      const expectedPath = '/test/path'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3123)

      await manager.createHatchbox(inputWithSkipClaude)

      expect(mockClaude.prepareContext).not.toHaveBeenCalled()
    })
  })

  describe('listHatchboxes', () => {
    it('should list active hatchboxes from worktrees', async () => {
      const mockWorktrees = [
        {
          path: '/test/worktree-issue-123',
          branch: 'issue-123',
          commit: 'abc123',
          bare: false,
          detached: false,
          locked: false,
        },
        {
          path: '/test/repo',
          branch: 'main',
          commit: 'def456',
          bare: true,
          detached: false,
          locked: false,
        },
      ]

      vi.mocked(mockGitWorktree.listWorktrees).mockResolvedValue(mockWorktrees)

      const result = await manager.listHatchboxes()

      expect(result).toHaveLength(2)
      expect(mockGitWorktree.listWorktrees).toHaveBeenCalled()
    })

    it('should return empty array when no worktrees exist', async () => {
      vi.mocked(mockGitWorktree.listWorktrees).mockResolvedValue([])

      const result = await manager.listHatchboxes()

      expect(result).toEqual([])
    })
  })

  describe('findHatchbox', () => {
    it('should find hatchbox by identifier', async () => {
      const mockWorktrees = [
        {
          path: '/test/worktree-issue-123',
          branch: 'issue-123',
          commit: 'abc123',
          bare: false,
          detached: false,
          locked: false,
        },
      ]

      vi.mocked(mockGitWorktree.listWorktrees).mockResolvedValue(mockWorktrees)

      const result = await manager.findHatchbox('123')

      expect(result).toBeDefined()
      expect(result?.identifier).toBe(123)
    })

    it('should return null when hatchbox not found', async () => {
      vi.mocked(mockGitWorktree.listWorktrees).mockResolvedValue([])

      const result = await manager.findHatchbox('999')

      expect(result).toBeNull()
    })
  })

  describe('finishHatchbox', () => {
    it('should throw not implemented error', async () => {
      await expect(manager.finishHatchbox('123')).rejects.toThrow('Not implemented')
    })
  })

  describe('cleanupHatchbox', () => {
    it('should throw not implemented error', async () => {
      await expect(manager.cleanupHatchbox('123')).rejects.toThrow('Not implemented')
    })
  })

  describe('branch name generation', () => {
    it('should use generateBranchName for issues', async () => {
      const mockGenerateBranchName = vi.fn().mockResolvedValue('feature/123-test-issue')
      vi.mocked(mockGitHub.generateBranchName).mockImplementation(mockGenerateBranchName)

      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 123,
        originalInput: '123',
      }

      const mockIssue = {
        number: 123,
        title: 'Test Issue',
        body: 'Issue body',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/123',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)

      const expectedPath = '/test/worktree-feature-123-test-issue'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3123)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      await manager.createHatchbox(input)

      expect(mockGenerateBranchName).toHaveBeenCalledWith({
        issueNumber: 123,
        title: 'Test Issue',
      })
    })

    it('should use PR branch for PRs', async () => {
      const input: CreateHatchboxInput = {
        type: 'pr',
        identifier: 456,
        originalInput: 'pr/456',
      }

      const mockPR = {
        number: 456,
        title: 'Test PR',
        body: 'PR body',
        state: 'open' as const,
        branch: 'existing-feature-branch',
        baseBranch: 'main',
        url: 'https://github.com/test/repo/pull/456',
        isDraft: false,
      }

      vi.mocked(mockGitHub.fetchPR).mockResolvedValue(mockPR)

      const expectedPath = '/test/worktree-existing-feature-branch'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3456)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      const result = await manager.createHatchbox(input)

      expect(result.branch).toBe('existing-feature-branch')
      // generateBranchName should not be called for PRs
      expect(mockGitHub.generateBranchName).not.toHaveBeenCalled()
    })

    it('should use branch name directly for branch type', async () => {
      const input: CreateHatchboxInput = {
        type: 'branch',
        identifier: 'my-custom-branch',
        originalInput: 'my-custom-branch',
      }

      const expectedPath = '/test/worktree-my-custom-branch'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3000)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      const result = await manager.createHatchbox(input)

      expect(result.branch).toBe('my-custom-branch')
      // generateBranchName should not be called for branch type
      expect(mockGitHub.generateBranchName).not.toHaveBeenCalled()
    })
  })

  describe('branch existence checking', () => {
    it('should check branch existence before creating worktree for issues', async () => {
      const { branchExists } = await import('../utils/git.js')
      vi.mocked(branchExists).mockResolvedValue(true)

      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 123,
        originalInput: '123',
      }

      const mockIssue = {
        number: 123,
        title: 'Test Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/123',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/123-test')
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue('/test/path')

      await expect(manager.createHatchbox(input)).rejects.toThrow(
        /branch .* already exists/
      )
    })

    it('should check branch existence before creating worktree for branches', async () => {
      const { branchExists } = await import('../utils/git.js')
      vi.mocked(branchExists).mockResolvedValue(true)

      const input: CreateHatchboxInput = {
        type: 'branch',
        identifier: 'existing-branch',
        originalInput: 'existing-branch',
      }

      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue('/test/path')

      await expect(manager.createHatchbox(input)).rejects.toThrow(
        /branch .* already exists/
      )
    })

    it('should not check branch existence for PRs', async () => {
      const { branchExists } = await import('../utils/git.js')
      vi.mocked(branchExists).mockResolvedValue(false)

      const input: CreateHatchboxInput = {
        type: 'pr',
        identifier: 456,
        originalInput: 'pr/456',
      }

      const mockPR = {
        number: 456,
        title: 'Test PR',
        body: '',
        state: 'open' as const,
        branch: 'pr-branch',
        baseBranch: 'main',
        url: 'https://github.com/test/repo/pull/456',
        isDraft: false,
      }

      vi.mocked(mockGitHub.fetchPR).mockResolvedValue(mockPR)
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue('/test/path')
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue('/test/path')
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3456)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      await manager.createHatchbox(input)

      // branchExists should not be called for PRs
      expect(branchExists).not.toHaveBeenCalled()
    })

    it('should create worktree when branch does not exist', async () => {
      const { branchExists } = await import('../utils/git.js')
      vi.mocked(branchExists).mockResolvedValue(false)

      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 123,
        originalInput: '123',
      }

      const mockIssue = {
        number: 123,
        title: 'Test Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/123',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/123-test')

      const expectedPath = '/test/worktree-feature-123-test'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3123)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      const result = await manager.createHatchbox(input)

      expect(result.branch).toBe('feature/123-test')
      expect(mockGitWorktree.createWorktree).toHaveBeenCalledWith({
        path: expectedPath,
        branch: 'feature/123-test',
        createBranch: true,
      })
    })
  })
})
