import { logger } from '../utils/logger.js'
import { detectPackageManager, runScript } from '../utils/package-manager.js'
import { readPackageJson, hasScript } from '../utils/package-json.js'
import { detectClaudeCli, launchClaude } from '../utils/claude.js'
import type {
	ValidationOptions,
	ValidationResult,
	ValidationStepResult,
} from '../types/index.js'

/**
 * ValidationRunner orchestrates pre-merge validation pipeline
 * Runs typecheck, lint, and tests in sequence with fail-fast behavior
 */
export class ValidationRunner {
	/**
	 * Run all validations in sequence: typecheck → lint → test
	 * Fails fast on first error
	 */
	async runValidations(
		worktreePath: string,
		options: ValidationOptions = {}
	): Promise<ValidationResult> {
		const startTime = Date.now()
		const steps: ValidationStepResult[] = []

		// Run typecheck
		if (!options.skipTypecheck) {
			const typecheckResult = await this.runTypecheck(
				worktreePath,
				options.dryRun ?? false
			)
			steps.push(typecheckResult)

			if (!typecheckResult.passed && !typecheckResult.skipped) {
				return {
					success: false,
					steps,
					totalDuration: Date.now() - startTime,
				}
			}
		}

		// Run lint
		if (!options.skipLint) {
			const lintResult = await this.runLint(worktreePath, options.dryRun ?? false)
			steps.push(lintResult)

			if (!lintResult.passed && !lintResult.skipped) {
				return { success: false, steps, totalDuration: Date.now() - startTime }
			}
		}

		// Run tests
		if (!options.skipTests) {
			const testResult = await this.runTests(
				worktreePath,
				options.dryRun ?? false
			)
			steps.push(testResult)

			if (!testResult.passed && !testResult.skipped) {
				return { success: false, steps, totalDuration: Date.now() - startTime }
			}
		}

		return { success: true, steps, totalDuration: Date.now() - startTime }
	}

