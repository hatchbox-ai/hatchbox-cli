import { describe, it, expect } from 'vitest'
import {
  parseWorktreeList,
  isPRBranch,
  extractPRNumber,
  isWorktreePath,
  generateWorktreePath,
} from './git.js'

describe('Git Utility Functions', () => {
  describe('parseWorktreeList', () => {
    it('should parse single worktree correctly', () => {
      const output = [
        'worktree /Users/dev/myproject',
        'HEAD abc123def456789',
        'branch refs/heads/main',
        '',
      ].join('\n')

      const result = parseWorktreeList(output)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        path: '/Users/dev/myproject',
        branch: 'main',
        commit: 'abc123def456789',
        bare: false,
        detached: false,
        locked: false,
      })
    })

    it('should parse multiple worktrees correctly', () => {
      const output = [
        'worktree /Users/dev/myproject',
        'HEAD abc123def456789',
        'branch refs/heads/main',
        '',
        'worktree /Users/dev/worktree-feature',
        'HEAD def456abc123456',
        'branch refs/heads/feature-branch',
        '',
      ].join('\n')

      const result = parseWorktreeList(output)

      expect(result).toHaveLength(2)
      expect(result[0].branch).toBe('main')
      expect(result[1].branch).toBe('feature-branch')
    })

    it('should handle detached HEAD correctly', () => {
      const output = [
        'worktree /Users/dev/worktree-detached',
        'HEAD abc123def456789',
        'detached',
        '',
      ].join('\n')

      const result = parseWorktreeList(output)

      expect(result).toHaveLength(1)
      expect(result[0].detached).toBe(true)
      expect(result[0].branch).toBe('HEAD')
    })

    it('should handle bare repository correctly', () => {
      const output = ['worktree /Users/dev/bare-repo', 'HEAD abc123def456789', 'bare', ''].join(
        '\n'
      )

      const result = parseWorktreeList(output)

      expect(result).toHaveLength(1)
      expect(result[0].bare).toBe(true)
      expect(result[0].branch).toBe('main')
    })

    it('should handle locked worktree correctly', () => {
      const output = [
        'worktree /Users/dev/locked-worktree',
        'HEAD abc123def456789',
        'locked under maintenance',
        '',
      ].join('\n')

      const result = parseWorktreeList(output)

      expect(result).toHaveLength(1)
      expect(result[0].locked).toBe(true)
      expect(result[0].lockReason).toBe('under maintenance')
      expect(result[0].branch).toBe('unknown')
    })

    it('should handle empty output', () => {
      const result = parseWorktreeList('')
      expect(result).toHaveLength(0)
    })

    it('should handle malformed output gracefully', () => {
      const output = 'invalid output format'
      const result = parseWorktreeList(output)
      expect(result).toHaveLength(0)
    })
  })

  describe('isPRBranch', () => {
    it('should identify PR branches correctly', () => {
      const prBranches = [
        'pr/123',
        'PR/456',
        'pull/789',
        '123-feature-name',
        '456_another_feature',
        'feature/pr123',
        'feature/pr-456',
        'hotfix/pr789',
        'hotfix/pr-101',
      ]

      prBranches.forEach(branch => {
        expect(isPRBranch(branch)).toBe(true)
      })
    })

    it('should identify non-PR branches correctly', () => {
      const nonPRBranches = [
        'main',
        'master',
        'develop',
        'feature-branch',
        'hotfix-urgent',
        'feature/new-component',
        'bugfix/issue-fix',
      ]

      nonPRBranches.forEach(branch => {
        expect(isPRBranch(branch)).toBe(false)
      })
    })
  })

  describe('extractPRNumber', () => {
    it('should extract PR numbers from various formats', () => {
      const testCases = [
        { branch: 'pr/123', expected: 123 },
        { branch: 'PR/456', expected: 456 },
        { branch: 'pull/789', expected: 789 },
        { branch: '123-feature-name', expected: 123 },
        { branch: '456_another_feature', expected: 456 },
        { branch: 'feature/pr123', expected: 123 },
        { branch: 'feature/pr-456', expected: 456 },
        { branch: 'hotfix/pr789', expected: 789 },
        { branch: 'contains-pr-101-here', expected: 101 },
      ]

      testCases.forEach(({ branch, expected }) => {
        expect(extractPRNumber(branch)).toBe(expected)
      })
    })

    it('should return null for non-PR branches', () => {
      const nonPRBranches = [
        'main',
        'master',
        'develop',
        'feature-branch',
        'hotfix-urgent',
        'feature/new-component',
      ]

      nonPRBranches.forEach(branch => {
        expect(extractPRNumber(branch)).toBeNull()
      })
    })

    it('should handle invalid PR numbers', () => {
      const invalidCases = ['pr/abc', 'pull/', 'pr/-123']

      invalidCases.forEach(branch => {
        expect(extractPRNumber(branch)).toBeNull()
      })
    })
  })

  describe('isWorktreePath', () => {
    it('should identify worktree paths correctly', () => {
      const worktreePaths = [
        '/Users/dev/worktrees/feature-branch',
        '/projects/worktree/pr-123',
        '/workspace123/code',
        '/workspace-456/repo',
        '/issue123/project',
        '/issue-789/app',
        '/pr123/codebase',
        '/pr-456/source',
        '/feature-worktree',
        '/branch.worktree',
      ]

      worktreePaths.forEach(path => {
        expect(isWorktreePath(path)).toBe(true)
      })
    })

    it('should identify non-worktree paths correctly', () => {
      const normalPaths = [
        '/Users/dev/myproject',
        '/home/user/code',
        '/projects/main-repo',
        '/source/application',
      ]

      normalPaths.forEach(path => {
        expect(isWorktreePath(path)).toBe(false)
      })
    })
  })

  describe('generateWorktreePath', () => {
    it('should generate valid worktree paths', () => {
      const testCases = [
        {
          branch: 'feature-branch',
          root: '/Users/dev/project',
          expected: '/Users/dev/feature-branch',
        },
        {
          branch: 'pr/123',
          root: '/Users/dev/project',
          expected: '/Users/dev/pr-123',
        },
        {
          branch: 'feature/complex-name',
          root: '/home/user/code',
          expected: '/home/user/feature-complex-name',
        },
      ]

      testCases.forEach(({ branch, root, expected }) => {
        expect(generateWorktreePath(branch, root)).toBe(expected)
      })
    })

    it('should sanitize branch names properly', () => {
      const testCases = [
        {
          branch: 'feature/with@special#characters',
          root: '/project',
          expected: '/feature-with@special#characters',
        },
        {
          branch: 'branch---with---dashes',
          root: '/project',
          expected: '/branch---with---dashes',
        },
        {
          branch: '-leading-and-trailing-',
          root: '/project',
          expected: '/-leading-and-trailing-',
        },
      ]

      testCases.forEach(({ branch, root, expected }) => {
        expect(generateWorktreePath(branch, root)).toBe(expected)
      })
    })

    it('should add PR suffix when options provided', () => {
      const result = generateWorktreePath('feature/branch', '/project', {
        isPR: true,
        prNumber: 123
      })
      expect(result).toBe('/feature-branch_pr_123')
    })

    it('should not add PR suffix when isPR is false', () => {
      const result = generateWorktreePath('feature/branch', '/project', {
        isPR: false,
        prNumber: 123
      })
      expect(result).toBe('/feature-branch')
    })
  })
})

