import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openTerminalWindow, openDualTerminalWindow } from '../utils/terminal.js'
import { openVSCodeWindow } from '../utils/vscode.js'
import { getDevServerLaunchCommand } from '../utils/dev-server.js'
import { generateColorFromBranchName } from '../utils/color.js'
import { logger } from '../utils/logger.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import type { Capability } from '../types/hatchbox.js'

export interface LaunchHatchboxOptions {
	enableClaude: boolean
	enableCode: boolean
	enableDevServer: boolean
	worktreePath: string
	branchName: string
	port?: number
	capabilities: Capability[]
	workflowType: 'issue' | 'pr' | 'regular'
	identifier: string | number
	title?: string
	oneShot?: import('../types/index.js').OneShotMode
}

/**
 * HatchboxLauncher orchestrates opening hatchbox components
 */
export class HatchboxLauncher {
	private claudeContext: ClaudeContextManager

	constructor() {
		this.claudeContext = new ClaudeContextManager()
	}

	/**
	 * Launch hatchbox components based on individual flags
	 */
	async launchHatchbox(options: LaunchHatchboxOptions): Promise<void> {
		const { enableClaude, enableCode, enableDevServer } = options

		logger.debug(`Launching hatchbox components: Claude=${enableClaude}, Code=${enableCode}, DevServer=${enableDevServer}`)

		const launchPromises: Promise<void>[] = []

		// Launch VSCode if enabled
		if (enableCode) {
			logger.debug('Launching VSCode')
			launchPromises.push(this.launchVSCode(options))
		}

		// Launch terminal if Claude or dev server is enabled
		if (enableClaude || enableDevServer) {
			if (enableClaude && enableDevServer) {
				// Both Claude and dev server - launch dual terminals
				logger.debug('Launching dual terminals: Claude + dev server')
				launchPromises.push(this.launchDualTerminals(options))
			} else if (enableClaude) {
				// Claude only
				logger.debug('Launching Claude terminal')
				launchPromises.push(this.launchClaudeTerminal(options))
			} else {
				// Dev server only
				logger.debug('Launching dev server terminal')
				launchPromises.push(this.launchDevServerTerminal(options))
			}
		}

		// Wait for all components to launch
		await Promise.all(launchPromises)

		logger.success('Hatchbox launched successfully')
	}

	/**
	 * Launch VSCode
	 */
	private async launchVSCode(options: LaunchHatchboxOptions): Promise<void> {
		await openVSCodeWindow(options.worktreePath)
		logger.info('VSCode opened')
	}

	/**
	 * Launch Claude terminal
	 */
	private async launchClaudeTerminal(options: LaunchHatchboxOptions): Promise<void> {
		await this.claudeContext.launchWithContext({
			workspacePath: options.worktreePath,
			type: options.workflowType,
			identifier: options.identifier,
			branchName: options.branchName,
			...(options.title && { title: options.title }),
			...(options.port !== undefined && { port: options.port }),
			oneShot: options.oneShot ?? 'default',
		})
		logger.info('Claude terminal opened')
	}

	/**
	 * Launch dev server terminal
	 */
	private async launchDevServerTerminal(options: LaunchHatchboxOptions): Promise<void> {
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
	 * Launch dual terminals: Claude + dev server
	 * Uses iTerm2 with tabs if available, otherwise falls back to separate Terminal.app windows
	 */
	private async launchDualTerminals(options: LaunchHatchboxOptions): Promise<void> {
		const colorData = generateColorFromBranchName(options.branchName)
		const devServerCommand = await getDevServerLaunchCommand(
			options.worktreePath,
			options.port,
			options.capabilities
		)
		const hasEnvFile = existsSync(join(options.worktreePath, '.env'))

		// Generate tab titles based on workflow type
		const claudeTitle = `Claude - ${this.formatIdentifier(options.workflowType, options.identifier)}`
		const devServerTitle = `Dev Server - ${this.formatIdentifier(options.workflowType, options.identifier)}`

		// Build launch command for Claude
		let claudeCommand = "hb ignite"
		if (options.oneShot !== undefined && options.oneShot !== 'default') {
			claudeCommand += ` --one-shot=${options.oneShot}`
		}

		// Launch dual terminals (iTerm2 tabs or separate Terminal.app windows)
		await openDualTerminalWindow(
			{
				workspacePath: options.worktreePath,
				command: claudeCommand,
				backgroundColor: colorData.rgb,
				title: claudeTitle,
				includeEnvSetup: hasEnvFile,
				...(options.port !== undefined && { port: options.port, includePortExport: true }),
			},
			{
				workspacePath: options.worktreePath,
				command: devServerCommand,
				backgroundColor: colorData.rgb,
				title: devServerTitle,
				includeEnvSetup: hasEnvFile,
				includePortExport: options.capabilities.includes('web'),
				...(options.port !== undefined && { port: options.port }),
			}
		)

		logger.info('Dual terminals opened: Claude + dev server')
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
