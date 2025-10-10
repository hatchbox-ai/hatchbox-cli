import { describe, it, expect, beforeEach, vi } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { NeonProvider } from '../../../src/lib/providers/NeonProvider.js'
import { promptConfirmation } from '../../../src/utils/prompt.js'

// Mock execa for CLI command execution
vi.mock('execa')

// Mock prompt utility
vi.mock('../../../src/utils/prompt.js', () => ({
  promptConfirmation: vi.fn().mockResolvedValue(false), // Default: decline confirmations
}))

describe('NeonProvider', () => {
  let provider: NeonProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new NeonProvider({
      projectId: 'test-project-id',
      parentBranch: 'development'
    })
  })

  describe('isCliAvailable', () => {
    it('should return true when neon CLI is available', async () => {
      vi.mocked(execa).mockResolvedValue({ stdout: '', stderr: '' } as ExecaReturnValue<string>)

      const result = await provider.isCliAvailable()

      expect(result).toBe(true)
      expect(execa).toHaveBeenCalledWith('command', ['-v', 'neon'], expect.any(Object))
    })

    it('should return false when neon CLI is not available', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('command not found'))

      const result = await provider.isCliAvailable()

      expect(result).toBe(false)
    })
  })

  describe('isAuthenticated', () => {
    it('should return true when authenticated', async () => {
      // First call: CLI available
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '', stderr: '' } as ExecaReturnValue<string>)
      // Second call: neon me succeeds
      vi.mocked(execa).mockResolvedValueOnce({ stdout: 'user@example.com', stderr: '' } as ExecaReturnValue<string>)

      const result = await provider.isAuthenticated()

      expect(result).toBe(true)
      expect(execa).toHaveBeenCalledWith('neon', ['me'], expect.any(Object))
    })

    it('should return false when not authenticated', async () => {
      // First call: CLI available
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '', stderr: '' } as ExecaReturnValue<string>)
      // Second call: neon me fails
      vi.mocked(execa).mockRejectedValueOnce(new Error('not authenticated'))

      const result = await provider.isAuthenticated()

      expect(result).toBe(false)
    })

    it('should return false when CLI not available', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('command not found'))

      const result = await provider.isAuthenticated()

      expect(result).toBe(false)
    })
  })

  describe('sanitizeBranchName', () => {
    it('should replace forward slashes with underscores', () => {
      const result = provider.sanitizeBranchName('feat/issue-5-database')

      expect(result).toBe('feat_issue-5-database')
    })

    it('should handle multiple slashes', () => {
      const result = provider.sanitizeBranchName('feature/issue/25/test')

      expect(result).toBe('feature_issue_25_test')
    })

    it('should return unchanged string with no slashes', () => {
      const result = provider.sanitizeBranchName('issue-25')

      expect(result).toBe('issue-25')
    })

    it('should handle empty string', () => {
      const result = provider.sanitizeBranchName('')

      expect(result).toBe('')
    })
  })

  describe('listBranches', () => {
    it('should return array of branch names', async () => {
      const mockBranches = [
        { name: 'main', id: 'br-main-123' },
        { name: 'development', id: 'br-dev-456' },
        { name: 'feat_issue-5-database', id: 'br-feat-789' },
      ]
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.listBranches()

      expect(result).toEqual(['main', 'development', 'feat_issue-5-database'])
      expect(execa).toHaveBeenCalledWith(
        'neon',
        ['branches', 'list', '--project-id', 'test-project-id', '--output', 'json'],
        expect.any(Object)
      )
    })

    it('should parse JSON output correctly', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '[{"name":"branch1","id":"123"},{"name":"branch2","id":"456"}]',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.listBranches()

      expect(result).toEqual(['branch1', 'branch2'])
    })

    it('should throw error when CLI fails', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('CLI error'))

      await expect(provider.listBranches()).rejects.toThrow('CLI error')
    })

    it('should handle empty branch list', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.listBranches()

      expect(result).toEqual([])
    })
  })

  describe('branchExists', () => {
    it('should return true when branch exists', async () => {
      const mockBranches = [
        { name: 'main', id: 'br-main-123' },
        { name: 'feat_issue-5-database', id: 'br-feat-789' },
      ]
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.branchExists('feat_issue-5-database')

      expect(result).toBe(true)
    })

    it('should return false when branch does not exist', async () => {
      const mockBranches = [{ name: 'main', id: 'br-main-123' }]
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.branchExists('nonexistent-branch')

      expect(result).toBe(false)
    })

    it('should handle empty branch list', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.branchExists('any-branch')

      expect(result).toBe(false)
    })
  })

  describe('getConnectionString', () => {
    it('should return connection string for existing branch', async () => {
      const mockConnectionString = 'postgresql://user:pass@ep-abc123.us-east-1.neon.tech/dbname'
      vi.mocked(execa).mockResolvedValue({
        stdout: mockConnectionString,
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.getConnectionString('feat_issue-5-database')

      expect(result).toBe(mockConnectionString)
      expect(execa).toHaveBeenCalledWith(
        'neon',
        ['connection-string', '--branch', 'feat_issue-5-database', '--project-id', 'test-project-id'],
        expect.any(Object)
      )
    })

    it('should throw error when branch does not exist', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('branch not found'))

      await expect(provider.getConnectionString('nonexistent-branch')).rejects.toThrow(
        'branch not found'
      )
    })

    it('should handle pooled connection string', async () => {
      const mockConnectionString =
        'postgresql://user:pass@ep-abc123-pooler.us-east-1.neon.tech/dbname'
      vi.mocked(execa).mockResolvedValue({
        stdout: mockConnectionString,
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.getConnectionString('branch-name')

      expect(result).toBe(mockConnectionString)
    })
  })

  describe('findPreviewBranch', () => {
    it('should find preview database with slash pattern (preview/branch-name)', async () => {
      const mockBranches = [
        { name: 'main', id: 'br-main-123' },
        { name: 'preview/feat-issue-5-database-branch-mgmt', id: 'br-preview-456' },
      ]
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.findPreviewBranch('feat-issue-5-database-branch-mgmt')

      expect(result).toBe('preview/feat-issue-5-database-branch-mgmt')
    })

    it('should find preview database with underscore pattern (preview_branch_name)', async () => {
      const mockBranches = [
        { name: 'main', id: 'br-main-123' },
        { name: 'preview_feat_issue-5-database-branch-mgmt', id: 'br-preview-456' },
      ]
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.findPreviewBranch('feat/issue-5-database-branch-mgmt')

      expect(result).toBe('preview_feat_issue-5-database-branch-mgmt')
    })

    it('should return null when no preview database exists', async () => {
      const mockBranches = [{ name: 'main', id: 'br-main-123' }]
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.findPreviewBranch('feat-issue-5-database-branch-mgmt')

      expect(result).toBe(null)
    })

    it('should prioritize exact slash pattern over underscore pattern', async () => {
      const mockBranches = [
        { name: 'preview/feat-issue-5', id: 'br-preview-1' },
        { name: 'preview_feat_issue-5', id: 'br-preview-2' },
      ]
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.findPreviewBranch('feat-issue-5')

      expect(result).toBe('preview/feat-issue-5')
    })
  })

  describe('createBranch', () => {
    it('should check for preview database first', async () => {
      const mockBranches = [
        { name: 'preview/feat-issue-5', id: 'br-preview-123' },
      ]
      // First call: list branches for preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: get connection string
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://user:pass@ep-preview-123.us-east-1.neon.tech/dbname',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.createBranch('feat-issue-5')

      expect(result).toBe('postgresql://user:pass@ep-preview-123.us-east-1.neon.tech/dbname')
      // Should not call create, only list and get connection string
      expect(execa).toHaveBeenCalledTimes(2)
    })

    it('should return preview connection string if found', async () => {
      const mockBranches = [
        { name: 'preview_feat_issue-5', id: 'br-preview-456' },
      ]
      const mockConnectionString = 'postgresql://user:pass@ep-preview-456.us-east-1.neon.tech/dbname'
      // First call: list branches for slash pattern
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: list branches for underscore pattern
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      // Third call: get connection string
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: mockConnectionString,
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.createBranch('feat/issue-5')

      expect(result).toBe(mockConnectionString)
    })

    it('should create new branch when preview not found', async () => {
      const mockConnectionString = 'postgresql://user:pass@ep-new-123.us-east-1.neon.tech/dbname'
      // First call: listBranches for slash pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: listBranches for underscore pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Third call: create branch
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'Branch created successfully',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Fourth call: get connection string
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: mockConnectionString,
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.createBranch('feat/issue-5')

      expect(result).toBe(mockConnectionString)
      expect(execa).toHaveBeenCalledWith(
        'neon',
        [
          'branches',
          'create',
          '--name',
          'feat_issue-5',
          '--parent',
          'development',
          '--project-id',
          'test-project-id',
        ],
        expect.any(Object)
      )
    })

    it('should sanitize branch name before creation', async () => {
      // First call: listBranches for slash pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: listBranches for underscore pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Third call: create branch
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'Branch created',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Fourth call: get connection string
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://connection-string',
        stderr: '',
      } as ExecaReturnValue<string>)

      await provider.createBranch('feature/issue/25/test')

      expect(execa).toHaveBeenCalledWith(
        'neon',
        [
          'branches',
          'create',
          '--name',
          'feature_issue_25_test',
          '--parent',
          'development',
          '--project-id',
          'test-project-id',
        ],
        expect.any(Object)
      )
    })

    it('should throw error when creation fails', async () => {
      // First call: listBranches for slash pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: listBranches for underscore pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Third call: create branch fails
      vi.mocked(execa).mockRejectedValueOnce(new Error('Failed to create branch'))

      await expect(provider.createBranch('feat-issue-5')).rejects.toThrow(
        'Failed to create branch'
      )
    })

    it('should use custom parent branch if provided', async () => {
      // First call: listBranches for slash pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: listBranches for underscore pattern preview check
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Third call: create branch
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'Branch created',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Fourth call: get connection string
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://connection-string',
        stderr: '',
      } as ExecaReturnValue<string>)

      await provider.createBranch('feat-issue-5', 'staging')

      expect(execa).toHaveBeenCalledWith(
        'neon',
        [
          'branches',
          'create',
          '--name',
          'feat-issue-5',
          '--parent',
          'staging',
          '--project-id',
          'test-project-id',
        ],
        expect.any(Object)
      )
    })
  })

  describe('deleteBranch', () => {
    it('should detect preview database and prompt for confirmation', async () => {
      const mockBranches = [
        { name: 'preview/feat-issue-5', id: 'br-preview-123' },
      ]
      // Only listBranches call for preview detection
      vi.mocked(execa).mockResolvedValue({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      provider = new NeonProvider({
        projectId: 'test-project-id',
        parentBranch: 'development'
      })

      await provider.deleteBranch('feat-issue-5', true)

      expect(vi.mocked(promptConfirmation)).toHaveBeenCalled()
      // Should call listBranches for preview check only
      expect(execa).toHaveBeenCalledTimes(1)
    })

    it('should skip deletion when user declines preview deletion', async () => {
      const mockBranches = [
        { name: 'preview_feat_issue-5', id: 'br-preview-123' },
      ]
      // First call: listBranches for slash pattern
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: listBranches for underscore pattern
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      provider = new NeonProvider({
        projectId: 'test-project-id',
        parentBranch: 'development'
      })

      await provider.deleteBranch('feat/issue-5', true)

      // Should call listBranches twice (slash and underscore patterns), not delete
      expect(execa).toHaveBeenCalledTimes(2)
    })

    it('should delete preview database when user confirms', async () => {
      const mockBranches = [
        { name: 'preview/feat-issue-5', id: 'br-preview-123' },
      ]
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'Branch deleted',
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(promptConfirmation).mockResolvedValueOnce(true)
      provider = new NeonProvider({
        projectId: 'test-project-id',
        parentBranch: 'development'
      })

      await provider.deleteBranch('feat-issue-5', true)

      expect(vi.mocked(promptConfirmation)).toHaveBeenCalled()
      expect(execa).toHaveBeenCalledWith(
        'neon',
        ['branches', 'delete', 'preview/feat-issue-5', '--project-id', 'test-project-id'],
        expect.any(Object)
      )
    })

    it('should delete regular branch without confirmation', async () => {
      const mockBranches = [
        { name: 'feat-issue-5', id: 'br-feat-123' },
      ]
      // First call: check if branch exists
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      // Second call: delete branch
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'Branch deleted',
        stderr: '',
      } as ExecaReturnValue<string>)

      await provider.deleteBranch('feat-issue-5', false)

      expect(vi.mocked(promptConfirmation)).not.toHaveBeenCalled()
      expect(execa).toHaveBeenCalledWith(
        'neon',
        ['branches', 'delete', 'feat-issue-5', '--project-id', 'test-project-id'],
        expect.any(Object)
      )
    })

    it('should handle non-existent branch gracefully', async () => {
      vi.mocked(execa).mockResolvedValue({
        stdout: '[]',
        stderr: '',
      } as ExecaReturnValue<string>)

      // Should not throw, just return silently
      await expect(provider.deleteBranch('nonexistent-branch', false)).resolves.toBeUndefined()
    })
  })

  describe('getBranchNameFromEndpoint', () => {
    it('should extract endpoint ID from connection string', async () => {
      const mockBranches = [
        { name: 'main', id: 'br-main-123' },
        { name: 'feat-issue-5', id: 'br-feat-456' },
      ]
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://user:pass@ep-main-123.us-east-1.neon.tech/dbname',
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://user:pass@ep-abc123.us-east-1.neon.tech/dbname',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.getBranchNameFromEndpoint('ep-abc123')

      expect(result).toBe('feat-issue-5')
    })

    it('should find branch name by endpoint ID', async () => {
      const mockBranches = [{ name: 'test-branch', id: 'br-test-123' }]
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://user:pass@ep-target-endpoint.us-east-1.neon.tech/dbname',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.getBranchNameFromEndpoint('ep-target-endpoint')

      expect(result).toBe('test-branch')
    })

    it('should handle pooled connections (ep-xxx-pooler)', async () => {
      const mockBranches = [{ name: 'pooled-branch', id: 'br-pooled-123' }]
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://user:pass@ep-pooled-123-pooler.us-east-1.neon.tech/dbname',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.getBranchNameFromEndpoint('ep-pooled-123')

      expect(result).toBe('pooled-branch')
    })

    it('should handle direct connections (ep-xxx)', async () => {
      const mockBranches = [{ name: 'direct-branch', id: 'br-direct-456' }]
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://user:pass@ep-direct-456.us-east-1.neon.tech/dbname',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.getBranchNameFromEndpoint('ep-direct-456')

      expect(result).toBe('direct-branch')
    })

    it('should return null when endpoint not found', async () => {
      const mockBranches = [{ name: 'test-branch', id: 'br-test-123' }]
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: JSON.stringify(mockBranches),
        stderr: '',
      } as ExecaReturnValue<string>)
      vi.mocked(execa).mockResolvedValueOnce({
        stdout: 'postgresql://user:pass@ep-different-endpoint.us-east-1.neon.tech/dbname',
        stderr: '',
      } as ExecaReturnValue<string>)

      const result = await provider.getBranchNameFromEndpoint('ep-nonexistent')

      expect(result).toBe(null)
    })
  })
})
