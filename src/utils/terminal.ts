import { execa } from 'execa'
import { existsSync } from 'node:fs'
import type { Platform } from '../types/index.js'

export interface TerminalWindowOptions {
	workspacePath?: string
	command?: string
	backgroundColor?: { r: number; g: number; b: number }
	port?: number
	includeEnvSetup?: boolean // source .env
	includePortExport?: boolean // export PORT=<port>
	title?: string // Terminal tab title
}

/**
 * Detect current platform
 */
export function detectPlatform(): Platform {
	const platform = process.platform
	if (platform === 'darwin') return 'darwin'
	if (platform === 'linux') return 'linux'
	if (platform === 'win32') return 'win32'
	return 'unsupported'
}

/**
 * Detect if iTerm2 is installed on macOS
 * Returns false on non-macOS platforms
 */
export async function detectITerm2(): Promise<boolean> {
	const platform = detectPlatform()
	if (platform !== 'darwin') return false

	// Check if iTerm.app exists at standard location
	return existsSync('/Applications/iTerm.app')
}

/**
 * Open new terminal window with specified options
 * Currently supports macOS only
 */
export async function openTerminalWindow(
	options: TerminalWindowOptions
): Promise<void> {
	const platform = detectPlatform()

	if (platform !== 'darwin') {
		throw new Error(
			`Terminal window launching not yet supported on ${platform}. ` +
				`Currently only macOS is supported.`
		)
	}

	// macOS implementation using AppleScript
	const applescript = buildAppleScript(options)

	try {
		await execa('osascript', ['-e', applescript])

		// Activate Terminal.app to bring windows to front
		await execa('osascript', ['-e', 'tell application "Terminal" to activate'])
	} catch (error) {
		throw new Error(
			`Failed to open terminal window: ${error instanceof Error ? error.message : 'Unknown error'}`
		)
	}
}

/**
 * Build AppleScript for macOS Terminal.app
 */
function buildAppleScript(options: TerminalWindowOptions): string {
	const {
		workspacePath,
		command,
		backgroundColor,
		port,
		includeEnvSetup,
		includePortExport,
	} = options

	// Build command sequence
	const commands: string[] = []

	// Navigate to workspace
	if (workspacePath) {
		commands.push(`cd '${escapePathForAppleScript(workspacePath)}'`)
	}

	// Source .env file
	if (includeEnvSetup) {
		commands.push('source .env')
	}

	// Export PORT variable
	if (includePortExport && port !== undefined) {
		commands.push(`export PORT=${port}`)
	}

	// Add custom command
	if (command) {
		commands.push(command)
	}

	// Join with &&
	const fullCommand = commands.join(' && ')

	// Prefix with space to prevent shell history pollution
	// Most shells (bash/zsh) ignore commands starting with space when HISTCONTROL=ignorespace
	const historyFreeCommand = ` ${fullCommand}`

	// Build AppleScript
	let script = `tell application "Terminal"\n`
	script += `  set newTab to do script "${escapeForAppleScript(historyFreeCommand)}"\n`

	// Apply background color if provided
	if (backgroundColor) {
		const { r, g, b } = backgroundColor
		// Convert 8-bit RGB (0-255) to 16-bit RGB (0-65535)
		script += `  set background color of newTab to {${Math.round(r * 257)}, ${Math.round(g * 257)}, ${Math.round(b * 257)}}\n`
	}

	script += `end tell`

	return script
}

/**
 * Escape path for AppleScript string
 * Single quotes in path need special escaping
 */
