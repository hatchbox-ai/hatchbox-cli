import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DatabaseManager } from '../../src/lib/DatabaseManager.js'
import type { DatabaseProvider } from '../../src/types/index.js'
import { EnvironmentManager } from '../../src/lib/EnvironmentManager.js'

// Mock the logger
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  })),
}))

describe('DatabaseManager', () => {
  let databaseManager: DatabaseManager
  let mockProvider: DatabaseProvider
  let mockEnvironment: EnvironmentManager
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    // Store original env
    originalEnv = { ...process.env }

    // Reset environment
    delete process.env.NEON_PROJECT_ID
    delete process.env.NEON_PARENT_BRANCH

    // Create mock provider
    mockProvider = {
      isCliAvailable: vi.fn().mockResolvedValue(true),
      isAuthenticated: vi.fn().mockResolvedValue(true),
      createBranch: vi.fn().mockResolvedValue('postgresql://test-connection-string'),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      sanitizeBranchName: vi.fn((name: string) => name.replace(/\//g, '_')),
      branchExists: vi.fn().mockResolvedValue(false),
      listBranches: vi.fn().mockResolvedValue([]),
      getConnectionString: vi.fn().mockResolvedValue('postgresql://test-connection'),
      findPreviewBranch: vi.fn().mockResolvedValue(null),
      getBranchNameFromEndpoint: vi.fn().mockResolvedValue(null),
    }

    // Create mock environment
    mockEnvironment = {
      readEnvFile: vi.fn().mockResolvedValue(new Map([['DATABASE_URL', 'postgresql://localhost/test']])),
      writeEnvFile: vi.fn().mockResolvedValue(undefined),
      updateEnvValue: vi.fn().mockResolvedValue(undefined),
      removeEnvValue: vi.fn().mockResolvedValue(undefined),
    } as unknown as EnvironmentManager

    // Create DatabaseManager instance
    databaseManager = new DatabaseManager(mockProvider, mockEnvironment)

    vi.clearAllMocks()
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('shouldUseDatabaseBranching', () => {
    it('should return true when NEON env vars and DATABASE_URL are present', async () => {
      // Set up NEON environment variables
      process.env.NEON_PROJECT_ID = 'test-project-id'
      process.env.NEON_PARENT_BRANCH = 'main'

      // Mock .env file with DATABASE_URL
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(true)
      expect(mockEnvironment.readEnvFile).toHaveBeenCalledWith('/path/to/.env')
    })

    it('should return true when NEON env vars and DATABASE_URI are present', async () => {
      // Set up NEON environment variables
      process.env.NEON_PROJECT_ID = 'test-project-id'
      process.env.NEON_PARENT_BRANCH = 'main'

      // Mock .env file with DATABASE_URI
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URI', 'postgresql://localhost/test']])
      )

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(true)
    })

    it('should return false when NEON_PROJECT_ID is missing', async () => {
      // Only set NEON_PARENT_BRANCH
      process.env.NEON_PARENT_BRANCH = 'main'

      // Mock .env file with DATABASE_URL
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(false)
      // Should not check .env file if NEON vars missing
      expect(mockEnvironment.readEnvFile).not.toHaveBeenCalled()
    })

    it('should return false when NEON_PARENT_BRANCH is missing', async () => {
      // Only set NEON_PROJECT_ID
      process.env.NEON_PROJECT_ID = 'test-project-id'

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(false)
      expect(mockEnvironment.readEnvFile).not.toHaveBeenCalled()
    })

    it('should return false when DATABASE_URL/DATABASE_URI are missing from .env', async () => {
      // Set up NEON environment variables
      process.env.NEON_PROJECT_ID = 'test-project-id'
      process.env.NEON_PARENT_BRANCH = 'main'

      // Mock .env file without DATABASE_URL/DATABASE_URI
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['OTHER_VAR', 'some-value']])
      )

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(false)
      expect(mockEnvironment.readEnvFile).toHaveBeenCalledWith('/path/to/.env')
    })

    it('should return false when .env file cannot be read', async () => {
      // Set up NEON environment variables
      process.env.NEON_PROJECT_ID = 'test-project-id'
      process.env.NEON_PARENT_BRANCH = 'main'

      // Mock .env file read failure
      vi.mocked(mockEnvironment.readEnvFile).mockRejectedValue(new Error('File not found'))

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(false)
    })
  })

  describe('createBranchIfConfigured', () => {
    beforeEach(() => {
      // Set up valid configuration by default
      process.env.NEON_PROJECT_ID = 'test-project-id'
      process.env.NEON_PARENT_BRANCH = 'main'
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )
    })

    it('should return null when database branching not configured', async () => {
      // Remove NEON env vars
      delete process.env.NEON_PROJECT_ID

      const result = await databaseManager.createBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(result).toBe(null)
      expect(mockProvider.createBranch).not.toHaveBeenCalled()
    })

    it('should return null when CLI not available', async () => {
      vi.mocked(mockProvider.isCliAvailable).mockResolvedValue(false)

      const result = await databaseManager.createBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(result).toBe(null)
      expect(mockProvider.createBranch).not.toHaveBeenCalled()
    })

    it('should return null when not authenticated', async () => {
      vi.mocked(mockProvider.isAuthenticated).mockResolvedValue(false)

      const result = await databaseManager.createBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(result).toBe(null)
      expect(mockProvider.createBranch).not.toHaveBeenCalled()
    })

    it('should create branch and return connection string when fully configured', async () => {
      const connectionString = 'postgresql://test-connection-string'
      vi.mocked(mockProvider.createBranch).mockResolvedValue(connectionString)

      const result = await databaseManager.createBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(result).toBe(connectionString)
      expect(mockProvider.isCliAvailable).toHaveBeenCalled()
      expect(mockProvider.isAuthenticated).toHaveBeenCalled()
      expect(mockProvider.createBranch).toHaveBeenCalledWith('feature-branch')
      expect(mockProvider.sanitizeBranchName).toHaveBeenCalledWith('feature-branch')
    })

    it('should throw error when branch creation fails', async () => {
      const error = new Error('Failed to create branch')
      vi.mocked(mockProvider.createBranch).mockRejectedValue(error)

      await expect(
        databaseManager.createBranchIfConfigured('feature-branch', '/path/to/.env')
      ).rejects.toThrow('Failed to create branch')
    })

    it('should handle non-Error exceptions', async () => {
      vi.mocked(mockProvider.createBranch).mockRejectedValue('String error')

      await expect(
        databaseManager.createBranchIfConfigured('feature-branch', '/path/to/.env')
      ).rejects.toBe('String error')
    })
  })

  describe('deleteBranchIfConfigured', () => {
    beforeEach(() => {
      // Set up valid configuration by default
      process.env.NEON_PROJECT_ID = 'test-project-id'
      process.env.NEON_PARENT_BRANCH = 'main'
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )
    })

    it('should return early when database branching not configured', async () => {
      // Remove NEON env vars
      delete process.env.NEON_PROJECT_ID

      await databaseManager.deleteBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(mockProvider.deleteBranch).not.toHaveBeenCalled()
    })

    it('should return early when CLI not available', async () => {
      vi.mocked(mockProvider.isCliAvailable).mockResolvedValue(false)

      await databaseManager.deleteBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(mockProvider.deleteBranch).not.toHaveBeenCalled()
    })

    it('should return early when not authenticated', async () => {
      vi.mocked(mockProvider.isAuthenticated).mockResolvedValue(false)

      await databaseManager.deleteBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(mockProvider.deleteBranch).not.toHaveBeenCalled()
    })

    it('should delete branch when fully configured', async () => {
      await databaseManager.deleteBranchIfConfigured('feature-branch', '/path/to/.env')

      expect(mockProvider.isCliAvailable).toHaveBeenCalled()
      expect(mockProvider.isAuthenticated).toHaveBeenCalled()
      expect(mockProvider.deleteBranch).toHaveBeenCalledWith('feature-branch', false)
    })

    it('should pass isPreview flag to provider', async () => {
      await databaseManager.deleteBranchIfConfigured('feature-branch', '/path/to/.env', true)

      expect(mockProvider.deleteBranch).toHaveBeenCalledWith('feature-branch', true)
    })

    it('should not throw when deletion fails (should log warning instead)', async () => {
      const error = new Error('Failed to delete branch')
      vi.mocked(mockProvider.deleteBranch).mockRejectedValue(error)

      // Should not throw
      await expect(
        databaseManager.deleteBranchIfConfigured('feature-branch', '/path/to/.env')
      ).resolves.toBeUndefined()

      expect(mockProvider.deleteBranch).toHaveBeenCalled()
    })

    it('should handle non-Error exceptions during deletion', async () => {
      vi.mocked(mockProvider.deleteBranch).mockRejectedValue('String error')

      // Should not throw
      await expect(
        databaseManager.deleteBranchIfConfigured('feature-branch', '/path/to/.env')
      ).resolves.toBeUndefined()
    })
  })

  describe('private methods behavior verification', () => {
    it('should verify getNeonConfig behavior through public methods', async () => {
      // Test when both env vars are present
      process.env.NEON_PROJECT_ID = 'test-project'
      process.env.NEON_PARENT_BRANCH = 'development'
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )

      const result1 = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')
      expect(result1).toBe(true)

      // Test when one env var is missing
      delete process.env.NEON_PROJECT_ID

      const result2 = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')
      expect(result2).toBe(false)
    })

    it('should verify hasDatabaseUrlInEnv behavior through public methods', async () => {
      process.env.NEON_PROJECT_ID = 'test-project'
      process.env.NEON_PARENT_BRANCH = 'development'

      // Test with DATABASE_URL
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )
      expect(await databaseManager.shouldUseDatabaseBranching('/path/to/.env')).toBe(true)

      // Test with DATABASE_URI
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URI', 'postgresql://localhost/test']])
      )
      expect(await databaseManager.shouldUseDatabaseBranching('/path/to/.env')).toBe(true)

      // Test with neither
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['OTHER_VAR', 'some-value']])
      )
      expect(await databaseManager.shouldUseDatabaseBranching('/path/to/.env')).toBe(false)

      // Test with read error
      vi.mocked(mockEnvironment.readEnvFile).mockRejectedValue(new Error('File not found'))
      expect(await databaseManager.shouldUseDatabaseBranching('/path/to/.env')).toBe(false)
    })
  })

  describe('edge cases and integration scenarios', () => {
    it('should handle empty NEON environment variables', async () => {
      process.env.NEON_PROJECT_ID = ''
      process.env.NEON_PARENT_BRANCH = 'main'

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(false)
    })

    it('should handle whitespace-only NEON environment variables', async () => {
      process.env.NEON_PROJECT_ID = '   '
      process.env.NEON_PARENT_BRANCH = 'main'

      const result = await databaseManager.shouldUseDatabaseBranching('/path/to/.env')

      expect(result).toBe(false)
    })

    it('should work with different .env file paths', async () => {
      process.env.NEON_PROJECT_ID = 'test-project'
      process.env.NEON_PARENT_BRANCH = 'main'
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )

      await databaseManager.createBranchIfConfigured('feature-branch', '/different/path/.env')

      expect(mockEnvironment.readEnvFile).toHaveBeenCalledWith('/different/path/.env')
    })

    it('should handle branch names with special characters', async () => {
      process.env.NEON_PROJECT_ID = 'test-project'
      process.env.NEON_PARENT_BRANCH = 'main'
      vi.mocked(mockEnvironment.readEnvFile).mockResolvedValue(
        new Map([['DATABASE_URL', 'postgresql://localhost/test']])
      )

      const branchName = 'feature/issue-123/fix'
      await databaseManager.createBranchIfConfigured(branchName, '/path/to/.env')

      expect(mockProvider.createBranch).toHaveBeenCalledWith(branchName)
      expect(mockProvider.sanitizeBranchName).toHaveBeenCalledWith(branchName)
    })
  })
})