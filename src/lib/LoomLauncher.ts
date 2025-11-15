import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openTerminalWindow, openMultipleTerminalWindows } from '../utils/terminal.js'
import type { TerminalWindowOptions } from '../utils/terminal.js'
import { openVSCodeWindow } from '../utils/vscode.js'
import { getDevServerLaunchCommand } from '../utils/dev-server.js'
import { generateColorFromBranchName } from '../utils/color.js'
import { logger } from '../utils/logger.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import type { Capability } from '../types/loom.js'

export interface LaunchLoomOptions {
	enableClaude: boolean
	enableCode: boolean
	enableDevServer: boolean
	enableTerminal: boolean
	worktreePath: string
	branchName: string
	port?: number
	capabilities: Capability[]
	workflowType: 'issue' | 'pr' | 'regular'
	identifier: string | number
	title?: string
	oneShot?: import('../types/index.js').OneShotMode
	setArguments?: string[] // Raw --set arguments to forward
	executablePath?: string // Executable path to use for ignite command
}

/**
 * LoomLauncher orchestrates opening loom components
 */
export class LoomLauncher {
	private claudeContext: ClaudeContextManager

	constructor(claudeContext?: ClaudeContextManager) {
		this.claudeContext = claudeContext ?? new ClaudeContextManager()
	}

	/**
	 * Launch loom components based on individual flags
	 */
	async launchLoom(options: LaunchLoomOptions): Promise<void> {
		const { enableClaude, enableCode, enableDevServer, enableTerminal } = options

		logger.debug(`Launching loom components: Claude=${enableClaude}, Code=${enableCode}, DevServer=${enableDevServer}, Terminal=${enableTerminal}`)

		const launchPromises: Promise<void>[] = []

		// Launch VSCode if enabled
		if (enableCode) {
			logger.debug('Launching VSCode')
			launchPromises.push(this.launchVSCode(options))
		}

		// Build array of terminals to launch
		const terminalsToLaunch: Array<{
			type: 'claude' | 'devServer' | 'terminal'
			options: TerminalWindowOptions
		}> = []

		if (enableDevServer) {
			terminalsToLaunch.push({
				type: 'devServer',
				options: await this.buildDevServerTerminalOptions(options),
			})
		}

		if (enableTerminal) {
			terminalsToLaunch.push({
				type: 'terminal',
				options: this.buildStandaloneTerminalOptions(options),
			})
		}

		if (enableClaude) {
			terminalsToLaunch.push({
				type: 'claude',
				options: await this.buildClaudeTerminalOptions(options),
			})
		}

		// Launch terminals based on count
		if (terminalsToLaunch.length > 1) {
			// Multiple terminals - launch as tabs in single window
			logger.debug(`Launching ${terminalsToLaunch.length} terminals in single window`)
			launchPromises.push(this.launchMultipleTerminals(terminalsToLaunch, options))
		} else if (terminalsToLaunch.length === 1) {
			// Single terminal - launch standalone
			const terminal = terminalsToLaunch[0]
			if (!terminal) {
				throw new Error('Terminal configuration is undefined')
			}
			const terminalType = terminal.type
			logger.debug(`Launching single ${terminalType} terminal`)

			if (terminalType === 'claude') {
				launchPromises.push(this.launchClaudeTerminal(options))
			} else if (terminalType === 'devServer') {
				launchPromises.push(this.launchDevServerTerminal(options))
			} else {
				launchPromises.push(this.launchStandaloneTerminal(options))
			}
		}

		// Wait for all components to launch
		await Promise.all(launchPromises)

		logger.success('loom launched successfully')
	}

	/**
	 * Launch VSCode
	 */
	private async launchVSCode(options: LaunchLoomOptions): Promise<void> {
		await openVSCodeWindow(options.worktreePath)
		logger.info('VSCode opened')
	}

	/**
	 * Launch Claude terminal
	 */
	private async launchClaudeTerminal(options: LaunchLoomOptions): Promise<void> {
		await this.claudeContext.launchWithContext({
			workspacePath: options.worktreePath,
			type: options.workflowType,
			identifier: options.identifier,
			branchName: options.branchName,
			...(options.title && { title: options.title }),
			...(options.port !== undefined && { port: options.port }),
			oneShot: options.oneShot ?? 'default',
			...(options.setArguments && { setArguments: options.setArguments }),
			...(options.executablePath && { executablePath: options.executablePath }),
		})
		logger.info('Claude terminal opened')
	}

