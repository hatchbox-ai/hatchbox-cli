import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SettingsMigrationManager } from './SettingsMigrationManager.js'
import fs from 'fs-extra'
import * as prompt from '../utils/prompt.js'

vi.mock('fs-extra')
vi.mock('../utils/prompt.js')
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		success: vi.fn(),
		debug: vi.fn(),
	},
}))

describe('SettingsMigrationManager', () => {
	let manager: SettingsMigrationManager
	const mockFs = vi.mocked(fs)
	const mockPrompt = vi.mocked(prompt)

	beforeEach(() => {
		vi.clearAllMocks()
		manager = new SettingsMigrationManager()
		// Mock stdin.isTTY as true by default so prompts work
		Object.defineProperty(process.stdin, 'isTTY', {
			value: true,
			configurable: true,
		})
	})

	describe('migrateSettingsIfNeeded', () => {
		it('should skip migration when source .hatchbox directory does not exist', async () => {
			mockFs.pathExists.mockResolvedValue(false)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.pathExists).toHaveBeenCalledWith('/test/root/.hatchbox')
			expect(mockFs.mkdir).not.toHaveBeenCalled()
			expect(mockFs.copy).not.toHaveBeenCalled()
		})

		it('should skip migration when all target files already exist', async () => {
			mockFs.pathExists.mockResolvedValue(true)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.pathExists).toHaveBeenCalledWith('/test/root/.hatchbox')
			expect(mockFs.copy).not.toHaveBeenCalled()
		})

		it('should copy settings.local.json from .hatchbox to .iloom when target does not exist', async () => {
			mockFs.pathExists
				// .hatchbox exists
				.mockResolvedValueOnce(true)
				// checkIfMigrationNeeded: settings.local.json target doesn't exist
				.mockResolvedValueOnce(false)
				// checkIfMigrationNeeded: settings.local.json source exists
				.mockResolvedValueOnce(true)
				// checkIfMigrationNeeded: settings.json target exists (skip checking source)
				.mockResolvedValueOnce(true)
				// checkIfMigrationNeeded: settings.json source (not checked because target exists)
				.mockResolvedValueOnce(false)
				// copySettingsFile: settings.local.json source exists
				.mockResolvedValueOnce(true)
				// copySettingsFile: settings.local.json target doesn't exist
				.mockResolvedValueOnce(false)
				// copySettingsFile: settings.json source doesn't exist (skip)
				.mockResolvedValueOnce(false)
			mockPrompt.promptConfirmation.mockResolvedValue(false)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.mkdir).toHaveBeenCalledWith('/test/root/.iloom', {
				recursive: true,
			})
			expect(mockFs.copy).toHaveBeenCalledWith(
				'/test/root/.hatchbox/settings.local.json',
				'/test/root/.iloom/settings.local.json',
				{ overwrite: false }
			)
		})

		it('should copy both files when both need migration', async () => {
			mockFs.pathExists
				// .hatchbox exists
				.mockResolvedValueOnce(true)
				// checkIfMigrationNeeded: settings.local.json target doesn't exist
				.mockResolvedValueOnce(false)
				// checkIfMigrationNeeded: settings.local.json source exists (returns true immediately)
				.mockResolvedValueOnce(true)
				// copySettingsFile: settings.local.json source exists
				.mockResolvedValueOnce(true)
				// copySettingsFile: settings.local.json target doesn't exist
				.mockResolvedValueOnce(false)
				// copySettingsFile: settings.json source exists
				.mockResolvedValueOnce(true)
				// copySettingsFile: settings.json target doesn't exist
				.mockResolvedValueOnce(false)
			mockPrompt.promptConfirmation.mockResolvedValue(false)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.copy).toHaveBeenCalledTimes(2)
			expect(mockFs.copy).toHaveBeenCalledWith(
				'/test/root/.hatchbox/settings.local.json',
				'/test/root/.iloom/settings.local.json',
				{ overwrite: false }
			)
			expect(mockFs.copy).toHaveBeenCalledWith(
				'/test/root/.hatchbox/settings.json',
				'/test/root/.iloom/settings.json',
				{ overwrite: false }
			)
		})

		it('should create .iloom directory if it does not exist', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists
				.mockResolvedValueOnce(true) // settings.json target exists
				.mockResolvedValueOnce(false) // settings.json source (not needed)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false) // source doesn't exist for settings.json
			mockPrompt.promptConfirmation.mockResolvedValue(false)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.mkdir).toHaveBeenCalledWith('/test/root/.iloom', {
				recursive: true,
			})
		})

		it('should not copy if source file does not exist', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(false) // source doesn't exist - no migration needed
				.mockResolvedValueOnce(false) // settings.json target doesn't exist
				.mockResolvedValueOnce(false) // settings.json source doesn't exist

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.copy).not.toHaveBeenCalled()
			expect(mockPrompt.promptConfirmation).not.toHaveBeenCalled()
		})

		it('should prompt user for cleanup after successful migration', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists
				.mockResolvedValueOnce(true) // settings.json target exists
				.mockResolvedValueOnce(false) // settings.json source
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false) // settings.json source doesn't exist
			mockPrompt.promptConfirmation.mockResolvedValue(false)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockPrompt.promptConfirmation).toHaveBeenCalledWith(
				expect.stringContaining('delete the old .hatchbox directory'),
				true
			)
		})

		it('should skip prompt when not in TTY', async () => {
			Object.defineProperty(process.stdin, 'isTTY', {
				value: false,
				configurable: true,
			})

			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists
				.mockResolvedValueOnce(true) // settings.json target exists
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockPrompt.promptConfirmation).not.toHaveBeenCalled()
		})

		it('should remove .hatchbox directory when user confirms deletion', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists
				.mockResolvedValueOnce(true) // settings.json target exists
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true) // .gitignore exists
			mockPrompt.promptConfirmation.mockResolvedValue(true)
			mockFs.readFile.mockResolvedValue('')

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.remove).toHaveBeenCalledWith('/test/root/.hatchbox')
		})

		it('should update .gitignore when user confirms deletion', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists (returns true immediately)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false) // settings.json source doesn't exist
				.mockResolvedValueOnce(true) // .gitignore exists
			mockPrompt.promptConfirmation.mockResolvedValue(true)
			mockFs.readFile.mockResolvedValue(
				'node_modules\n.hatchbox/settings.local.json\n.env'
			)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.readFile).toHaveBeenCalledWith(
				'/test/root/.gitignore',
				'utf-8'
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/root/.gitignore',
				'node_modules\n.iloom/settings.local.json\n.env',
				'utf-8'
			)
		})

		it('should update .gitignore but not delete directory when user declines deletion', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists (returns true immediately)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false) // settings.json source doesn't exist
				.mockResolvedValueOnce(true) // .gitignore exists
			mockPrompt.promptConfirmation.mockResolvedValue(false)
			mockFs.readFile.mockResolvedValue(
				'node_modules\n.hatchbox/settings.local.json\n.env'
			)

			await manager.migrateSettingsIfNeeded('/test/root')

			// Directory should NOT be deleted when user declines
			expect(mockFs.remove).not.toHaveBeenCalled()

			// But .gitignore should still be updated since files were migrated
			expect(mockFs.readFile).toHaveBeenCalledWith(
				'/test/root/.gitignore',
				'utf-8'
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/root/.gitignore',
				'node_modules\n.iloom/settings.local.json\n.env',
				'utf-8'
			)
		})

		it('should handle missing .gitignore gracefully', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists
				.mockResolvedValueOnce(true) // settings.json target exists
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(false) // .gitignore doesn't exist
			mockPrompt.promptConfirmation.mockResolvedValue(true)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.remove).toHaveBeenCalledWith('/test/root/.hatchbox')
			expect(mockFs.readFile).not.toHaveBeenCalled()
			expect(mockFs.writeFile).not.toHaveBeenCalled()
		})

		it('should update "Added by Hatchbox AI CLI" comment and .hatchbox paths to iloom', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists (returns true immediately)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false) // settings.json source doesn't exist
				.mockResolvedValueOnce(true) // .gitignore exists
			mockPrompt.promptConfirmation.mockResolvedValue(true)
			mockFs.readFile.mockResolvedValue(
				'node_modules\n# Added by Hatchbox AI CLI\n.hatchbox/settings.local.json\n.env'
			)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/root/.gitignore',
				'node_modules\n# Added by iloom AI CLI\n.iloom/settings.local.json\n.env',
				'utf-8'
			)
		})

		it('should update all Hatchbox references to iloom throughout .gitignore', async () => {
			mockFs.pathExists
				.mockResolvedValueOnce(true) // .hatchbox exists
				.mockResolvedValueOnce(false) // target doesn't exist
				.mockResolvedValueOnce(true) // source exists (returns true immediately)
				.mockResolvedValueOnce(true) // source exists for copy
				.mockResolvedValueOnce(false) // target doesn't exist for copy
				.mockResolvedValueOnce(false) // settings.json source doesn't exist
				.mockResolvedValueOnce(true) // .gitignore exists
			mockPrompt.promptConfirmation.mockResolvedValue(true)
			mockFs.readFile.mockResolvedValue(
				'node_modules\n# Added by Hatchbox AI CLI\n.iloom/settings.local.json\n.hatchbox/settings.json\n.env'
			)

			await manager.migrateSettingsIfNeeded('/test/root')

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				'/test/root/.gitignore',
				'node_modules\n# Added by iloom AI CLI\n.iloom/settings.local.json\n.iloom/settings.json\n.env',
				'utf-8'
			)
		})

		it('should use current working directory when projectRoot not provided', async () => {
			mockFs.pathExists.mockResolvedValue(false)

			await manager.migrateSettingsIfNeeded()

			expect(mockFs.pathExists).toHaveBeenCalledWith(
				expect.stringContaining('.hatchbox')
			)
		})
	})
})
