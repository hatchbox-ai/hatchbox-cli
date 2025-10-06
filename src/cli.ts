import { program } from 'commander'
import { logger } from './utils/logger.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Get package.json for version
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
  version: string
  description: string
}

program.name('hatchbox').description(packageJson.description).version(packageJson.version)

program
  .command('start')
  .description('Create isolated workspace for an issue/PR')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .option('--urgent', 'Mark as urgent workspace')
  .option('--no-claude', 'Skip Claude integration')
  .action(async (identifier: string, _options: { urgent?: boolean; claude?: boolean }) => {
    logger.info(`Starting workspace for: ${identifier}`)
    if (_options.urgent) {
      logger.warn('Urgent mode enabled')
    }
    // TODO: Implement start command
    logger.debug('Command not yet implemented')
  })

program
  .command('finish')
  .description('Merge work and cleanup workspace')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .option('--force', 'Force finish even with uncommitted changes')
  .action(async (_identifier: string, _options: { force?: boolean }) => {
    logger.success(`Finishing workspace for: ${_identifier}`)
    // TODO: Implement finish command
    logger.debug('Command not yet implemented')
  })

program
  .command('cleanup')
  .description('Remove workspaces')
  .argument('[identifier]', 'Specific workspace to cleanup (optional)')
  .option('--all', 'Remove all workspaces')
  .option('--issue <number>', 'Remove all workspaces for specific issue')
  .action(async (_identifier?: string, _options?: { all?: boolean; issue?: string }) => {
    logger.info('🧹 Cleaning up workspaces')
    // TODO: Implement cleanup command
    logger.debug('Command not yet implemented')
  })

program
  .command('list')
  .description('Show active workspaces')
  .option('--json', 'Output as JSON')
  .action(async (_options: { json?: boolean }) => {
    logger.info('📋 Active workspaces:')
    // TODO: Implement list command
    logger.debug('No workspaces found (command not yet implemented)')
  })

program
  .command('switch')
  .description('Switch to workspace context')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .action(async (identifier: string) => {
    logger.info(`🔄 Switching to workspace: ${identifier}`)
    // TODO: Implement switch command
    logger.debug('Command not yet implemented')
  })

// Parse CLI arguments
try {
  await program.parseAsync()
} catch (error) {
  if (error instanceof Error) {
    logger.error(`Error: ${error.message}`)
    process.exit(1)
  }
}
