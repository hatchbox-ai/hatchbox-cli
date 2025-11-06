import { logger } from '../utils/logger.js'
import { openDualTerminalWindow, detectITerm2 } from '../utils/terminal.js'

/**
 * Input structure for TestTabsCommand.execute()
 */
export interface TestTabsCommandInput {
  options: Record<string, never>
}

/**
 * Test command to verify the iTerm2 dual tab functionality
 * Opens two tabs with the same background color and runs simple test commands
 */
export class TestTabsCommand {
  /**
   * Main entry point for the test-tabs command
   * Opens dual terminal tabs with test commands
   */
  public async execute(): Promise<void> {
    try {
      logger.info('Testing iTerm2 Dual Tab Integration\n')

      // Check if iTerm2 is available
      const hasITerm2 = await detectITerm2()

      if (!hasITerm2) {
        logger.warn('iTerm2 not detected. This command works best with iTerm2 installed.')
        logger.info('Falling back to Terminal.app with separate windows...\n')
      } else {
        logger.info('iTerm2 detected. Opening dual tabs in single window...\n')
      }

      // Define test background color (light blue)
      const backgroundColor = { r: 235, g: 235, b: 250 }

      // Open dual terminal tabs with test commands
      logger.info('Opening tabs with test commands...')

      await openDualTerminalWindow(
        {
          workspacePath: process.cwd(),
          command: 'echo "Tab 1 test" && echo "Current directory: $(pwd)"',
          backgroundColor,
          title: 'Test Tab 1'
        },
        {
          workspacePath: process.cwd(),
          command: 'echo "Tab 2 test" && echo "Current directory: $(pwd)"',
          backgroundColor,
          title: 'Test Tab 2'
        }
      )

      logger.success('\nDual tabs opened successfully!')
      logger.info('Check the terminal windows/tabs to verify:')
      logger.info('  - Two tabs/windows are open')
      logger.info('  - Both have the same light blue background color')
      logger.info('  - Tab 1 shows "Tab 1 test"')
      logger.info('  - Tab 2 shows "Tab 2 test"')
      logger.info('  - Both show the current directory')

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
