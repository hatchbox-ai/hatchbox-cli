import { logger } from '../utils/logger.js'
import { findMainWorktreePath } from '../utils/git.js'
import { SettingsManager } from '../lib/SettingsManager.js'

/**
 * Input structure for TestGitCommand.execute()
 */
export interface TestGitCommandInput {
  options: Record<string, never>
}

/**
 * Test command to verify the findMainWorktreePath() function
 * Reads settings from .iloom/settings.json and uses them to find main worktree
 * Implements 3-tier main branch detection strategy:
 * 1. Check for specified mainBranch in settings
 * 2. Look for "main" branch
 * 3. Use first worktree (primary worktree)
 */
export class TestGitCommand {
  private readonly settingsManager: SettingsManager

  constructor(settingsManager?: SettingsManager) {
    this.settingsManager = settingsManager ?? new SettingsManager()
  }

  /**
   * Main entry point for the test-git command
   * Executes findMainWorktreePath() and displays the result
   */
  public async execute(): Promise<void> {
    try {
      logger.info('Testing Git Integration - findMainWorktreePath()\n')

      // Display the current working directory
      logger.info(`Current directory: ${process.cwd()}`)

      // Load settings from .iloom/settings.json
      const settings = await this.settingsManager.loadSettings()

      // Build options for findMainWorktreePath
      const options = settings.mainBranch ? { mainBranch: settings.mainBranch } : undefined

      if (options?.mainBranch) {
        logger.info(`Looking for worktree with branch: ${options.mainBranch} (from .iloom/settings.json)`)
      } else {
        logger.info('No mainBranch in settings, using default detection strategy (main → first worktree)')
      }

      logger.info('')

      // Execute the function
      logger.info('Executing findMainWorktreePath()...')
      const mainPath = await findMainWorktreePath(process.cwd(), options)

      // Display the result
      logger.success('Main worktree path found:')
      logger.info(`   Path: ${mainPath}`)

      logger.info('')
      logger.success('Test completed successfully!')

    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Test failed: ${error.message}`)
      } else {
        logger.error('Test failed with unknown error')
      }
      throw error
    }
  }
}
