import { execa } from 'execa'
import { logger } from './logger.js'

export interface ClaudeCliOptions {
	model?: string
	permissionMode?: 'plan' | 'acceptEdits' | 'bypassPermissions' | 'default'
	addDir?: string
	headless?: boolean
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
	const { model, permissionMode, addDir, headless = false } = options

	// Build command arguments
	const args: string[] = []

	if (headless) {
		args.push('-p', '--print')
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
				timeout: 1200000, // 20 mins
			})
			return result.stdout.trim()
		} else {
			// Interactive mode: let user interact with Claude
			// Add the prompt as final argument
			args.push("--")
			args.push(prompt)

			// TODO: This implementation is temporary and will likely be replaced
			// when implementing the 'start' command (Issue #6).
			// The actual implementation will:
			// - Use AppleScript/osascript to open a new Terminal window (like bash scripts)
			// - Set up environment (cd to directory, source .env, export PORT)
			// - Launch Claude with appropriate context and permissions
			// - Apply terminal background colors for visual workspace distinction
			// For now, this simplified approach launches Claude in the current terminal.

			// Launch in background without awaiting
			execa('claude', args, {
				stdio: 'inherit',
			}).catch((error) => {
				logger.error('Claude interactive session failed', { error })
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
	model: string = 'claude-3-5-haiku-20241022'
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
