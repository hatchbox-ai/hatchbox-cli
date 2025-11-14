import omelette from 'omelette'
import { GitWorktreeManager } from './GitWorktreeManager.js'
import { logger } from '../utils/logger.js'

export type ShellType = 'bash' | 'zsh' | 'fish' | 'unknown'

/**
 * Manages shell autocomplete functionality for the iloom CLI
 * Uses omelette to provide tab-completion for commands in bash/zsh/fish
 */
export class ShellCompletion {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private completion: any // omelette instance - no types available
  private readonly COMPLETION_TIMEOUT = 1000 // ms - prevent blocking
  private readonly commandName: string

  constructor(commandName?: string) {
    // Detect command name from process.argv[1] if not provided
    this.commandName = commandName ?? this.detectCommandName()

    // Initialize omelette with detected command name
    // Template covers: <commandName> <command> <arg>
    // This allows for two-level completion: command completion + argument completion
    this.completion = omelette(`${this.commandName} <command> <arg>`)
    this.setupHandlers()
  }

  private detectCommandName(): string {
    // Get the actual command name used to invoke this script
    const scriptPath = process.argv[1] ?? 'il'
    const baseName = scriptPath.split('/').pop() ?? 'il'

    // Remove .js extension if present
    return baseName.replace(/\.js$/, '')
  }

  private setupHandlers(): void {
    // Handler for command-level completion
    // When user types: il <TAB>
    this.completion.on('command', ({ reply }: { reply: (suggestions: string[]) => void }) => {
      reply([
        'start',
        'finish',
        'ignite',
        'open',
        'run',
        'cleanup',
        'list',
        'init',
        // Intentionally exclude test-* commands from autocomplete
      ])
    })

    // Handler for argument-level completion
    // When user types: il <command> <TAB>
    this.completion.on('arg', async ({ line, reply }: { line: string; reply: (suggestions: string[]) => void }) => {
      // Check if the command is 'cleanup' to provide dynamic branch suggestions
      if (line.includes('cleanup')) {
        // Use timeout to prevent blocking if worktree listing is slow
        const suggestions = await this.getBranchSuggestionsWithTimeout()
        reply(suggestions)
      } else {
        // For other commands, no argument suggestions
        reply([])
      }
    })
  }

  /**
   * Get branch suggestions with timeout to prevent blocking
   */
  private async getBranchSuggestionsWithTimeout(): Promise<string[]> {
    try {
      return await Promise.race([
        this.getBranchSuggestions(),
        this.timeout(this.COMPLETION_TIMEOUT, []),
      ])
    } catch (error) {
      logger.debug(`Autocomplete branch suggestions failed: ${error}`)
      return []
    }
  }

  private async timeout<T>(ms: number, defaultValue: T): Promise<T> {
    return new Promise((resolve) => {
      // eslint-disable-next-line no-undef
      setTimeout(() => resolve(defaultValue), ms)
    })
  }

  async getBranchSuggestions(): Promise<string[]> {
    // Retrieve worktree branches for dynamic completion
    // Used by cleanup command autocomplete
    try {
      const manager = new GitWorktreeManager()
      const worktrees = await manager.listWorktrees({ porcelain: true })
      const repoInfo = await manager.getRepoInfo()

      // Filter out:
      // 1. Main worktree (at repo root) - can't be cleaned up
      // 2. Current worktree (where we're working) - shouldn't clean up current location
      const repoRoot = repoInfo.root
      const currentBranch = repoInfo.currentBranch

      return worktrees
        .filter((wt) => wt.path !== repoRoot)  // Not the main worktree
        .filter((wt) => wt.branch !== currentBranch)  // Not current worktree
        .map((wt) => wt.branch)
    } catch (error) {
      // Silently fail - autocomplete should never break the CLI
      logger.debug(`Failed to get branch suggestions: ${error}`)
      return []
    }
  }

  /**
   * Initialize completion - must be called before program.parseAsync()
   */
  init(): void {
    this.completion.init()
  }

  /**
   * Detect user's current shell
   */
  detectShell(): ShellType {
    const shell = process.env.SHELL ?? ''

    if (shell.includes('bash')) return 'bash'
    if (shell.includes('zsh')) return 'zsh'
    if (shell.includes('fish')) return 'fish'

    return 'unknown'
  }

  /**
   * Get completion script for a specific shell
   */
  getCompletionScript(shell: ShellType): string {
    switch (shell) {
      case 'bash':
        return this.completion.setupShellInitFile('bash')
      case 'zsh':
        return this.completion.setupShellInitFile('zsh')
      case 'fish':
        return this.completion.setupShellInitFile('fish')
      default:
        throw new Error(`Unsupported shell type: ${shell}`)
    }
  }

  /**
   * Get setup instructions for manual installation
   */
  getSetupInstructions(shell: ShellType): string {
    const binaryName = this.commandName

    switch (shell) {
      case 'bash':
        return `
Add the following to your ~/.bashrc or ~/.bash_profile:

  eval "$(${binaryName} --completion)"

Then reload your shell:

  source ~/.bashrc
`
      case 'zsh':
        return `
Add the following to your ~/.zshrc:

  eval "$(${binaryName} --completion)"

Then reload your shell:

  source ~/.zshrc
`
      case 'fish':
        return `
Add the following to your ~/.config/fish/config.fish:

  ${binaryName} --completion | source

Then reload your shell:

  source ~/.config/fish/config.fish
`
      default:
        return `
Shell autocomplete is supported for bash, zsh, and fish.
Your current shell (${shell}) may not be supported.

Please consult your shell's documentation for setting up custom completions.
`
    }
  }

  /**
   * Generate completion script and print to stdout
   * Used by: il --completion
   */
  printCompletionScript(shell?: ShellType): void {
    const detectedShell = shell ?? this.detectShell()

    if (detectedShell === 'unknown') {
      logger.error('Could not detect shell type. Please specify --shell bash|zsh|fish')
      process.exit(1)
    }

    try {
      const script = this.getCompletionScript(detectedShell)
      // eslint-disable-next-line no-console
      console.log(script)
    } catch (error) {
      logger.error(`Failed to generate completion script: ${error}`)
      process.exit(1)
    }
  }
}
