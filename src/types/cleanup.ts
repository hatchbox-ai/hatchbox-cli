/**
 * Options for ResourceCleanup operations
 */
export interface ResourceCleanupOptions {
	/** Preview operations without executing */
	dryRun?: boolean
	/** Skip confirmations and safety checks */
	force?: boolean
	/** Delete the associated branch */
	deleteBranch?: boolean
	/** Keep database branch instead of deleting */
	keepDatabase?: boolean
	/** Prompt for confirmation before operations */
	interactive?: boolean
}

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
	/** Identifier that was cleaned up */
	identifier: string
	/** Overall success status */
	success: boolean
	/** Individual operation results */
	operations: OperationResult[]
	/** Errors encountered during cleanup */
	errors: Error[]
	/** Whether rollback is required */
	rollbackRequired?: boolean
}

/**
 * Result of an individual cleanup operation
 */
export interface OperationResult {
	/** Type of operation performed */
	type: 'dev-server' | 'worktree' | 'branch' | 'database'
	/** Whether operation succeeded */
	success: boolean
	/** Human-readable message */
	message: string
	/** Error message if operation failed */
	error?: string
}

/**
 * Safety check result
 */
export interface SafetyCheck {
	/** Whether cleanup is safe to proceed */
	isSafe: boolean
	/** Non-blocking warnings */
	warnings: string[]
	/** Blocking issues that prevent cleanup */
	blockers: string[]
}

/**
 * Options for branch deletion
 */
export interface BranchDeleteOptions {
	/** Force delete unmerged branch */
	force?: boolean
	/** Also delete remote branch */
	remote?: boolean
	/** Preview without executing */
	dryRun?: boolean
}