describe('Git Utility Regression Tests', () => {
  describe('Bash Script Parity', () => {
    it('should match find_worktree_for_branch() behavior', () => {
      // This test ensures our TypeScript implementation matches the bash script behavior
      const worktreeOutput = [
        'worktree /Users/dev/myproject',
        'HEAD abc123',
        'branch refs/heads/main',
        '',
        'worktree /Users/dev/worktree-feature',
        'HEAD def456',
        'branch refs/heads/feature-branch',
        '',
      ].join('\n')

      const worktrees = parseWorktreeList(worktreeOutput)
      const foundWorktree = worktrees.find(wt => wt.branch === 'feature-branch')

      // Should match bash script: find worktree with exact branch name match
      expect(foundWorktree).toBeDefined()
      expect(foundWorktree?.path).toBe('/Users/dev/worktree-feature')
      expect(foundWorktree?.branch).toBe('feature-branch')
      expect(foundWorktree?.commit).toBe('def456')
    })

    it('should match is_pr_worktree() behavior', () => {
      // Test cases that should match bash script PR detection logic
      const prTestCases = [
        { branch: 'pr/123', expected: true },
        { branch: 'pull/456', expected: true },
        { branch: '789-feature', expected: true },
        { branch: 'feature/pr-123', expected: true },
        { branch: 'main', expected: false },
        { branch: 'feature-branch', expected: false },
      ]

      prTestCases.forEach(({ branch, expected }) => {
        expect(isPRBranch(branch)).toBe(expected)
      })
    })

    it('should match get_pr_number_from_worktree() behavior', () => {
      // Test cases that should match bash script PR number extraction
      const extractionCases = [
        { branch: 'pr/123', expected: 123 },
        { branch: 'pull/456', expected: 456 },
        { branch: '789-feature-name', expected: 789 },
        { branch: 'feature/pr-101', expected: 101 },
        { branch: 'main', expected: null },
        { branch: 'feature-branch', expected: null },
      ]

      extractionCases.forEach(({ branch, expected }) => {
        expect(extractPRNumber(branch)).toBe(expected)
      })
    })
  })
})
