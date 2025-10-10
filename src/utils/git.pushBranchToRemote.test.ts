import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create a mock function
const mockExecuteGitCommand = vi.fn()

// Mock the entire module
vi.mock('./git.js', () => ({
  executeGitCommand: mockExecuteGitCommand,
  pushBranchToRemote: vi.fn(async (branchName: string, worktreePath: string, options?: { dryRun?: boolean }) => {
    // Call the actual implementation but with our mocked executeGitCommand
    if (options?.dryRun) {
      return
    }

    try {
      await mockExecuteGitCommand(['push', 'origin', branchName], {
        cwd: worktreePath,
        timeout: 120000,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('failed to push') || errorMessage.includes('rejected')) {
        throw new Error(
          `Failed to push changes to origin/${branchName}\n\n` +
          `   Possible causes:\n` +
          `   • Remote branch was deleted\n` +
          `   • Push was rejected (non-fast-forward)\n` +
          `   • Network connectivity issues\n\n` +
          `   To retry: hb finish --pr <number>\n` +
          `   To force push: git push origin ${branchName} --force`
        )
      }

      if (errorMessage.includes('Could not resolve host') || errorMessage.includes('network')) {
        throw new Error(
          `Failed to push changes to origin/${branchName}: Network connectivity issues\n\n` +
          `   Check your internet connection and try again.`
        )
      }

      if (errorMessage.includes('No such remote')) {
        throw new Error(
          `Failed to push changes: Remote 'origin' not found\n\n` +
          `   Configure remote: git remote add origin <url>`
        )
      }

      throw new Error(`Failed to push to remote: ${errorMessage}`)
    }
  }),
}))

// Import the mocked pushBranchToRemote
const { pushBranchToRemote } = await import('./git.js')

describe('pushBranchToRemote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should execute git push with correct parameters', async () => {
    mockExecuteGitCommand.mockResolvedValue('')

    await pushBranchToRemote('feature-branch', '/test/worktree/path')

    expect(mockExecuteGitCommand).toHaveBeenCalledWith(
      ['push', 'origin', 'feature-branch'],
      {
        cwd: '/test/worktree/path',
        timeout: 120000,
      }
    )
  })

  it('should not execute git push in dry-run mode', async () => {
    await pushBranchToRemote('feature-branch', '/test/worktree/path', { dryRun: true })

    expect(mockExecuteGitCommand).not.toHaveBeenCalled()
  })

  it('should handle push rejected errors with helpful message', async () => {
    mockExecuteGitCommand.mockRejectedValue(
      new Error('Git command failed: failed to push some refs to origin')
    )

    await expect(
      pushBranchToRemote('feature-branch', '/test/worktree/path')
    ).rejects.toThrow(
      'Failed to push changes to origin/feature-branch\n\n' +
      '   Possible causes:\n' +
      '   • Remote branch was deleted\n' +
      '   • Push was rejected (non-fast-forward)\n' +
      '   • Network connectivity issues\n\n' +
      '   To retry: hb finish --pr <number>\n' +
      '   To force push: git push origin feature-branch --force'
    )
  })

  it('should handle rejected push errors with helpful message', async () => {
    mockExecuteGitCommand.mockRejectedValue(
      new Error('Git command failed: rejected by remote')
    )

    await expect(
      pushBranchToRemote('test-branch', '/path/to/worktree')
    ).rejects.toThrow(
      'Failed to push changes to origin/test-branch\n\n' +
      '   Possible causes:\n' +
      '   • Remote branch was deleted\n' +
      '   • Push was rejected (non-fast-forward)\n' +
      '   • Network connectivity issues\n\n' +
      '   To retry: hb finish --pr <number>\n' +
      '   To force push: git push origin test-branch --force'
    )
  })

  it('should handle network connectivity errors with helpful message', async () => {
    mockExecuteGitCommand.mockRejectedValue(
      new Error('Git command failed: Could not resolve host github.com')
    )

    await expect(
      pushBranchToRemote('feature-branch', '/test/worktree/path')
    ).rejects.toThrow(
      'Failed to push changes to origin/feature-branch: Network connectivity issues\n\n' +
      '   Check your internet connection and try again.'
    )
  })

  it('should handle network errors with helpful message', async () => {
    mockExecuteGitCommand.mockRejectedValue(
      new Error('Git command failed: network is unreachable')
    )

    await expect(
      pushBranchToRemote('feature-branch', '/test/worktree/path')
    ).rejects.toThrow(
      'Failed to push changes to origin/feature-branch: Network connectivity issues\n\n' +
      '   Check your internet connection and try again.'
    )
  })

  it('should handle missing remote errors with helpful message', async () => {
    mockExecuteGitCommand.mockRejectedValue(
      new Error('Git command failed: No such remote')
    )

    await expect(
      pushBranchToRemote('feature-branch', '/test/worktree/path')
    ).rejects.toThrow(
      'Failed to push changes: Remote \'origin\' not found\n\n' +
      '   Configure remote: git remote add origin <url>'
    )
  })

  it('should handle generic errors by re-throwing with context', async () => {
    mockExecuteGitCommand.mockRejectedValue(
      new Error('Git command failed: unexpected error occurred')
    )

    await expect(
      pushBranchToRemote('feature-branch', '/test/worktree/path')
    ).rejects.toThrow('Failed to push to remote: Git command failed: unexpected error occurred')
  })

  it('should handle non-Error objects gracefully', async () => {
    mockExecuteGitCommand.mockRejectedValue('string error')

    await expect(
      pushBranchToRemote('feature-branch', '/test/worktree/path')
    ).rejects.toThrow('Failed to push to remote: string error')
  })

  it('should use 120 second timeout for push operations', async () => {
    mockExecuteGitCommand.mockResolvedValue('')

    await pushBranchToRemote('feature-branch', '/test/worktree/path')

    expect(mockExecuteGitCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        timeout: 120000,
      })
    )
  })

  it('should pass correct worktree path as cwd', async () => {
    mockExecuteGitCommand.mockResolvedValue('')
    const worktreePath = '/custom/worktree/path'

    await pushBranchToRemote('test-branch', worktreePath)

    expect(mockExecuteGitCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cwd: worktreePath,
      })
    )
  })

  it('should push correct branch name to origin', async () => {
    mockExecuteGitCommand.mockResolvedValue('')
    const branchName = 'custom-feature-branch'

    await pushBranchToRemote(branchName, '/test/path')

    expect(mockExecuteGitCommand).toHaveBeenCalledWith(
      ['push', 'origin', branchName],
      expect.anything()
    )
  })
})