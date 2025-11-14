import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BuildRunner } from './BuildRunner.js'
import { ProjectCapabilityDetector } from './ProjectCapabilityDetector.js'
import * as packageManager from '../utils/package-manager.js'
import * as packageJson from '../utils/package-json.js'
import type { PackageJson } from '../utils/package-json.js'
import type { ProjectCapabilities } from './ProjectCapabilityDetector.js'

// Mock dependencies
vi.mock('../utils/package-manager.js')
vi.mock('../utils/package-json.js')
vi.mock('./ProjectCapabilityDetector.js')
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

describe('BuildRunner', () => {
	let runner: BuildRunner
	let mockCapabilityDetector: ProjectCapabilityDetector

	beforeEach(() => {
		mockCapabilityDetector = new ProjectCapabilityDetector()
		runner = new BuildRunner(mockCapabilityDetector)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('CLI Project Detection', () => {
		it('should detect CLI capability when bin field exists', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			const result = await runner.runBuild('/test/path')

			expect(mockCapabilityDetector.detectCapabilities).toHaveBeenCalledWith(
				'/test/path'
			)
			expect(result.success).toBe(true)
			expect(result.skipped).toBe(false)
		})

		it('should skip build when project is not a CLI project (no bin field)', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['web'], // Web project, not CLI
				binEntries: {},
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'next build' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)

			const result = await runner.runBuild('/test/path')

			expect(result.success).toBe(true)
			expect(result.skipped).toBe(true)
			expect(result.reason).toContain('not a CLI project')
			expect(packageManager.runScript).not.toHaveBeenCalled()
		})

		it('should skip build when project has no capabilities', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: [],
				binEntries: {},
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsc' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)

			const result = await runner.runBuild('/test/path')

			expect(result.success).toBe(true)
			expect(result.skipped).toBe(true)
			expect(result.reason).toContain('not a CLI project')
		})
	})

	describe('Build Script Detection', () => {
		it('should skip build when no build script exists', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: {}, // No build script
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(false)

			const result = await runner.runBuild('/test/path')

			expect(result.success).toBe(true)
			expect(result.skipped).toBe(true)
			expect(result.reason).toContain('No build script')
			expect(packageManager.runScript).not.toHaveBeenCalled()
		})

		it('should detect build script when it exists', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}
			const mockPkgJson: PackageJson = {
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue(mockPkgJson)
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runBuild('/test/path')

			expect(packageJson.hasScript).toHaveBeenCalledWith(mockPkgJson, 'build')
		})
	})

	describe('Build Execution', () => {
		it('should run build successfully for CLI projects with build script', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			const result = await runner.runBuild('/test/path')

			expect(result.success).toBe(true)
			expect(result.skipped).toBe(false)
			expect(packageManager.runScript).toHaveBeenCalledWith(
				'build',
				'/test/path',
				[],
				{ quiet: true }
			)
		})

		it('should throw detailed error when build fails', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Build failed')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(/Build failed/)
		})

		it('should use correct working directory', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runBuild('/custom/main/worktree')

			expect(packageManager.runScript).toHaveBeenCalledWith(
				'build',
				'/custom/main/worktree',
				[],
				{ quiet: true }
			)
		})
	})

	describe('Package Manager Detection', () => {
		it('should detect package manager correctly', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			await runner.runBuild('/test/path')

			expect(packageManager.detectPackageManager).toHaveBeenCalledWith(
				'/test/path'
			)
		})

		it('should use correct package manager command (pnpm build)', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Build failed')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(/pnpm build/)
		})

		it('should use correct package manager command (npm run build)', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('npm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Build failed')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(
				/npm run build/
			)
		})

		it('should use correct package manager command (yarn build)', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('yarn')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Build failed')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(/yarn build/)
		})
	})

	describe('Dry-Run Mode', () => {
		it('should respect dry-run mode', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

			const result = await runner.runBuild('/test/path', { dryRun: true })

			expect(result.success).toBe(true)
			expect(result.skipped).toBe(false)
			expect(packageManager.runScript).not.toHaveBeenCalled()
		})

		it('should still detect capabilities in dry-run mode', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

			await runner.runBuild('/test/path', { dryRun: true })

			expect(mockCapabilityDetector.detectCapabilities).toHaveBeenCalledWith(
				'/test/path'
			)
		})

		it('should still detect build script in dry-run mode', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}
			const mockPkgJson: PackageJson = {
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue(mockPkgJson)
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')

			await runner.runBuild('/test/path', { dryRun: true })

			expect(packageJson.hasScript).toHaveBeenCalledWith(mockPkgJson, 'build')
		})

		it('should skip non-CLI projects in dry-run mode', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['web'],
				binEntries: {},
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'next build' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)

			const result = await runner.runBuild('/test/path', { dryRun: true })

			expect(result.success).toBe(true)
			expect(result.skipped).toBe(true)
			expect(result.reason).toContain('not a CLI project')
		})
	})

	describe('Error Handling', () => {
		it('should provide clear error message for build failure', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Build failed')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(/Build failed/)
		})

		it('should include command to run for debugging (pnpm)', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Build failed')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(/pnpm build/)
		})

		it('should include command to run for debugging (npm)', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('npm')
			vi.mocked(packageManager.runScript).mockRejectedValue(
				new Error('Build failed')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(
				/npm run build/
			)
		})

		it('should handle non-ENOENT package.json read errors', async () => {
			vi.mocked(packageJson.readPackageJson).mockRejectedValue(
				new Error('Invalid JSON in package.json')
			)

			await expect(runner.runBuild('/test/path')).rejects.toThrow(
				/Invalid JSON/
			)
		})

		it('should skip build when package.json does not exist', async () => {
			vi.mocked(packageJson.readPackageJson).mockRejectedValue(
				new Error('package.json not found in /test/path')
			)

			const result = await runner.runBuild('/test/path')

			expect(result.success).toBe(true)
			expect(result.skipped).toBe(true)
			expect(result.reason).toContain('No package.json found')
			expect(packageManager.runScript).not.toHaveBeenCalled()
		})
	})

	describe('Duration Tracking', () => {
		it('should track duration for successful builds', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['cli'],
				binEntries: { il: './dist/cli.js' },
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'tsup' },
				bin: { il: './dist/cli.js' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)
			vi.mocked(packageManager.detectPackageManager).mockResolvedValue('pnpm')
			vi.mocked(packageManager.runScript).mockResolvedValue()

			const result = await runner.runBuild('/test/path')

			expect(result.duration).toBeGreaterThanOrEqual(0)
		})

		it('should track duration for skipped builds', async () => {
			const mockCapabilities: ProjectCapabilities = {
				capabilities: ['web'],
				binEntries: {},
			}

			vi.mocked(mockCapabilityDetector.detectCapabilities).mockResolvedValue(
				mockCapabilities
			)
			vi.mocked(packageJson.readPackageJson).mockResolvedValue({
				name: 'test',
				scripts: { build: 'next build' },
			})
			vi.mocked(packageJson.hasScript).mockReturnValue(true)

			const result = await runner.runBuild('/test/path')

			expect(result.duration).toBeGreaterThanOrEqual(0)
		})
	})
})
