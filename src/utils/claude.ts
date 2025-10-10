import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from './logger.js'

export interface ClaudeCliOptions {
	model?: string
	permissionMode?: 'plan' | 'acceptEdits' | 'bypassPermissions' | 'default'
	addDir?: string
	headless?: boolean
	branchName?: string // Optional branch name for terminal coloring
	timeout?: number // Timeout in milliseconds
}

/**
 * Detect if Claude CLI is available on the system
 */
export async function detectClaudeCli(): Promise<boolean> {
	try {
		// Use 'command -v' for cross-platform compatibility (works on macOS/Linux)
		await execa('command', ['-v', 'claude'], {
			shell: true,
			timeout: 5000,
		})
		return true
	} catch (error) {
		// Claude CLI not found
		logger.debug('Claude CLI not available', { error })
		return false
	}
}

/**
 * Get Claude CLI version
 */
export async function getClaudeVersion(): Promise<string | null> {
	try {
		const result = await execa('claude', ['--version'], {
			timeout: 5000,
		})
		return result.stdout.trim()
	} catch (error) {
		logger.warn('Failed to get Claude version', { error })
		return null
	}
}

/**
 * Launch Claude CLI with specified options
 * In headless mode, returns stdout. In interactive mode, returns void.
 */
export async function launchClaude(
	prompt: string,
	options: ClaudeCliOptions = {}
): Promise<string | void> {
	const { model, permissionMode, addDir, headless = false, branchName, timeout = 1200000 } = options

	// Build command arguments
	const args: string[] = []

	if (headless) {
		args.push('-p')
	}

	if (model) {
		args.push('--model', model)
	}

	if (permissionMode && permissionMode !== 'default') {
		args.push('--permission-mode', permissionMode)
	}

	if (addDir) {
		args.push('--add-dir', addDir)
	}

	try {
		if (headless) {
			// Headless mode: capture and return output
			const result = await execa('claude', args, {
				input: prompt,
				timeout,
				...(addDir && { cwd: addDir }), // Run Claude in the worktree directory
				verbose: true,
			})
			return result.stdout.trim()
		} else {
			// Interactive mode: let user interact with Claude
			args.push("--")

			// Import terminal launcher for new terminal window creation
			const { openTerminalWindow } = await import('./terminal.js')

			// Build Claude command for terminal execution with properly quoted prompt
			const baseCommand = ['claude', ...args].join(' ')
			const quotedPrompt = `'${prompt.replace(/'/g, "'\\''")}'`
			const claudeCommand = `${baseCommand} ${quotedPrompt}`

			// Apply terminal background color if branch name available
			let backgroundColor: { r: number; g: number; b: number } | undefined
			if (branchName) {
				try {
					const { generateColorFromBranchName } = await import('./color.js')
					const colorData = generateColorFromBranchName(branchName)
					backgroundColor = colorData.rgb
				} catch (error) {
					logger.warn(
						`Failed to generate terminal color: ${error instanceof Error ? error.message : 'Unknown error'}`
					)
				}
			}

			// Check if .env file exists in workspace
			const hasEnvFile = addDir ? existsSync(join(addDir, '.env')) : false

			// Open new terminal window with Claude
			await openTerminalWindow({
				...(addDir && { workspacePath: addDir }),
				command: claudeCommand,
				...(backgroundColor && { backgroundColor }),
				includeEnvSetup: hasEnvFile, // source .env only if it exists
			})

			return
		}
	} catch (error) {
		// Check for specific Claude CLI errors
		const execaError = error as {
			stderr?: string
			message?: string
			exitCode?: number
		}

		// Re-throw with more context
		const errorMessage = execaError.stderr ?? execaError.message ?? 'Unknown Claude CLI error'
		throw new Error(`Claude CLI error: ${errorMessage}`)
	}
}

/**
 * Generate a branch name using Claude with fallback
 * This matches the implementation that was working in ClaudeBranchNameStrategy
 */
export async function generateBranchName(
	issueTitle: string,
	issueNumber: number,
	model: string = 'sonnet'
): Promise<string> {
	try {
		// Check if Claude CLI is available
		const isAvailable = await detectClaudeCli()
		if (!isAvailable) {
			logger.warn('Claude CLI not available, using fallback branch name')
			return `feat/issue-${issueNumber}`
		}

		logger.debug('Generating branch name with Claude', { issueNumber, issueTitle })

		// Use the proven prompt format from ClaudeBranchNameStrategy
		const prompt = `<Task>
Generate a git branch name for the following issue:
<Issue>
<IssueNumber>${issueNumber}</IssueNumber>
<IssueTitle>${issueTitle}</IssueTitle>
</Issue>

<Requirements>
<IssueNumber>Must use this exact issue number: ${issueNumber}</IssueNumber>
<Format>Format must be: {prefix}/issue-${issueNumber}-{description}</Format>
<Prefix>Prefix must be one of: feat, fix, docs, refactor, test, chore</Prefix>
<MaxLength>Maximum 50 characters total</MaxLength>
<Characters>Only lowercase letters, numbers, and hyphens allowed</Characters>
<Output>Reply with ONLY the branch name, nothing else</Output>
</Requirements>
</Task>`

		logger.debug('Sending prompt to Claude', { prompt })

		const result = (await launchClaude(prompt, {
			model,
			headless: true,
		})) as string

		const branchName = result.trim()
		logger.debug('Claude returned branch name', { branchName, issueNumber })

		// Validate generated name using same validation as ClaudeBranchNameStrategy
		if (!branchName || !isValidBranchName(branchName, issueNumber)) {
			logger.warn('Invalid branch name from Claude, using fallback', { branchName })
			return `feat/issue-${issueNumber}`
		}

		return branchName
	} catch (error) {
		logger.warn('Failed to generate branch name with Claude', { error })
		return `feat/issue-${issueNumber}`
	}
}

/**
 * Validate branch name format
 * Check format: {prefix}/issue-{number}-{description}
 */
function isValidBranchName(name: string, issueNumber: number): boolean {
	const pattern = new RegExp(`^(feat|fix|docs|refactor|test|chore)/issue-${issueNumber}-[a-z0-9-]+$`)
	return pattern.test(name) && name.length <= 50
}
