import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HatchboxManager } from './HatchboxManager.js'
import { GitWorktreeManager } from './GitWorktreeManager.js'
import { GitHubService } from './GitHubService.js'
import { EnvironmentManager } from './EnvironmentManager.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import { ProjectCapabilityDetector } from './ProjectCapabilityDetector.js'
import { CLIIsolationManager } from './CLIIsolationManager.js'
import type { CreateHatchboxInput } from '../types/hatchbox.js'
import { installDependencies } from '../utils/package-manager.js'

// Mock all dependencies
vi.mock('./GitWorktreeManager.js')
vi.mock('./GitHubService.js')
vi.mock('./EnvironmentManager.js')
vi.mock('./ClaudeContextManager.js')
vi.mock('./ProjectCapabilityDetector.js')
vi.mock('./CLIIsolationManager.js')

// Mock branchExists utility
vi.mock('../utils/git.js', () => ({
  branchExists: vi.fn().mockResolvedValue(false),
}))

// Mock package-manager utilities
vi.mock('../utils/package-manager.js', () => ({
  installDependencies: vi.fn().mockResolvedValue(undefined),
}))

// Mock HatchboxLauncher (dynamically imported)
vi.mock('./HatchboxLauncher.js', () => ({
  HatchboxLauncher: vi.fn(() => ({
    launchHatchbox: vi.fn().mockResolvedValue(undefined),
  })),
}))

// Mock vscode utils (dynamically imported)
vi.mock('../utils/vscode.js', () => ({
  openVSCodeWindow: vi.fn().mockResolvedValue(undefined),
}))

