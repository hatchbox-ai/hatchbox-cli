import { describe, it, expect, beforeEach, vi } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { findAllBranchesForIssue } from '../../src/utils/git.js'

// Mock execa which executeGitCommand uses
vi.mock('execa')

describe('findAllBranchesForIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Pattern Matching', () => {
    it('should find branch with pattern: issue-25', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25'])
    })

    it('should find branch with pattern: issue/25', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  issue/25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue/25'])
    })

    it('should find branch with pattern: 25-feature-name', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  25-feature-name\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['25-feature-name'])
    })

    it('should find branch with pattern: feat-25', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  feat-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['feat-25'])
    })

    it('should find branch with pattern: feat/issue-25', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  feat/issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['feat/issue-25'])
    })

    it('should find branch with pattern: bugfix_issue-25', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  bugfix_issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['bugfix_issue-25'])
    })

    it('should find branch with pattern: feature/issue-25-add-auth', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  feature/issue-25-add-auth\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['feature/issue-25-add-auth'])
    })
  })

  describe('False Positive Prevention', () => {
    it('should NOT match issue-425 when searching for 42', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  issue-425\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(42)

      expect(result).toEqual([])
    })

    it('should NOT match tissue-25 when searching for 25', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  tissue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual([])
    })

    it('should NOT match 142-feature when searching for 42', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  142-feature\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(42)

      expect(result).toEqual([])
    })

    it('should match exact issue at string boundaries', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  42-exact-match\n  feat-42\n  issue-42-end\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(42)

      expect(result).toEqual(['42-exact-match', 'feat-42', 'issue-42-end'])
    })
  })

  describe('Protected Branch Filtering', () => {
    it('should exclude main branch', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  main\n  issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25'])
    })

    it('should exclude master branch', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  master\n  issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25'])
    })

    it('should exclude develop branch', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  develop\n  issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25'])
    })

    it('should include all other matching branches', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  main\n  master\n  develop\n  issue-25\n  feat-25\n  25-test\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25', 'feat-25', '25-test'])
    })
  })

  describe('Branch Name Cleaning', () => {
    it('should remove origin/ prefix from remote branches', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  origin/issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25'])
    })

    it('should clean git status markers (* + spaces)', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '* issue-25\n+ feat-25\n  25-test\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25', 'feat-25', '25-test'])
    })

    it('should handle both local and remote branches', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  issue-25\n  remotes/origin/issue-25\n  remotes/origin/feat-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      // Should deduplicate issue-25 (appears as both local and remote)
      expect(result).toEqual(['issue-25', 'feat-25'])
    })
  })

  describe('Edge Cases', () => {
    it('should return empty array when no matches found', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  main\n  master\n  feature-branch\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(99)

      expect(result).toEqual([])
    })

    it('should handle single matching branch', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  issue-42\n  main\n  other-branch\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(42)

      expect(result).toEqual(['issue-42'])
    })

    it('should handle multiple matching branches (5+)', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  issue-25\n  25-feature\n  feat-25\n  bugfix/issue-25\n  test-25-fix\n  hotfix_25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual([
        'issue-25',
        '25-feature',
        'feat-25',
        'bugfix/issue-25',
        'test-25-fix',
        'hotfix_25'
      ])
    })

    it('should handle branches with special characters', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  issue-25_special\n  feat/issue-25-with-dash\n  test_25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25_special', 'feat/issue-25-with-dash', 'test_25'])
    })

    it('should skip remotes/origin/HEAD pointer', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '  remotes/origin/HEAD -> origin/main\n  issue-25\n  remotes/origin/issue-25\n' } as ExecaReturnValue<string>)

      const result = await findAllBranchesForIssue(25)

      expect(result).toEqual(['issue-25'])
    })
  })
})
