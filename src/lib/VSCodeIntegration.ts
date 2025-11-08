import fs from 'fs-extra'
import path from 'path'
import { parse, modify, applyEdits } from 'jsonc-parser'
import { logger } from '../utils/logger.js'
import {
	hexToRgb,
	rgbToHex,
	lightenColor,
	calculateForegroundColor,
} from '../utils/color.js'

/**
 * VSCode settings structure
 */
interface VSCodeSettings {
	'workbench.colorCustomizations'?: {
		// Title Bar
		'titleBar.activeBackground'?: string
		'titleBar.inactiveBackground'?: string
		'titleBar.activeForeground'?: string
		'titleBar.inactiveForeground'?: string
		// Status Bar
		'statusBar.background'?: string
		'statusBar.foreground'?: string
		'statusBarItem.hoverBackground'?: string
		'statusBarItem.remoteBackground'?: string
		'statusBarItem.remoteForeground'?: string
		// UI Accents
		'sash.hoverBorder'?: string
		'commandCenter.border'?: string
		[key: string]: string | undefined
	}
	[key: string]: unknown
}

/**
 * Manages VSCode settings.json manipulation for workspace color synchronization
 */
export class VSCodeIntegration {
	/**
	 * Set VSCode title bar color for a workspace
	 *
	 * @param workspacePath - Path to workspace directory
	 * @param hexColor - Hex color string (e.g., "#dcebf8")
	 */
	async setTitleBarColor(workspacePath: string, hexColor: string): Promise<void> {
		const vscodeDir = path.join(workspacePath, '.vscode')
		const settingsPath = path.join(vscodeDir, 'settings.json')

		try {
			// Ensure .vscode directory exists
			await fs.ensureDir(vscodeDir)

			// Read existing settings (or create empty object)
			const settings = await this.readSettings(settingsPath)

			// Merge color settings
			const updatedSettings = this.mergeColorSettings(settings, hexColor)

			// Write settings atomically
			await this.writeSettings(settingsPath, updatedSettings)

			logger.debug(`Set VSCode title bar color to ${hexColor} for ${workspacePath}`)
		} catch (error) {
			throw new Error(
				`Failed to set VSCode title bar color: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Read VSCode settings from file
	 * Supports JSONC (JSON with Comments)
	 *
	 * @param settingsPath - Path to settings.json file
	 * @returns Parsed settings object
	 */
	private async readSettings(settingsPath: string): Promise<VSCodeSettings> {
		try {
			// Check if file exists
			if (!(await fs.pathExists(settingsPath))) {
				return {}
			}

			// Read file content
			const content = await fs.readFile(settingsPath, 'utf8')

			// Parse JSONC (handles comments)
			const errors: import('jsonc-parser').ParseError[] = []
			const settings = parse(content, errors, { allowTrailingComma: true })

			// Check for parse errors
			if (errors.length > 0) {
				const firstError = errors[0]
				throw new Error(`Invalid JSON: ${firstError ? firstError.error : 'Unknown parse error'}`)
			}

			return settings ?? {}
		} catch (error) {
			throw new Error(
				`Failed to parse settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Write VSCode settings to file atomically
	 * Preserves comments if present (using JSONC parser)
	 *
	 * @param settingsPath - Path to settings.json file
	 * @param settings - Settings object to write
	 */
	private async writeSettings(
		settingsPath: string,
		settings: VSCodeSettings
	): Promise<void> {
		try {
			let content: string

			// Check if file exists with comments
			if (await fs.pathExists(settingsPath)) {
				const existingContent = await fs.readFile(settingsPath, 'utf8')

				// Try to preserve comments by using jsonc-parser's modify function
				if (existingContent.includes('//') || existingContent.includes('/*')) {
					// File has comments - use JSONC modify to preserve them
					content = await this.modifyWithCommentsPreserved(existingContent, settings)
				} else {
					// No comments - use standard JSON.stringify
					content = JSON.stringify(settings, null, 2) + '\n'
				}
			} else {
				// New file - use standard JSON.stringify
				content = JSON.stringify(settings, null, 2) + '\n'
			}

			// Write atomically using temp file + rename
			const tempPath = `${settingsPath}.tmp`
			await fs.writeFile(tempPath, content, 'utf8')
			await fs.rename(tempPath, settingsPath)
		} catch (error) {
			throw new Error(
				`Failed to write settings.json: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Modify JSONC content while preserving comments
	 *
	 * @param existingContent - Original JSONC content
	 * @param newSettings - New settings to apply
	 * @returns Modified JSONC content with comments preserved
	 */
	private async modifyWithCommentsPreserved(
		existingContent: string,
		newSettings: VSCodeSettings
	): Promise<string> {
		let modifiedContent = existingContent

		// Apply each setting modification
		for (const [key, value] of Object.entries(newSettings)) {
			const edits = modify(modifiedContent, [key], value, {})
			modifiedContent = applyEdits(modifiedContent, edits)
		}

		return modifiedContent
	}

	/**
	 * Merge color settings into existing settings object
	 *
	 * @param existing - Existing settings object
	 * @param hexColor - Hex color to apply (subtle palette color)
	 * @returns Updated settings object with color merged
	 */
	private mergeColorSettings(existing: VSCodeSettings, hexColor: string): VSCodeSettings {
		// Clone existing settings
		const updated: VSCodeSettings = { ...existing }

		// Initialize workbench.colorCustomizations if needed
		updated['workbench.colorCustomizations'] ??= {}

		const colors = updated['workbench.colorCustomizations']

		// Convert hex to RGB for manipulation
		const baseRgb = hexToRgb(hexColor)

		// Calculate foreground color based on background luminance
		const foreground = calculateForegroundColor(baseRgb)
		const foregroundTransparent = foreground.replace('#', '#') + '99' // Add 60% opacity

		// Create lighter variant for hover states
		const lighterRgb = lightenColor(baseRgb, 0.05) // 5% lighter
		const lighterHex = rgbToHex(lighterRgb.r, lighterRgb.g, lighterRgb.b)

		// Title Bar - subtle top indicator
		colors['titleBar.activeBackground'] = hexColor
		colors['titleBar.inactiveBackground'] = hexColor + '99' // Semi-transparent when unfocused
		colors['titleBar.activeForeground'] = foreground
		colors['titleBar.inactiveForeground'] = foregroundTransparent

		// Status Bar - constant visibility at bottom
		colors['statusBar.background'] = hexColor
		colors['statusBar.foreground'] = foreground
		colors['statusBarItem.hoverBackground'] = lighterHex
		colors['statusBarItem.remoteBackground'] = hexColor // When connected to remote
		colors['statusBarItem.remoteForeground'] = foreground

		// UI Accents - subtle hints
		colors['sash.hoverBorder'] = hexColor // Resize borders
		colors['commandCenter.border'] = foregroundTransparent // Search box border

		return updated
	}
}
