import { logger } from '../utils/logger.js'
import { detectPackageManager, runScript } from '../utils/package-manager.js'
import { readPackageJson, hasScript } from '../utils/package-json.js'
import { ProjectCapabilityDetector } from './ProjectCapabilityDetector.js'

export interface BuildOptions {
	dryRun?: boolean
}

export interface BuildResult {
	success: boolean
	skipped: boolean
	reason?: string
	duration: number
}

/**
 * BuildRunner handles post-merge build verification for CLI projects
 * Only runs build when project has CLI capabilities (bin field in package.json)
 */
export class BuildRunner {
	private capabilityDetector: ProjectCapabilityDetector

	constructor(capabilityDetector?: ProjectCapabilityDetector) {
		this.capabilityDetector = capabilityDetector ?? new ProjectCapabilityDetector()
	}

	/**
	 * Run build verification in the specified directory
	 * @param buildPath - Path where build should run (typically main worktree path)
	 * @param options - Build options
	 */
	async runBuild(buildPath: string, options: BuildOptions = {}): Promise<BuildResult> {
		const startTime = Date.now()

		// Step 1: Check if build script exists
		const pkgJson = await readPackageJson(buildPath)
		const hasBuildScript = hasScript(pkgJson, 'build')

		if (!hasBuildScript) {
			logger.debug('Skipping build - no build script found')
			return {
				success: true,
				skipped: true,
				reason: 'No build script found in package.json',
				duration: Date.now() - startTime,
			}
		}

		// Step 2: Check if project has CLI capability (bin field)
		const capabilities = await this.capabilityDetector.detectCapabilities(buildPath)
		const isCLIProject = capabilities.capabilities.includes('cli')

		if (!isCLIProject) {
			logger.debug('Skipping build - not a CLI project (no bin field)')
			return {
				success: true,
				skipped: true,
				reason: 'Project is not a CLI project (no bin field in package.json)',
				duration: Date.now() - startTime,
			}
		}

		// Step 3: Detect package manager
		const packageManager = await detectPackageManager(buildPath)

		// Step 4: Handle dry-run mode
		if (options.dryRun) {
			const command =
				packageManager === 'npm' ? 'npm run build' : `${packageManager} build`
			logger.info(`[DRY RUN] Would run: ${command}`)
			return {
				success: true,
				skipped: false,
				duration: Date.now() - startTime,
			}
		}

		// Step 5: Execute build
		logger.info('Running build...')

		try {
			await runScript('build', buildPath, [], { quiet: true })
			logger.success('Build completed successfully')

			return {
				success: true,
				skipped: false,
				duration: Date.now() - startTime,
			}
		} catch {
			// Step 6: Throw detailed error on failure
			const runCommand =
				packageManager === 'npm' ? 'npm run build' : `${packageManager} build`

			throw new Error(
				`Error: Build failed.\n` +
					`Fix build errors before proceeding.\n\n` +
					`Run '${runCommand}' to see detailed errors.`
			)
		}
	}
}
