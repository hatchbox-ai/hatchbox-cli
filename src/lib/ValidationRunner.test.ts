import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ValidationRunner } from './ValidationRunner.js'
import * as packageManager from '../utils/package-manager.js'
import * as packageJson from '../utils/package-json.js'
import * as claude from '../utils/claude.js'
import type { PackageJson } from '../utils/package-json.js'

// Mock dependencies
vi.mock('../utils/package-manager.js')
vi.mock('../utils/package-json.js')
vi.mock('../utils/claude.js')
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

describe('ValidationRunner', () => {
	let runner: ValidationRunner

	beforeEach(() => {
		runner = new ValidationRunner()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('Package Manager Detection', () => {
		it('should detect and use pnpm when pnpm-lock.yaml exists', async () => {
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runValidations('/test/worktree', {
				skipLint: true,
				skipTests: true,
			})

			expect(packageManager.detectPackageManager).toHaveBeenCalledWith(
				'/test/worktree'
			)
		})

		it('should detect and use npm when package-lock.json exists', async () => {
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('npm')
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runValidations('/test/worktree', {
				skipLint: true,
				skipTests: true,
			})

			expect(packageManager.detectPackageManager).toHaveBeenCalledWith(
				'/test/worktree'
			)
		})

		it('should detect and use yarn when yarn.lock exists', async () => {
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('yarn')
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runValidations('/test/worktree', {
				skipLint: true,
				skipTests: true,
			})

			expect(packageManager.detectPackageManager).toHaveBeenCalledWith(
				'/test/worktree'
			)
		})
	})

	describe('Validation Script Detection', () => {
		it('should detect typecheck script in package.json', async () => {
			const mockPkgJson: PackageJson = {
				name: 'test',
				scripts: { typecheck: 'tsc' },
			}

			vi.mocked(packageJson.readPackageJson).mockResolvedValue(mockPkgJson)
			vi.mocked(packageJson.hasScript).mockImplementation(
				(pkg, scriptName) => scriptName === 'typecheck'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runValidations('/test/worktree', {
				skipLint: true,
				skipTests: true,
			})

			expect(packageJson.hasScript).toHaveBeenCalledWith(mockPkgJson, 'typecheck')
		})

		it('should detect lint script in package.json', async () => {
			const mockPkgJson: PackageJson = {
				name: 'test',
				scripts: { lint: 'eslint .' },
			}

			vi.mocked(packageJson.readPackageJson).mockResolvedValue(mockPkgJson)
			vi.mocked(packageJson.hasScript).mockImplementation(
				(pkg, scriptName) => scriptName === 'lint'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runValidations('/test/worktree', {
				skipTypecheck: true,
				skipTests: true,
			})

			expect(packageJson.hasScript).toHaveBeenCalledWith(mockPkgJson, 'lint')
		})

		it('should detect test script in package.json', async () => {
			const mockPkgJson: PackageJson = {
				name: 'test',
				scripts: { test: 'vitest run' },
			}

			vi.mocked(packageJson.readPackageJson).mockResolvedValue(mockPkgJson)
			vi.mocked(packageJson.hasScript).mockImplementation(
				(pkg, scriptName) => scriptName === 'test'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runValidations('/test/worktree', {
				skipTypecheck: true,
				skipLint: true,
			})

			expect(packageJson.hasScript).toHaveBeenCalledWith(mockPkgJson, 'test')
		})

		it('should skip validation when script does not exist', async () => {
			const mockPkgJson: PackageJson = {
				name: 'test',
				scripts: {},
			}

			vi.mocked(packageJson.readPackageJson).mockResolvedValue(mockPkgJson)
			vi.mocked(packageJson.hasScript).mockReturnValue(false)

			const result = await runner.runValidations('/test/worktree')

			expect(result.success).toBe(true)
			expect(result.steps).toHaveLength(3)
			expect(result.steps[0]?.skipped).toBe(true)
			expect(result.steps[1]?.skipped).toBe(true)
			expect(result.steps[2]?.skipped).toBe(true)
		})

		it('should handle package.json without scripts section', async () => {
			const mockPkgJson: PackageJson = {
				name: 'test',
			}

			vi.mocked(packageJson.readPackageJson).mockResolvedValue(mockPkgJson)
			vi.mocked(packageJson.hasScript).mockReturnValue(false)

			const result = await runner.runValidations('/test/worktree')

			expect(result.success).toBe(true)
			expect(result.steps.every((s) => s.skipped)).toBe(true)
		})
	})

	describe('Typecheck Validation', () => {
		it('should successfully run typecheck when script exists and passes', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'typecheck'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			const result = await runner.runValidations('/test/worktree', {
				skipLint: true,
				skipTests: true,
			})

			expect(result.success).toBe(true)
			expect(result.steps).toHaveLength(1)
			expect(result.steps[0]?.step).toBe('typecheck')
			expect(result.steps[0]?.passed).toBe(true)
			expect(result.steps[0]?.skipped).toBe(false)
			expect(packageManager.runScript).toHaveBeenCalledWith(
				'typecheck',
				'/test/worktree',
				[],
				{ quiet: true }
			)
		})

		it('should throw error when typecheck fails', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'typecheck'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Type errors found')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipLint: true,
					skipTests: true,
				})
			).rejects.toThrow(/Typecheck failed/)
		})

		it('should use correct package manager command (pnpm typecheck)', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'typecheck'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Type errors')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipLint: true,
					skipTests: true,
				})
			).rejects.toThrow(/pnpm typecheck/)
		})

		it('should use correct package manager command (npm run typecheck)', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'typecheck'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('npm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Type errors')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipLint: true,
					skipTests: true,
				})
			).rejects.toThrow(/npm run typecheck/)
		})
	})

	describe('Lint Validation', () => {
		it('should successfully run lint when script exists and passes', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { lint: 'eslint .' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'lint'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			const result = await runner.runValidations('/test/worktree', {
				skipTypecheck: true,
				skipTests: true,
			})

			expect(result.success).toBe(true)
			expect(result.steps).toHaveLength(1)
			expect(result.steps[0]?.step).toBe('lint')
			expect(result.steps[0]?.passed).toBe(true)
			expect(packageManager.runScript).toHaveBeenCalledWith(
				'lint',
				'/test/worktree',
				[],
				{ quiet: true }
			)
		})

		it('should throw error when lint fails', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { lint: 'eslint .' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'lint'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Lint errors found')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipTests: true,
				})
			).rejects.toThrow(/Linting failed/)
		})

		it('should use correct package manager command', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { lint: 'eslint .' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'lint'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('yarn')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Lint errors')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipTests: true,
				})
			).rejects.toThrow(/yarn lint/)
		})
	})

	describe('Test Validation', () => {
		it('should successfully run tests when script exists and passes', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { test: 'vitest run' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'test'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			const result = await runner.runValidations('/test/worktree', {
				skipTypecheck: true,
				skipLint: true,
			})

			expect(result.success).toBe(true)
			expect(result.steps).toHaveLength(1)
			expect(result.steps[0]?.step).toBe('test')
			expect(result.steps[0]?.passed).toBe(true)
			expect(packageManager.runScript).toHaveBeenCalledWith(
				'test',
				'/test/worktree',
				[],
				{ quiet: true }
			)
		})

		it('should throw error when tests fail', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { test: 'vitest run' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'test'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Test failures')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipLint: true,
				})
			).rejects.toThrow(/Tests failed/)
		})

		it('should use correct package manager command', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { test: 'vitest run' },
			})
			vi.mocked(packageJson.hasScript).mockImplementation(
				(_, script) => script === 'test'
			)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('npm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Test failures')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipLint: true,
				})
			).rejects.toThrow(/npm run test/)
		})
	})

	describe('Full Validation Pipeline', () => {
		it('should run all validations in order: typecheck → lint → test', async () => {
			const callOrder: string[] = []

			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: {
					typecheck: 'tsc',
					lint: 'eslint .',
					test: 'vitest run',
				},
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockImplementation(
				async (scriptName) => {
					callOrder.push(scriptName)
				}
			)

			const result = await runner.runValidations('/test/worktree')

			expect(result.success).toBe(true)
			expect(callOrder).toEqual(['typecheck', 'lint', 'test'])
			expect(result.steps).toHaveLength(3)
		})

		it('should stop at first failure (fail-fast behavior)', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: {
					typecheck: 'tsc',
					lint: 'eslint .',
					test: 'vitest run',
				},
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript)
				.mockResolvedValueOnce() // typecheck passes
				.mockRejectedValueOnce(new Error('Lint failed')) // lint fails

			await expect(runner.runValidations('/test/worktree')).rejects.toThrow(
				/Linting failed/
			)

			// Should only have called typecheck and lint, not test
			expect(packageManager.runScript).toHaveBeenCalledTimes(2)
		})

		it('should return success when all validations pass', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: {
					typecheck: 'tsc',
					lint: 'eslint .',
					test: 'vitest run',
				},
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			const result = await runner.runValidations('/test/worktree')

			expect(result.success).toBe(true)
			expect(result.steps.every((s) => s.passed)).toBe(true)
			expect(result.steps.every((s) => !s.skipped)).toBe(true)
		})

		it('should skip validations when scripts do not exist', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: {},
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(false)

			const result = await runner.runValidations('/test/worktree')

			expect(result.success).toBe(true)
			expect(result.steps.every((s) => s.skipped)).toBe(true)
			expect(packageManager.runScript).not.toHaveBeenCalled()
		})
	})

	describe('Dry-Run Mode', () => {
		it('should log what would be executed without running commands', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

			const result = await runner.runValidations('/test/worktree', {
				dryRun: true,
				skipLint: true,
				skipTests: true,
			})

			expect(result.success).toBe(true)
			expect(packageManager.runScript).not.toHaveBeenCalled()
		})

		it('should still validate that scripts exist in dry-run mode', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

			await runner.runValidations('/test/worktree', {
				dryRun: true,
				skipLint: true,
				skipTests: true,
			})

			expect(packageJson.hasScript).toHaveBeenCalled()
		})

		it('should still detect package manager in dry-run mode', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

			await runner.runValidations('/test/worktree', {
				dryRun: true,
				skipLint: true,
				skipTests: true,
			})

			expect(packageManager.detectPackageManager).toHaveBeenCalledWith(
				'/test/worktree'
			)
		})

		it('should not throw errors in dry-run mode', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

			const result = await runner.runValidations('/test/worktree', {
				dryRun: true,
			})

			expect(result.success).toBe(true)
		})
	})

	describe('Error Handling', () => {
		it('should provide clear error message for typecheck failure', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Type errors')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipLint: true,
					skipTests: true,
				})
			).rejects.toThrow(/Typecheck failed/)
		})

		it('should provide clear error message for lint failure', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { lint: 'eslint .' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Lint errors')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipTests: true,
				})
			).rejects.toThrow(/Linting failed/)
		})

		it('should provide clear error message for test failure', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { test: 'vitest run' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Test failures')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipLint: true,
				})
			).rejects.toThrow(/Tests failed/)
		})

		it('should include command to run for debugging (typecheck)', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { typecheck: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Type errors')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipLint: true,
					skipTests: true,
				})
			).rejects.toThrow(/pnpm typecheck/)
		})

		it('should include command to run for debugging (lint)', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { lint: 'eslint .' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('npm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Lint errors')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipTests: true,
				})
			).rejects.toThrow(/npm run lint/)
		})

		it('should include command to run for debugging (test)', async () => {
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { test: 'vitest run' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('yarn')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Test failures')
			)

			await expect(
				runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipLint: true,
				})
			).rejects.toThrow(/yarn test/)
		})

		it('should handle package.json read errors', async () => {
			vi.mocked(packageJson.readPackageJson).mockRejectedValue(
				new Error('package.json not found')
			)

			await expect(
				runner.runValidations('/test/worktree')
			).rejects.toThrow(/package.json/)
		})
	})

	describe('Claude Auto-Fix Integration', () => {
		describe('Typecheck Auto-Fix', () => {
			it('should attempt Claude fix when typecheck fails', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { typecheck: 'tsc' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

				// First call fails (initial typecheck), second succeeds (verification after Claude fix)
				vi.mocked(packageManager.runScript)
					.mockRejectedValueOnce(new Error('Type errors'))
					.mockResolvedValueOnce()

				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				const result = await runner.runValidations('/test/worktree', {
					skipLint: true,
					skipTests: true,
				})

				expect(result.success).toBe(true)
				expect(result.steps[0]?.passed).toBe(true)
				expect(claude.detectClaudeCli).toHaveBeenCalled()
				expect(claude.launchClaude).toHaveBeenCalledWith(
					expect.stringContaining('TypeScript errors'),
					expect.objectContaining({
						headless: false,
						permissionMode: 'acceptEdits',
						model: 'sonnet',
						addDir: '/test/worktree',
					})
				)
			})

			it('should throw error when Claude cannot fix typecheck errors', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { typecheck: 'tsc' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

				// Both calls fail (initial typecheck and verification)
				vi.mocked(packageManager.runScript).mockRejectedValue(
					new Error('Type errors')
				)

				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				await expect(
					runner.runValidations('/test/worktree', {
						skipLint: true,
						skipTests: true,
					})
				).rejects.toThrow(/Typecheck failed/)
			})

			it('should fallback to error when Claude CLI not available', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { typecheck: 'tsc' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
				vi.mocked(packageManager.runScript).mockRejectedValue(
					new Error('Type errors')
				)

				vi.mocked(claude.detectClaudeCli).mockResolvedValue(false)

				await expect(
					runner.runValidations('/test/worktree', {
						skipLint: true,
						skipTests: true,
					})
				).rejects.toThrow(/Typecheck failed/)

				expect(claude.launchClaude).not.toHaveBeenCalled()
			})
		})

		describe('Lint Auto-Fix', () => {
			it('should attempt Claude fix when lint fails', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { lint: 'eslint .' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

				// First call fails (initial lint), second succeeds (verification)
				vi.mocked(packageManager.runScript)
					.mockRejectedValueOnce(new Error('Lint errors'))
					.mockResolvedValueOnce()

				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				const result = await runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipTests: true,
				})

				expect(result.success).toBe(true)
				expect(result.steps[0]?.passed).toBe(true)
				expect(claude.launchClaude).toHaveBeenCalledWith(
					expect.stringContaining('ESLint errors'),
					expect.objectContaining({
						headless: false,
						permissionMode: 'acceptEdits',
						model: 'sonnet',
						addDir: '/test/worktree',
					})
				)
			})

			it('should throw error when Claude cannot fix lint errors', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { lint: 'eslint .' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

				vi.mocked(packageManager.runScript).mockRejectedValue(
					new Error('Lint errors')
				)

				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				await expect(
					runner.runValidations('/test/worktree', {
						skipTypecheck: true,
						skipTests: true,
					})
				).rejects.toThrow(/Linting failed/)
			})
		})

		describe('Test Auto-Fix', () => {
			it('should attempt Claude fix when tests fail', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { test: 'vitest run' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

				// First call fails (initial test), second succeeds (verification)
				vi.mocked(packageManager.runScript)
					.mockRejectedValueOnce(new Error('Test failures'))
					.mockResolvedValueOnce()

				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				const result = await runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipLint: true,
				})

				expect(result.success).toBe(true)
				expect(result.steps[0]?.passed).toBe(true)
				expect(claude.launchClaude).toHaveBeenCalledWith(
					expect.stringContaining('unit test failures'),
					expect.objectContaining({
						headless: false,
						permissionMode: 'acceptEdits',
						model: 'sonnet',
						addDir: '/test/worktree',
					})
				)
			})

			it('should throw error when Claude cannot fix test failures', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { test: 'vitest run' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

				vi.mocked(packageManager.runScript).mockRejectedValue(
					new Error('Test failures')
				)

				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				await expect(
					runner.runValidations('/test/worktree', {
						skipTypecheck: true,
						skipLint: true,
					})
				).rejects.toThrow(/Tests failed/)
			})
		})

		describe('Claude Integration Details', () => {
			it('should use correct prompt for typecheck', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { typecheck: 'tsc' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
				vi.mocked(packageManager.runScript)
					.mockRejectedValueOnce(new Error('Type errors'))
					.mockResolvedValueOnce()
				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				await runner.runValidations('/test/worktree', {
					skipLint: true,
					skipTests: true,
				})

				expect(claude.launchClaude).toHaveBeenCalledWith(
					expect.stringContaining('pnpm typecheck'),
					expect.any(Object)
				)
			})

			it('should use correct prompt for lint', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { lint: 'eslint .' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('npm')
				vi.mocked(packageManager.runScript)
					.mockRejectedValueOnce(new Error('Lint errors'))
					.mockResolvedValueOnce()
				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				await runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipTests: true,
				})

				expect(claude.launchClaude).toHaveBeenCalledWith(
					expect.stringContaining('npm run lint'),
					expect.any(Object)
				)
			})

			it('should use correct prompt for tests', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { test: 'vitest run' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('yarn')
				vi.mocked(packageManager.runScript)
					.mockRejectedValueOnce(new Error('Test failures'))
					.mockResolvedValueOnce()
				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockResolvedValue()

				await runner.runValidations('/test/worktree', {
					skipTypecheck: true,
					skipLint: true,
				})

				expect(claude.launchClaude).toHaveBeenCalledWith(
					expect.stringContaining('yarn test'),
					expect.any(Object)
				)
			})

			it('should handle Claude launch errors gracefully', async () => {
				vi.mocked(packageJson.readPackageJson).mockResolvedValue({
					name: 'test',
					scripts: { typecheck: 'tsc' },
				})
				vi.mocked(packageJson.hasScript).mockReturnValue(true)
				vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
				vi.mocked(packageManager.runScript).mockRejectedValue(
					new Error('Type errors')
				)
				vi.mocked(claude.detectClaudeCli).mockResolvedValue(true)
				vi.mocked(claude.launchClaude).mockRejectedValue(
					new Error('Claude CLI crashed')
				)

				await expect(
					runner.runValidations('/test/worktree', {
						skipLint: true,
						skipTests: true,
					})
				).rejects.toThrow(/Typecheck failed/)
			})
		})
	})
})
