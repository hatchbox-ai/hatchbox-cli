import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { platform, release, arch } from 'os'
import { logger } from './logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Diagnostic information gathered from the system
 */
export interface DiagnosticInfo {
	cliVersion: string
	nodeVersion: string
	osType: string
	osVersion: string
	architecture: string
}

/**
 * Gathers diagnostic information about the CLI environment.
 * Fails gracefully with fallback messages if any information cannot be gathered.
 */
export async function gatherDiagnosticInfo(): Promise<DiagnosticInfo> {
	const diagnostics: DiagnosticInfo = {
		cliVersion: await getCliVersion(),
		nodeVersion: getNodeVersion(),
		osType: getOsType(),
		osVersion: getOsVersion(),
		architecture: getArchitecture(),
	}

	return diagnostics
}

/**
 * Formats diagnostic information as markdown for inclusion in GitHub issues
 */
export function formatDiagnosticsAsMarkdown(diagnostics: DiagnosticInfo, includeMarker = true): string {
	const marker = includeMarker ? `<!-- CLI GENERATED FEEDBACK v${diagnostics.cliVersion} -->\n` : ''

	return `${marker}
<details>
<summary>Diagnostic Information</summary>

| Property | Value |
|----------|-------|
| CLI Version | ${diagnostics.cliVersion} |
| Node.js Version | ${diagnostics.nodeVersion} |
| OS | ${diagnostics.osType} |
| OS Version | ${diagnostics.osVersion} |
| Architecture | ${diagnostics.architecture} |

</details>
`
}

/**
 * Gets the CLI version from package.json.
 * Falls back to "unknown" if package.json cannot be read.
 */
async function getCliVersion(): Promise<string> {
	try {
		// Navigate up from dist/ to root directory (same as cli.ts does)
		const packageJsonPath = join(__dirname, '..', 'package.json')
		const packageJson = await readFile(packageJsonPath, 'utf-8')
		const parsed = JSON.parse(packageJson)
		return parsed.version ?? 'unknown'
	} catch (error) {
		logger.debug('Failed to read CLI version from package.json: ', error)
		return 'unknown (failed to read package.json)'
	}
}

/**
 * Gets the Node.js version.
 * Falls back to "unknown" if process.version is not available.
 */
function getNodeVersion(): string {
	try {
		return process.version ?? 'unknown'
	} catch (error) {
		logger.debug('Failed to read Node.js version:', error)
		return 'unknown (failed to read Node.js version)'
	}
}

/**
 * Gets the operating system type.
 * Falls back to "unknown" if os.platform() fails.
 */
function getOsType(): string {
	try {
		return platform() ?? 'unknown'
	} catch (error) {
		logger.debug('Failed to read OS type:', error)
		return 'unknown (failed to detect OS)'
	}
}

/**
 * Gets the operating system version.
 * Falls back to "unknown" if os.release() fails.
 */
function getOsVersion(): string {
	try {
		return release() ?? 'unknown'
	} catch (error) {
		logger.debug('Failed to read OS version:', error)
		return 'unknown (failed to detect OS version)'
	}
}

/**
 * Gets the system architecture.
 * Falls back to "unknown" if os.arch() fails.
 */
function getArchitecture(): string {
	try {
		return arch() ?? 'unknown'
	} catch (error) {
		logger.debug('Failed to read system architecture:', error)
		return 'unknown (failed to detect architecture)'
	}
}