function escapePathForAppleScript(path: string): string {
	// Replace single quote with '\''
	return path.replace(/'/g, "'\\''")
}

/**
 * Escape command for AppleScript do script
 * Must handle double quotes and backslashes
 */
function escapeForAppleScript(command: string): string {
	return (
		command
			.replace(/\\/g, '\\\\') // Escape backslashes
			.replace(/"/g, '\\"') // Escape double quotes
	)
}

/**
 * Build command sequence for terminal
 */
function buildCommandSequence(options: TerminalWindowOptions): string {
	const {
		workspacePath,
		command,
		port,
		includeEnvSetup,
		includePortExport,
	} = options

	const commands: string[] = []

	// Navigate to workspace
	if (workspacePath) {
		commands.push(`cd '${escapePathForAppleScript(workspacePath)}'`)
	}

	// Source .env file
	if (includeEnvSetup) {
		commands.push('source .env')
	}

	// Export PORT variable
	if (includePortExport && port !== undefined) {
		commands.push(`export PORT=${port}`)
	}

	// Add custom command
	if (command) {
		commands.push(command)
	}

	// Join with &&
	const fullCommand = commands.join(' && ')

	// Prefix with space to prevent shell history pollution
	return ` ${fullCommand}`
}

/**
 * Build iTerm2 AppleScript for dual tabs in single window
 */
function buildITerm2DualTabScript(
	options1: TerminalWindowOptions,
	options2: TerminalWindowOptions
): string {
	const command1 = buildCommandSequence(options1)
	const command2 = buildCommandSequence(options2)

	let script = 'tell application id "com.googlecode.iterm2"\n'
	script += '  create window with default profile\n'
	script += '  set newWindow to current window\n'
	script += '  set s1 to current session of newWindow\n\n'

	// Set background color for first tab
	if (options1.backgroundColor) {
		const { r, g, b } = options1.backgroundColor
		// Convert 8-bit RGB (0-255) to 16-bit RGB (0-65535)
		script += `  set background color of s1 to {${Math.round(r * 257)}, ${Math.round(g * 257)}, ${Math.round(b * 257)}}\n`
	}

	// Execute command in first tab
	script += `  tell s1 to write text "${escapeForAppleScript(command1)}"\n\n`

	// Set tab title for first tab
	if (options1.title) {
		script += `  set name of s1 to "${escapeForAppleScript(options1.title)}"\n\n`
	}

	// Create second tab
	script += '  tell newWindow\n'
	script += '    set newTab to (create tab with default profile)\n'
	script += '  end tell\n'
	script += '  set s2 to current session of newTab\n\n'

	// Set background color for second tab
	if (options2.backgroundColor) {
		const { r, g, b } = options2.backgroundColor
		// Convert 8-bit RGB (0-255) to 16-bit RGB (0-65535)
		script += `  set background color of s2 to {${Math.round(r * 257)}, ${Math.round(g * 257)}, ${Math.round(b * 257)}}\n`
	}

	// Execute command in second tab
	script += `  tell s2 to write text "${escapeForAppleScript(command2)}"\n\n`

	// Set tab title for second tab
	if (options2.title) {
		script += `  set name of s2 to "${escapeForAppleScript(options2.title)}"\n\n`
	}

	// Activate iTerm2
	script += '  activate\n'
	script += 'end tell'

	return script
}

/**
 * Open dual terminal windows/tabs with specified options
 * If iTerm2 is available on macOS, creates single window with two tabs
 * Otherwise falls back to two separate Terminal.app windows
 */
export async function openDualTerminalWindow(
	options1: TerminalWindowOptions,
	options2: TerminalWindowOptions
): Promise<void> {
	const platform = detectPlatform()

	if (platform !== 'darwin') {
		throw new Error(
			`Terminal window launching not yet supported on ${platform}. ` +
				`Currently only macOS is supported.`
		)
	}

	// Detect if iTerm2 is available
	const hasITerm2 = await detectITerm2()

	if (hasITerm2) {
		// Use iTerm2 with dual tabs in single window
		const applescript = buildITerm2DualTabScript(options1, options2)

		try {
			await execa('osascript', ['-e', applescript])
		} catch (error) {
			throw new Error(
				`Failed to open iTerm2 window: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	} else {
		// Fall back to dual Terminal.app windows
		await openTerminalWindow(options1)

		// Brief pause to let first terminal initialize
		// eslint-disable-next-line no-undef
		await new Promise<void>((resolve) => setTimeout(resolve, 1000))

		await openTerminalWindow(options2)
	}
}
