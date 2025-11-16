import fs from 'fs-extra'
import path from 'path'
import { logger } from '../utils/logger.js'
import { promptConfirmation } from '../utils/prompt.js'

/**
 * Manages migration of legacy .hatchbox settings to .iloom
 * Part of rebranding effort - ensures existing users' configurations are preserved
 */
export class SettingsMigrationManager {
	private readonly oldDir = '.hatchbox'
	private readonly newDir = '.iloom'
	private readonly settingsFiles = ['settings.local.json', 'settings.json']

	/**
	 * Migrate settings from .hatchbox to .iloom if needed
	 * Only copies files that don't already exist in target
	 * Prompts user for cleanup after successful migration
	 */
	async migrateSettingsIfNeeded(projectRoot?: string): Promise<void> {
		const root = projectRoot ?? process.cwd()
		const oldDirPath = path.join(root, this.oldDir)
		const newDirPath = path.join(root, this.newDir)

		// Check if .hatchbox directory exists (skip if it doesn't)
		const oldDirExists = await fs.pathExists(oldDirPath)
		if (!oldDirExists) {
			logger.debug('No .hatchbox directory found, skipping migration')
			return
		}

		// Check if any target files need migration
		const needsMigration = await this.checkIfMigrationNeeded(
			newDirPath,
			oldDirPath
		)
		if (!needsMigration) {
			logger.debug('All .iloom settings files already exist, skipping migration')
			return
		}

		// Create .iloom directory if needed
		await fs.mkdir(newDirPath, { recursive: true })

		// Copy each settings file if source exists and target doesn't
		const migratedFiles: string[] = []
		for (const filename of this.settingsFiles) {
			const wasCopied = await this.copySettingsFile(
				oldDirPath,
				newDirPath,
				filename
			)
			if (wasCopied) {
				migratedFiles.push(filename)
			}
		}

		// If files were migrated, update .gitignore and prompt for cleanup
		if (migratedFiles.length > 0) {
			// Always update .gitignore when files are migrated
			await this.updateGitignore(root)

			// Prompt for cleanup of old directory
			await this.promptForCleanup(root, migratedFiles)
		}
	}

	/**
	 * Check if any settings files need migration
	 */
	private async checkIfMigrationNeeded(
		newDirPath: string,
		oldDirPath: string
	): Promise<boolean> {
		for (const filename of this.settingsFiles) {
			const targetPath = path.join(newDirPath, filename)
			const sourcePath = path.join(oldDirPath, filename)

			// If target doesn't exist but source does, migration is needed
			const targetExists = await fs.pathExists(targetPath)
			const sourceExists = await fs.pathExists(sourcePath)

			if (!targetExists && sourceExists) {
				return true
			}
		}
		return false
	}

	/**
	 * Copy a single settings file from .hatchbox to .iloom
	 * Returns true if file was copied
	 */
	private async copySettingsFile(
		sourceDir: string,
		targetDir: string,
		filename: string
	): Promise<boolean> {
		const sourcePath = path.join(sourceDir, filename)
		const targetPath = path.join(targetDir, filename)

		// Check if source exists
		const sourceExists = await fs.pathExists(sourcePath)
		if (!sourceExists) {
			logger.debug(`Source file ${sourcePath} does not exist, skipping`)
			return false
		}

		// Check if target exists (don't overwrite)
		const targetExists = await fs.pathExists(targetPath)
		if (targetExists) {
			logger.debug(`Target file ${targetPath} already exists, skipping`)
			return false
		}

		// Copy file
		await fs.copy(sourcePath, targetPath, { overwrite: false })
		logger.success(`Migrated ${filename} from .hatchbox to .iloom`)
		return true
	}

	/**
	 * Prompt user to delete old .hatchbox configuration directory
	 */
	private async promptForCleanup(
		projectRoot: string,
		migratedFiles: string[]
	): Promise<void> {
		// Display migration summary
		logger.info('\n✨ Configuration migration complete!')
		logger.info('The following files were migrated from .hatchbox to .iloom:')
		for (const file of migratedFiles) {
			logger.info(`  - ${file}`)
		}
		logger.info('Updated .gitignore to use .iloom paths')

		// Skip prompt if not in interactive terminal (e.g., during tests)
		if (!process.stdin.isTTY) {
			logger.debug(
				'Skipping cleanup prompt - not in interactive terminal'
			)
			return
		}

		// Prompt user for deletion
		const shouldDelete = await promptConfirmation(
			'\nWould you like to delete the old .hatchbox directory? (recommended)',
			true
		)

		if (shouldDelete) {
			// Remove .hatchbox directory
			const oldDirPath = path.join(projectRoot, this.oldDir)
			await fs.remove(oldDirPath)
			logger.success('Removed .hatchbox directory')
		} else {
			logger.info(
				'Keeping .hatchbox directory. You can manually delete it later if desired.'
			)
		}
	}

	/**
	 * Update .gitignore to replace .hatchbox references with .iloom
	 */
	private async updateGitignore(projectRoot: string): Promise<void> {
		const gitignorePath = path.join(projectRoot, '.gitignore')

		// Check if .gitignore exists
		const gitignoreExists = await fs.pathExists(gitignorePath)
		if (!gitignoreExists) {
			logger.debug('No .gitignore file found, skipping .gitignore update')
			return
		}

		// Read .gitignore
		const content = await fs.readFile(gitignorePath, 'utf-8')

		// Replace .hatchbox with .iloom and Hatchbox with iloom
		const updatedContent = content
			.replace(/\.hatchbox/g, '.iloom')
			.replace(/Hatchbox/g, 'iloom')

		// Only write if content actually changed
		if (updatedContent !== content) {
			await fs.writeFile(gitignorePath, updatedContent, 'utf-8')
			logger.success('Updated .gitignore: replaced .hatchbox references with .iloom')
		} else {
			logger.debug('No .hatchbox references found in .gitignore')
		}
	}
}