	/**
	 * Launch dev server terminal
	 */
	private async launchDevServerTerminal(options: LaunchLoomOptions): Promise<void> {
		const colorData = generateColorFromBranchName(options.branchName)
		const devServerCommand = await getDevServerLaunchCommand(
			options.worktreePath,
			options.port,
			options.capabilities
		)

		await openTerminalWindow({
			workspacePath: options.worktreePath,
			command: devServerCommand,
			backgroundColor: colorData.rgb,
			includeEnvSetup: existsSync(join(options.worktreePath, '.env')),
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		})
		logger.info('Dev server terminal opened')
	}

	/**
	 * Launch standalone terminal (no command, just workspace with env vars)
	 */
	private async launchStandaloneTerminal(options: LaunchLoomOptions): Promise<void> {
		const colorData = generateColorFromBranchName(options.branchName)

		await openTerminalWindow({
			workspacePath: options.worktreePath,
			backgroundColor: colorData.rgb,
			includeEnvSetup: existsSync(join(options.worktreePath, '.env')),
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		})
		logger.info('Standalone terminal opened')
	}

	/**
	 * Build terminal options for Claude
	 */
	private async buildClaudeTerminalOptions(
		options: LaunchLoomOptions
	): Promise<TerminalWindowOptions> {
		const colorData = generateColorFromBranchName(options.branchName)
		const hasEnvFile = existsSync(join(options.worktreePath, '.env'))
		const claudeTitle = `Claude - ${this.formatIdentifier(options.workflowType, options.identifier)}`

		const executable = options.executablePath ?? 'il'
		let claudeCommand = `${executable} ignite`
		if (options.oneShot !== undefined && options.oneShot !== 'default') {
			claudeCommand += ` --one-shot=${options.oneShot}`
		}
		if (options.setArguments && options.setArguments.length > 0) {
			for (const setArg of options.setArguments) {
				claudeCommand += ` --set ${setArg}`
			}
		}

		return {
			workspacePath: options.worktreePath,
			command: claudeCommand,
			backgroundColor: colorData.rgb,
			title: claudeTitle,
			includeEnvSetup: hasEnvFile,
			...(options.port !== undefined && { port: options.port, includePortExport: true }),
		}
	}

	/**
	 * Build terminal options for dev server
	 */
	private async buildDevServerTerminalOptions(
		options: LaunchLoomOptions
	): Promise<TerminalWindowOptions> {
		const colorData = generateColorFromBranchName(options.branchName)
		const devServerCommand = await getDevServerLaunchCommand(
			options.worktreePath,
			options.port,
			options.capabilities
		)
		const hasEnvFile = existsSync(join(options.worktreePath, '.env'))
		const devServerTitle = `Dev Server - ${this.formatIdentifier(options.workflowType, options.identifier)}`

		return {
			workspacePath: options.worktreePath,
			command: devServerCommand,
			backgroundColor: colorData.rgb,
			title: devServerTitle,
			includeEnvSetup: hasEnvFile,
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		}
	}

	/**
	 * Build terminal options for standalone terminal (no command)
	 */
	private buildStandaloneTerminalOptions(
		options: LaunchLoomOptions
	): TerminalWindowOptions {
		const colorData = generateColorFromBranchName(options.branchName)
		const hasEnvFile = existsSync(join(options.worktreePath, '.env'))
		const terminalTitle = `Terminal - ${this.formatIdentifier(options.workflowType, options.identifier)}`

		return {
			workspacePath: options.worktreePath,
			backgroundColor: colorData.rgb,
			title: terminalTitle,
			includeEnvSetup: hasEnvFile,
			includePortExport: options.capabilities.includes('web'),
			...(options.port !== undefined && { port: options.port }),
		}
	}

	/**
	 * Launch multiple terminals (2+) as tabs in single window
	 */
	private async launchMultipleTerminals(
		terminals: Array<{ type: string; options: TerminalWindowOptions }>,
		_options: LaunchLoomOptions
	): Promise<void> {
		const terminalOptions = terminals.map((t) => t.options)

		await openMultipleTerminalWindows(terminalOptions)

		const terminalTypes = terminals.map((t) => t.type).join(' + ')
		logger.info(`Multiple terminals opened: ${terminalTypes}`)
	}

	/**
	 * Format identifier for terminal tab titles
	 */
	private formatIdentifier(workflowType: 'issue' | 'pr' | 'regular', identifier: string | number): string {
		if (workflowType === 'issue') {
			return `Issue #${identifier}`
		} else if (workflowType === 'pr') {
			return `PR #${identifier}`
		} else {
			return `Branch: ${identifier}`
		}
	}
}
