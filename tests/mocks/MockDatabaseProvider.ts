import { vi } from 'vitest'
import type { DatabaseProvider } from '../../src/types/index.js'
import type { DatabaseManager } from '../../src/lib/DatabaseManager.js'

/**
 * Creates a mock DatabaseProvider with reasonable defaults for testing.
 * Individual methods can be overridden via the overrides parameter.
 */
export function createMockDatabaseProvider(
  overrides?: Partial<DatabaseProvider>
): DatabaseProvider {
  return {
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
    ...overrides,
  }
}

/**
 * Creates a mock DatabaseManager with reasonable defaults for testing.
 * Individual methods can be overridden via the overrides parameter.
 */
export function createMockDatabaseManager(
  overrides?: Partial<DatabaseManager>
): DatabaseManager {
  const mockManager = {
    createBranchIfConfigured: vi
      .fn()
      .mockResolvedValue('postgresql://test-connection-string'),
    deleteBranchIfConfigured: vi.fn().mockResolvedValue(undefined),
    shouldUseDatabaseBranching: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as DatabaseManager

  return mockManager
}