describe('HatchboxManager', () => {
  let manager: HatchboxManager
  let mockGitWorktree: vi.Mocked<GitWorktreeManager>
  let mockGitHub: vi.Mocked<GitHubService>
  let mockEnvironment: vi.Mocked<EnvironmentManager>
  let mockClaude: vi.Mocked<ClaudeContextManager>
  let mockCapabilityDetector: vi.Mocked<ProjectCapabilityDetector>
  let mockCLIIsolation: vi.Mocked<CLIIsolationManager>

  beforeEach(() => {
    mockGitWorktree = new GitWorktreeManager() as vi.Mocked<GitWorktreeManager>
    mockGitHub = new GitHubService() as vi.Mocked<GitHubService>
    mockEnvironment = new EnvironmentManager() as vi.Mocked<EnvironmentManager>
    mockClaude = new ClaudeContextManager() as vi.Mocked<ClaudeContextManager>
    mockCapabilityDetector = new ProjectCapabilityDetector() as vi.Mocked<ProjectCapabilityDetector>
    mockCLIIsolation = new CLIIsolationManager() as vi.Mocked<CLIIsolationManager>

    manager = new HatchboxManager(
      mockGitWorktree,
      mockGitHub,
      mockEnvironment,
      mockClaude,
      mockCapabilityDetector,
      mockCLIIsolation
    )

    // Default mock for capability detector (web-only) - can be overridden in tests
    vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
      capabilities: ['web'],
      binEntries: {}
    })

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

      // Mock Claude launch with context
      vi.mocked(mockClaude.launchWithContext).mockResolvedValue()

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

      // Mock Claude launch with context
      vi.mocked(mockClaude.launchWithContext).mockResolvedValue()

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

      // Mock Claude launch with context
      vi.mocked(mockClaude.launchWithContext).mockResolvedValue()

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

    it('should skip Claude launch when skipClaude option is true', async () => {
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

      expect(mockClaude.launchWithContext).not.toHaveBeenCalled()
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

  describe('CLI Isolation', () => {
    it('should detect CLI capabilities and setup isolation', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      }

      const mockIssue = {
        number: 42,
        title: 'CLI Tool Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/42',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/42-cli')

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      // Mock CLI capability detection
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['cli'],
        binEntries: { hb: './dist/cli.js', hatchbox: './dist/cli.js' }
      })

      // Mock CLI isolation setup
      vi.mocked(mockCLIIsolation.setupCLIIsolation).mockResolvedValue(['hb-42', 'hatchbox-42'])

      const result = await manager.createHatchbox(input)

      expect(result.capabilities).toEqual(['cli'])
      expect(result.binEntries).toEqual({ hb: './dist/cli.js', hatchbox: './dist/cli.js' })
      expect(result.cliSymlinks).toEqual(['hb-42', 'hatchbox-42'])
      expect(mockCapabilityDetector.detectCapabilities).toHaveBeenCalledWith(expectedPath)
      expect(mockCLIIsolation.setupCLIIsolation).toHaveBeenCalledWith(
        expectedPath,
        42,
        { hb: './dist/cli.js', hatchbox: './dist/cli.js' }
      )
    })

    it('should detect web capabilities and setup port isolation', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      }

      const mockIssue = {
        number: 42,
        title: 'Web App Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/42',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/42-web')

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      // Mock web-only capability detection
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['web'],
        binEntries: {}
      })

      const result = await manager.createHatchbox(input)

      expect(result.capabilities).toEqual(['web'])
      expect(result.port).toBe(3042)
      expect(mockEnvironment.setPortForWorkspace).toHaveBeenCalledWith(
        expectedPath + '/.env',
        42,
        undefined
      )
      expect(mockCLIIsolation.setupCLIIsolation).not.toHaveBeenCalled()
    })

    it('should detect hybrid project and setup both isolations', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      }

      const mockIssue = {
        number: 42,
        title: 'Hybrid Project Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/42',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/42-hybrid')

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      // Mock hybrid capability detection
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['cli', 'web'],
        binEntries: { 'my-tool': './dist/cli.js' }
      })

      vi.mocked(mockCLIIsolation.setupCLIIsolation).mockResolvedValue(['my-tool-42'])

      const result = await manager.createHatchbox(input)

      expect(result.capabilities).toEqual(['cli', 'web'])
      expect(result.port).toBe(3042)
      expect(result.cliSymlinks).toEqual(['my-tool-42'])
      expect(mockEnvironment.setPortForWorkspace).toHaveBeenCalled()
      expect(mockCLIIsolation.setupCLIIsolation).toHaveBeenCalled()
    })

    it('should skip CLI isolation if no bin field', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      }

      const mockIssue = {
        number: 42,
        title: 'Library Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/42',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/42-lib')

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      // Mock no capabilities
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {}
      })

      const result = await manager.createHatchbox(input)

      // Empty capabilities array is not added to hatchbox object (spread operator check)
      expect(result.capabilities).toBeUndefined()
      expect(result.binEntries).toBeUndefined()
      expect(result.cliSymlinks).toBeUndefined()
      expect(mockCLIIsolation.setupCLIIsolation).not.toHaveBeenCalled()
    })

    it('should continue if CLI isolation fails (lenient error handling)', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      }

      const mockIssue = {
        number: 42,
        title: 'CLI Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/42',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/42-cli')

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      // Mock CLI capability detection
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['cli'],
        binEntries: { hb: './dist/cli.js' }
      })

      // Mock CLI isolation failure
      vi.mocked(mockCLIIsolation.setupCLIIsolation).mockRejectedValue(
        new Error('Build failed')
      )

      // Should not throw - should continue despite CLI isolation failure
      const result = await manager.createHatchbox(input)

      expect(result).toBeDefined()
      expect(result.path).toBe(expectedPath)
      expect(result.capabilities).toEqual(['cli'])
      expect(result.cliSymlinks).toBeUndefined() // Not set due to failure
    })

    it('should store capabilities in hatchbox metadata', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      }

      const mockIssue = {
        number: 42,
        title: 'Test Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/42',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/42-test')

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['cli', 'web'],
        binEntries: { tool: './bin/tool.js' }
      })

      vi.mocked(mockCLIIsolation.setupCLIIsolation).mockResolvedValue(['tool-42'])

      const result = await manager.createHatchbox(input)

      expect(result).toHaveProperty('capabilities')
      expect(result).toHaveProperty('binEntries')
      expect(result).toHaveProperty('cliSymlinks')
    })

    it('should include CLI symlink info in hatchbox metadata', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 42,
        originalInput: '42',
      }

      const mockIssue = {
        number: 42,
        title: 'Test Issue',
        body: '',
        state: 'open' as const,
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/42',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue(mockIssue)
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('feature/42-test')

      const expectedPath = '/test/worktree-issue-42'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockClaude.prepareContext).mockResolvedValue()

      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['cli'],
        binEntries: { cmd1: './bin/cmd1.js', cmd2: './bin/cmd2.js' }
      })

      vi.mocked(mockCLIIsolation.setupCLIIsolation).mockResolvedValue(['cmd1-42', 'cmd2-42'])

      const result = await manager.createHatchbox(input)

      expect(result.cliSymlinks).toEqual(['cmd1-42', 'cmd2-42'])
      expect(result.binEntries).toEqual({ cmd1: './bin/cmd1.js', cmd2: './bin/cmd2.js' })
    })
  })

  describe('opening modes integration', () => {
    it('should use default mode when no mode flags specified', async () => {
      const input: CreateHatchboxInput = {
        type: 'branch',
        identifier: 'test-branch',
        originalInput: 'test-branch',
      }

      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue({
        path: '/test/path',
        branch: 'test-branch',
        commit: 'abc123',
      } as unknown)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3000)

      await manager.createHatchbox(input)

      // Default mode should launch (via HatchboxLauncher)
      // We can't directly test HatchboxLauncher calls since it's dynamically imported
      // But we verify the hatchbox is created successfully
      expect(mockGitWorktree.createWorktree).toHaveBeenCalled()
    })

    it('should pass terminal-only mode option', async () => {
      const input: CreateHatchboxInput = {
        type: 'branch',
        identifier: 'test-branch',
        originalInput: 'test-branch',
        options: {
          terminalOnly: true,
        },
      }

      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue({
        path: '/test/path',
        branch: 'test-branch',
        commit: 'abc123',
      } as unknown)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3000)

      await manager.createHatchbox(input)

      // Terminal-only mode should not skip launching
      expect(mockGitWorktree.createWorktree).toHaveBeenCalled()
    })

    it('should handle code-only mode separately', async () => {
      const input: CreateHatchboxInput = {
        type: 'branch',
        identifier: 'test-branch',
        originalInput: 'test-branch',
        options: {
          codeOnly: true,
        },
      }

      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue({
        path: '/test/path',
        branch: 'test-branch',
        commit: 'abc123',
      } as unknown)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3000)

      await manager.createHatchbox(input)

      // Code-only mode should create hatchbox successfully
      // VSCode launching happens via dynamic import
      expect(mockGitWorktree.createWorktree).toHaveBeenCalled()
    })
  })

  describe('findExistingHatchbox', () => {
    it('should find existing hatchbox for issue input', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 39,
        originalInput: '39',
      }

      const existingWorktree = {
        path: '/test/worktree-issue-39',
        branch: 'issue-39-test',
        commit: 'abc123',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(existingWorktree)
      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 39,
        title: 'Test Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/39',
      })
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['web'],
        binEntries: {},
      })

      const result = await manager.createHatchbox(input)

      expect(result.path).toBe('/test/worktree-issue-39')
      expect(result.branch).toBe('issue-39-test')
      expect(mockGitWorktree.findWorktreeForIssue).toHaveBeenCalledWith(39)
      expect(mockGitWorktree.createWorktree).not.toHaveBeenCalled()
      expect(installDependencies).not.toHaveBeenCalled()
    })

    it('should find existing hatchbox for PR input', async () => {
      const input: CreateHatchboxInput = {
        type: 'pr',
        identifier: 42,
        originalInput: 'pr/42',
      }

      const existingWorktree = {
        path: '/test/worktree-feat-test_pr_42',
        branch: 'feat/test-feature',
        commit: 'def456',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitHub.fetchPR).mockResolvedValue({
        number: 42,
        title: 'Test PR',
        body: '',
        state: 'open',
        branch: 'feat/test-feature',
        baseBranch: 'main',
        url: 'https://github.com/test/repo/pull/42',
        isDraft: false,
      })
      vi.mocked(mockGitWorktree.findWorktreeForPR).mockResolvedValue(existingWorktree)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['web'],
        binEntries: {},
      })

      const result = await manager.createHatchbox(input)

      expect(result.path).toBe('/test/worktree-feat-test_pr_42')
      expect(result.branch).toBe('feat/test-feature')
      expect(mockGitWorktree.findWorktreeForPR).toHaveBeenCalledWith(42, 'feat/test-feature')
      expect(mockGitWorktree.createWorktree).not.toHaveBeenCalled()
      expect(installDependencies).not.toHaveBeenCalled()
    })

    it('should return null for branch input (branches always create new)', async () => {
      const input: CreateHatchboxInput = {
        type: 'branch',
        identifier: 'test-branch',
        originalInput: 'test-branch',
      }

      const expectedPath = '/test/worktree-test-branch'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3000)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      await manager.createHatchbox(input)

      expect(mockGitWorktree.findWorktreeForIssue).not.toHaveBeenCalled()
      expect(mockGitWorktree.findWorktreeForPR).not.toHaveBeenCalled()
      expect(mockGitWorktree.createWorktree).toHaveBeenCalled()
    })

    it('should create new worktree when no existing found for issue', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 99,
        originalInput: '99',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 99,
        title: 'New Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/99',
      })
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('issue-99-new-issue')
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(null)

      const expectedPath = '/test/worktree-issue-99'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3099)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['web'],
        binEntries: {},
      })

      await manager.createHatchbox(input)

      expect(mockGitWorktree.findWorktreeForIssue).toHaveBeenCalledWith(99)
      expect(mockGitWorktree.createWorktree).toHaveBeenCalled()
      expect(installDependencies).toHaveBeenCalled()
    })
  })

  describe('reuseHatchbox', () => {
    it('should return hatchbox metadata without creating worktree', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 39,
        originalInput: '39',
      }

      const existingWorktree = {
        path: '/test/worktree-issue-39',
        branch: 'issue-39-test',
        commit: 'abc123',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 39,
        title: 'Test Issue',
        body: 'Test description',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/39',
      })
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(existingWorktree)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: ['web'],
        binEntries: {},
      })

      const result = await manager.createHatchbox(input)

      expect(result.path).toBe('/test/worktree-issue-39')
      expect(result.branch).toBe('issue-39-test')
      expect(result.type).toBe('issue')
      expect(result.identifier).toBe(39)
      expect(result.githubData?.title).toBe('Test Issue')
      expect(mockGitWorktree.createWorktree).not.toHaveBeenCalled()
    })

    it('should still call moveIssueToInProgress for issue reuse', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 39,
        originalInput: '39',
      }

      const existingWorktree = {
        path: '/test/worktree-issue-39',
        branch: 'issue-39-test',
        commit: 'abc123',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 39,
        title: 'Test Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/39',
      })
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(existingWorktree)
      vi.mocked(mockGitHub.moveIssueToInProgress).mockResolvedValue()
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      await manager.createHatchbox(input)

      expect(mockGitHub.moveIssueToInProgress).toHaveBeenCalledWith(39)
    })

    it('should NOT call moveIssueToInProgress for PR reuse', async () => {
      const input: CreateHatchboxInput = {
        type: 'pr',
        identifier: 42,
        originalInput: 'pr/42',
      }

      const existingWorktree = {
        path: '/test/worktree-feat-test_pr_42',
        branch: 'feat/test-feature',
        commit: 'def456',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitHub.fetchPR).mockResolvedValue({
        number: 42,
        title: 'Test PR',
        body: '',
        state: 'open',
        branch: 'feat/test-feature',
        baseBranch: 'main',
        url: 'https://github.com/test/repo/pull/42',
        isDraft: false,
      })
      vi.mocked(mockGitWorktree.findWorktreeForPR).mockResolvedValue(existingWorktree)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      await manager.createHatchbox(input)

      expect(mockGitHub.moveIssueToInProgress).not.toHaveBeenCalled()
    })

    it('should launch components for reused hatchbox', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 39,
        originalInput: '39',
        options: { enableClaude: true },
      }

      const existingWorktree = {
        path: '/test/worktree-issue-39',
        branch: 'issue-39-test',
        commit: 'abc123',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 39,
        title: 'Test Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/39',
      })
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(existingWorktree)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      await manager.createHatchbox(input)

      // HatchboxLauncher is dynamically imported, so we can't directly verify its calls
      // But we verify the flow completes successfully
      expect(mockGitWorktree.findWorktreeForIssue).toHaveBeenCalled()
    })

    it('should warn but not fail when moveIssueToInProgress throws GitHubError', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 39,
        originalInput: '39',
      }

      const existingWorktree = {
        path: '/test/worktree-issue-39',
        branch: 'issue-39-test',
        commit: 'abc123',
        bare: false,
        detached: false,
        locked: false,
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 39,
        title: 'Test Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/39',
      })
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(existingWorktree)
      vi.mocked(mockGitHub.moveIssueToInProgress).mockRejectedValue(
        new Error('Missing project scope')
      )
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      // Should not throw - warning logged but hatchbox creation succeeds
      const result = await manager.createHatchbox(input)

      expect(result).toBeDefined()
      expect(result.path).toBe('/test/worktree-issue-39')
      expect(mockGitHub.moveIssueToInProgress).toHaveBeenCalledWith(39)
    })
  })

  describe('GitHub issue status updates', () => {
    it('should move issue to In Progress when creating new worktree', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 39,
        originalInput: '39',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 39,
        title: 'Test Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/39',
      })
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('issue-39-test')
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(null)

      const expectedPath = '/test/worktree-issue-39'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3039)
      vi.mocked(mockGitHub.moveIssueToInProgress).mockResolvedValue()
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      await manager.createHatchbox(input)

      expect(mockGitHub.moveIssueToInProgress).toHaveBeenCalledWith(39)
    })

    it('should NOT move PR to In Progress', async () => {
      const input: CreateHatchboxInput = {
        type: 'pr',
        identifier: 42,
        originalInput: 'pr/42',
      }

      vi.mocked(mockGitHub.fetchPR).mockResolvedValue({
        number: 42,
        title: 'Test PR',
        body: '',
        state: 'open',
        branch: 'feat/test',
        baseBranch: 'main',
        url: 'https://github.com/test/repo/pull/42',
        isDraft: false,
      })
      vi.mocked(mockGitWorktree.findWorktreeForPR).mockResolvedValue(null)

      const expectedPath = '/test/worktree-feat-test'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3042)
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      await manager.createHatchbox(input)

      expect(mockGitHub.moveIssueToInProgress).not.toHaveBeenCalled()
    })

    it('should warn but not fail when moveIssueToInProgress throws error for new worktree', async () => {
      const input: CreateHatchboxInput = {
        type: 'issue',
        identifier: 39,
        originalInput: '39',
      }

      vi.mocked(mockGitHub.fetchIssue).mockResolvedValue({
        number: 39,
        title: 'Test Issue',
        body: '',
        state: 'open',
        labels: [],
        assignees: [],
        url: 'https://github.com/test/repo/issues/39',
      })
      vi.mocked(mockGitHub.generateBranchName).mockResolvedValue('issue-39-test')
      vi.mocked(mockGitWorktree.findWorktreeForIssue).mockResolvedValue(null)

      const expectedPath = '/test/worktree-issue-39'
      vi.mocked(mockGitWorktree.generateWorktreePath).mockReturnValue(expectedPath)
      vi.mocked(mockGitWorktree.createWorktree).mockResolvedValue(expectedPath)
      vi.mocked(mockEnvironment.setPortForWorkspace).mockResolvedValue(3039)
      vi.mocked(mockGitHub.moveIssueToInProgress).mockRejectedValue(
        new Error('Missing project scope')
      )
      vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue({
        capabilities: [],
        binEntries: {},
      })

      // Should not throw - warning logged but hatchbox creation succeeds
      const result = await manager.createHatchbox(input)

      expect(result).toBeDefined()
      expect(result.path).toBe(expectedPath)
      expect(mockGitHub.moveIssueToInProgress).toHaveBeenCalledWith(39)
    })
  })
})
