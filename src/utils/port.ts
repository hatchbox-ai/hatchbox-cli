import { createHash } from 'crypto'

/**
 * Generate deterministic port offset from branch name using SHA256 hash
 * Range: 1-999 (matches existing random range for branches)
 *
 * @param branchName - Branch name to generate port offset from
 * @returns Port offset in range [1, 999]
 * @throws Error if branchName is empty
 */
export function generatePortOffsetFromBranchName(branchName: string): number {
	// Validate input
	if (!branchName || branchName.trim().length === 0) {
		throw new Error('Branch name cannot be empty')
	}

	// Generate SHA256 hash of branch name (same pattern as color.ts)
	const hash = createHash('sha256').update(branchName).digest('hex')

	// Take first 8 hex characters and convert to port offset (1-999)
	const hashPrefix = hash.slice(0, 8)
	const hashAsInt = parseInt(hashPrefix, 16)
	const portOffset = (hashAsInt % 999) + 1 // +1 ensures range is 1-999, not 0-998

	return portOffset
}

/**
 * Calculate deterministic port for branch-based workspace
 *
 * @param branchName - Branch name
 * @param basePort - Base port (default: 3000)
 * @returns Port number
 * @throws Error if calculated port exceeds 65535 or branchName is empty
 */
export function calculatePortForBranch(branchName: string, basePort: number = 3000): number {
	const offset = generatePortOffsetFromBranchName(branchName)
	const port = basePort + offset

	// Validate port range (same as EnvironmentManager.calculatePort)
	if (port > 65535) {
		throw new Error(
			`Calculated port ${port} exceeds maximum (65535). Use a lower base port (current: ${basePort}).`
		)
	}

	return port
}