	/**
	 * Run typecheck validation
	 */
	private async runTypecheck(
		worktreePath: string,
		dryRun: boolean
	): Promise<ValidationStepResult> {
		const stepStartTime = Date.now()

		// Check if typecheck script exists
		const pkgJson = await readPackageJson(worktreePath)
		const hasTypecheckScript = hasScript(pkgJson, 'typecheck')

		if (!hasTypecheckScript) {
			logger.debug('Skipping typecheck - no typecheck script found')
			return {
				step: 'typecheck',
				passed: true,
				skipped: true,
				duration: Date.now() - stepStartTime,
			}
		}

		const packageManager = await detectPackageManager(worktreePath)

		if (dryRun) {
			const command =
				packageManager === 'npm'
					? 'npm run typecheck'
					: `${packageManager} typecheck`
			logger.info(`[DRY RUN] Would run: ${command}`)
			return {
				step: 'typecheck',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		}

		logger.info('Running typecheck...')

		try {
			await runScript('typecheck', worktreePath, [], { quiet: true })
			logger.success('Typecheck passed')

			return {
				step: 'typecheck',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		} catch {
			// Attempt Claude-assisted fix before failing
			const fixed = await this.attemptClaudeFix(
				'typecheck',
				worktreePath,
				packageManager
			)

			if (fixed) {
				// logger.success('Typecheck passed after Claude auto-fix')
				return {
					step: 'typecheck',
					passed: true,
					skipped: false,
					duration: Date.now() - stepStartTime,
				}
			}

			// Claude couldn't fix - throw original error
			const runCommand =
				packageManager === 'npm'
					? 'npm run typecheck'
					: `${packageManager} typecheck`

			throw new Error(
				`Error: Typecheck failed.\n` +
					`Fix type errors before merging.\n\n` +
					`Run '${runCommand}' to see detailed errors.`
			)
		}
	}

	/**
	 * Run lint validation
	 */
	private async runLint(
		worktreePath: string,
		dryRun: boolean
	): Promise<ValidationStepResult> {
		const stepStartTime = Date.now()

		// Check if lint script exists
		const pkgJson = await readPackageJson(worktreePath)
		const hasLintScript = hasScript(pkgJson, 'lint')

		if (!hasLintScript) {
			logger.debug('Skipping lint - no lint script found')
			return {
				step: 'lint',
				passed: true,
				skipped: true,
				duration: Date.now() - stepStartTime,
			}
		}

		const packageManager = await detectPackageManager(worktreePath)

		if (dryRun) {
			const command =
				packageManager === 'npm' ? 'npm run lint' : `${packageManager} lint`
			logger.info(`[DRY RUN] Would run: ${command}`)
			return {
				step: 'lint',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		}

		logger.info('Running lint...')

		try {
			await runScript('lint', worktreePath, [], { quiet: true })
			logger.success('Linting passed')

			return {
				step: 'lint',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		} catch {
			// Attempt Claude-assisted fix before failing
			const fixed = await this.attemptClaudeFix(
				'lint',
				worktreePath,
				packageManager
			)

			if (fixed) {
				// logger.success('Linting passed after Claude auto-fix')
				return {
					step: 'lint',
					passed: true,
					skipped: false,
					duration: Date.now() - stepStartTime,
				}
			}

			// Claude couldn't fix - throw original error
			const runCommand =
				packageManager === 'npm' ? 'npm run lint' : `${packageManager} lint`

			throw new Error(
				`Error: Linting failed.\n` +
					`Fix linting errors before merging.\n\n` +
					`Run '${runCommand}' to see detailed errors.`
			)
		}
	}

	/**
	 * Run test validation
	 */
	private async runTests(
		worktreePath: string,
		dryRun: boolean
	): Promise<ValidationStepResult> {
		const stepStartTime = Date.now()

		// Check if test script exists
		const pkgJson = await readPackageJson(worktreePath)
		const hasTestScript = hasScript(pkgJson, 'test')

		if (!hasTestScript) {
			logger.debug('Skipping tests - no test script found')
			return {
				step: 'test',
				passed: true,
				skipped: true,
				duration: Date.now() - stepStartTime,
			}
		}

		const packageManager = await detectPackageManager(worktreePath)

		if (dryRun) {
			const command =
				packageManager === 'npm' ? 'npm run test' : `${packageManager} test`
			logger.info(`[DRY RUN] Would run: ${command}`)
			return {
				step: 'test',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		}

		logger.info('Running tests...')

		try {
			await runScript('test', worktreePath, [], { quiet: true })
			logger.success('Tests passed')

			return {
				step: 'test',
				passed: true,
				skipped: false,
				duration: Date.now() - stepStartTime,
			}
		} catch {
			// Attempt Claude-assisted fix before failing
			const fixed = await this.attemptClaudeFix(
				'test',
				worktreePath,
				packageManager
			)

			if (fixed) {
				// logger.success('Tests passed after Claude auto-fix')
				return {
					step: 'test',
					passed: true,
					skipped: false,
					duration: Date.now() - stepStartTime,
				}
			}

			// Claude couldn't fix - throw original error
			const runCommand =
				packageManager === 'npm' ? 'npm run test' : `${packageManager} test`

			throw new Error(
				`Error: Tests failed.\n` +
					`Fix test failures before merging.\n\n` +
					`Run '${runCommand}' to see detailed errors.`
			)
		}
	}

	/**
	 * Attempt to fix validation errors using Claude
	 * Pattern based on MergeManager.attemptClaudeConflictResolution
	 *
	 * @param validationType - Type of validation that failed ('typecheck' | 'lint' | 'test')
	 * @param worktreePath - Path to the worktree
	 * @param packageManager - Detected package manager
	 * @returns true if Claude fixed the issue, false otherwise
	 */
	private async attemptClaudeFix(
		validationType: 'typecheck' | 'lint' | 'test',
		worktreePath: string,
		packageManager: string
	): Promise<boolean> {
		// Check if Claude CLI is available
		const isClaudeAvailable = await detectClaudeCli()
		if (!isClaudeAvailable) {
			logger.debug('Claude CLI not available, skipping auto-fix')
			return false
		}

		// Build validation command for the prompt
		const validationCommand = this.getValidationCommand(validationType, packageManager)

		// Build prompt based on validation type (matching bash script prompts)
		const prompt = this.getClaudePrompt(validationType, validationCommand)

		const validationTypeCapitalized = validationType.charAt(0).toUpperCase() + validationType.slice(1)
		logger.info(`Launching Claude to help fix ${validationTypeCapitalized} errors...`)

		try {
			// Launch Claude in interactive mode with acceptEdits permission
			await launchClaude(prompt, {
				addDir: worktreePath,
				headless: false, // Interactive mode
				permissionMode: 'acceptEdits', // Auto-accept edits
				model: 'sonnet', // Use Sonnet model
			})

			// After Claude completes, re-run validation to verify fix
			logger.info(`Re-running ${validationTypeCapitalized} after Claude's fixes...`)

			try {
				await runScript(validationType, worktreePath, [], { quiet: true })
				// Validation passed after Claude fix
				logger.success(`${validationTypeCapitalized} passed after Claude auto-fix`)
				return true
			} catch {
				// Validation still failing after Claude's attempt
				logger.warn(`${validationTypeCapitalized} still failing after Claude's help`)
				return false
			}
		} catch (error) {
			// Claude launch failed or crashed
			logger.warn('Claude auto-fix failed', {
				error: error instanceof Error ? error.message : String(error),
			})
			return false
		}
	}

	/**
	 * Get validation command string for prompts
	 */
	private getValidationCommand(
		validationType: 'typecheck' | 'lint' | 'test',
		packageManager: string
	): string {
		if (packageManager === 'npm') {
			return `npm run ${validationType}`
		}
		return `${packageManager} ${validationType}`
	}

	/**
	 * Get Claude prompt for specific validation type
	 * Matches bash script prompts exactly
	 */
	private getClaudePrompt(
		validationType: 'typecheck' | 'lint' | 'test',
		validationCommand: string
	): string {
		switch (validationType) {
			case 'typecheck':
				return (
					`There are TypeScript errors in this codebase. ` +
					`Please analyze the typecheck output, identify all type errors, and fix them. ` +
					`Run '${validationCommand}' to see the errors, then make the necessary code changes to resolve all type issues.`
				)
			case 'lint':
				return (
					`There are ESLint errors in this codebase. ` +
					`Please analyze the linting output, identify all linting issues, and fix them. ` +
					`Run '${validationCommand}' to see the errors, then make the necessary code changes to resolve all linting issues. ` +
					`Focus on code quality, consistency, and following the project's linting rules.`
				)
			case 'test':
				return (
					`There are unit test failures in this codebase. ` +
					`Please analyze the test output to understand what's failing, then fix the issues. ` +
					`This might involve updating test code, fixing bugs in the source code, or updating tests to match new behavior. ` +
					`Run '${validationCommand}' to see the detailed test failures, then make the necessary changes to get all tests passing.`
				)
		}
	}
}
