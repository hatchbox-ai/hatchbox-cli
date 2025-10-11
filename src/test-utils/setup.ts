import { beforeEach, vi } from 'vitest'

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks()
  vi.resetAllMocks()
  vi.restoreAllMocks()

  // Reset environment variables to clean state
  delete process.env.GITHUB_TOKEN
  delete process.env.CLAUDE_API_KEY
  delete process.env.NEON_API_KEY

  // Set required environment variables for tests
  process.env.NEON_PROJECT_ID = 'test-project-id'
  process.env.NEON_PARENT_BRANCH = 'branch-that-doesnt-exist'
})
