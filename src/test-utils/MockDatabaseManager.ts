import { vi } from 'vitest'

/**
 * Mock factory for DatabaseManager
 */
export class MockDatabaseManager {
	private branches = new Set<string>()

	setupBranch(branchName: string): void {
		this.branches.add(branchName)
	}

	mockDeleteBranch(): ReturnType<typeof vi.fn> {
		return vi.fn().mockImplementation((branchName: string) => {
			if (this.branches.has(branchName)) {
				this.branches.delete(branchName)
				return Promise.resolve()
			}
			return Promise.reject(new Error(`Branch not found: ${branchName}`))
		})
	}

	mockCreateBranch(): ReturnType<typeof vi.fn> {
		return vi.fn().mockImplementation((branchName: string) => {
			this.branches.add(branchName)
			return Promise.resolve(`db-connection-string-${branchName}`)
		})
	}

	reset(): void {
		this.branches.clear()
	}
}
