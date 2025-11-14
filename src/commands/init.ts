import { logger } from '../utils/logger.js'
import { ShellCompletion } from '../lib/ShellCompletion.js'
import { promptConfirmation } from '../utils/prompt.js'
import chalk from 'chalk'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

/**
 * Initialize iloom configuration and setup shell autocomplete
 * Implements the `il init` command requested in issue #94
 */
export class InitCommand {
  private readonly shellCompletion: ShellCompletion

  constructor(shellCompletion?: ShellCompletion) {
    this.shellCompletion = shellCompletion ?? new ShellCompletion()
  }

  /**
   * Main entry point for the init command
   * Prompts user for autocomplete setup and displays instructions
   */
  public async execute(): Promise<void> {
    try {
      logger.info(chalk.bold('Welcome to iloom CLI Setup'))
      logger.info('')

      // Detect user's shell
      const shell = this.shellCompletion.detectShell()

      if (shell === 'unknown') {
        logger.warn('Could not detect your shell type.')
        logger.warn('Shell autocomplete is supported for bash, zsh, and fish.')
        logger.warn('Please configure autocomplete manually if needed.')
        logger.info('')
        logger.info('Continuing with project configuration setup...')
        logger.info('')

        // Skip autocomplete, but still run project configuration
        logger.info(chalk.bold('Project Configuration Setup'))
        logger.info('')

        await this.setupProjectConfiguration()

        logger.info('')
        logger.info(chalk.green('Setup complete! Enjoy using iloom CLI.'))
        return
      }

      logger.info(`Detected shell: ${chalk.cyan(shell)}`)
      logger.info('')

      // Ask user if they want to enable autocomplete
      const enableAutocomplete = await promptConfirmation(
        'Would you like to enable shell autocomplete?',
        true // Default to yes
      )

      if (enableAutocomplete) {
        // Display setup instructions
        logger.info('')
        logger.info(chalk.bold('Shell Autocomplete Setup Instructions'))
        logger.info('')

        const instructions = this.shellCompletion.getSetupInstructions(shell)
        logger.info(instructions)
      } else {
        logger.info('Skipping autocomplete setup.')
        logger.info('You can run this command again later to set up autocomplete.')
      }

      // Setup project configuration (always runs)
      logger.info('')
      logger.info(chalk.bold('Project Configuration Setup'))
      logger.info('')

      await this.setupProjectConfiguration()

      logger.info('')
      logger.info(chalk.green('Setup complete! Enjoy using iloom CLI.'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Initialization failed: ${message}`)
      throw error
    }
  }

  /**
   * Setup project configuration files
   * Creates settings.local.json and updates .gitignore
   */
  private async setupProjectConfiguration(): Promise<void> {
    // Ensure .iloom directory exists
    const iloomDir = path.join(process.cwd(), '.iloom')
    await mkdir(iloomDir, { recursive: true })

    // Create settings.local.json if it doesn't exist
    const settingsLocalPath = path.join(iloomDir, 'settings.local.json')
    if (!existsSync(settingsLocalPath)) {
      await writeFile(settingsLocalPath, '{}\n', 'utf-8')
      logger.info('Created .iloom/settings.local.json')
    } else {
      logger.info('.iloom/settings.local.json already exists, skipping creation')
    }

    // Update .gitignore
    await this.updateGitignore()
  }

  /**
   * Add settings.local.json to .gitignore if not already present
   */
  private async updateGitignore(): Promise<void> {
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    const entryToAdd = '.iloom/settings.local.json'

    // Read existing .gitignore or create empty
    let content = ''
    if (existsSync(gitignorePath)) {
      content = await readFile(gitignorePath, 'utf-8')
    }

    // Check if entry already exists
    const lines = content.split('\n')
    if (lines.some(line => line.trim() === entryToAdd)) {
      logger.info('.gitignore already contains .iloom/settings.local.json')
      return
    }

    // Add entry with comment
    const commentLine = '\n# Added by iloom CLI'
    const separator = content.endsWith('\n') || content === '' ? '' : '\n'
    const newContent = content + separator + commentLine + '\n' + entryToAdd + '\n'
    await writeFile(gitignorePath, newContent, 'utf-8')
    logger.info('Added .iloom/settings.local.json to .gitignore')
  }
}
