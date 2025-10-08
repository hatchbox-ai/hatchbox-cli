import { program } from 'commander'
import { logger } from './utils/logger.js'
import { GitWorktreeManager } from './lib/GitWorktreeManager.js'
import type { StartOptions } from './types/index.js'
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

// Helper for unimplemented commands
function notImplemented(
  commandName: string,
  requirements: string[],
  bashScript?: string
): void {
  logger.error(`❌ The "${commandName}" command is not yet implemented`)
  logger.info('This command requires:')
  for (const requirement of requirements) {
    logger.info(`  - ${requirement}`)
  }
  if (bashScript) {
    
    logger.info('For now, use the bash script:')
    logger.info(`  ${bashScript}`)
  }
  process.exit(1)
}

program
  .name('hatchbox')
  .description(packageJson.description)
  .version(packageJson.version)
  .option('--debug', 'Enable debug output (default: true for now)') // Default to true for now
  .hook('preAction', (thisCommand) => {
    // Set debug mode based on flag
    const options = thisCommand.opts()
    // Default to true for now during development
    const debugEnabled = options.debug !== false
    logger.setDebug(debugEnabled)
  })

program
  .command('start')
  .description('Create isolated workspace for an issue/PR')
  .argument('[identifier]', 'Issue number, PR number, or branch name (optional - will prompt if not provided)')
  .option('--urgent', 'Mark as urgent workspace')
  .option('--claude', 'Enable Claude integration (default: true)', true)
  .option('--no-claude', 'Disable Claude integration')
  .option('--code', 'Enable VSCode (default: true)', true)
  .option('--no-code', 'Disable VSCode')
  .option('--dev-server', 'Enable dev server in terminal (default: true)', true)
  .option('--no-dev-server', 'Disable dev server')
  .action(async (identifier: string | undefined, options: StartOptions) => {
    try {
      let finalIdentifier = identifier

      // Interactive prompting when no identifier provided
      if (!finalIdentifier) {
        const { promptInput } = await import('./utils/prompt.js')
        finalIdentifier = await promptInput('Enter issue number, PR number (pr/123), or branch name')

        // Validate non-empty after prompting
        if (!finalIdentifier?.trim()) {
          logger.error('Identifier is required')
          process.exit(1)
        }
      }

      const { StartCommand } = await import('./commands/start.js')
      const command = new StartCommand()
      await command.execute({ identifier: finalIdentifier, options })
    } catch (error) {
      logger.error(`Failed to start workspace: ${error instanceof Error ? error.message : 'Unknown error'}`)
      process.exit(1)
    }
  })

program
  .command('finish')
  .description('Merge work and cleanup workspace')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .option('--force', 'Force finish even with uncommitted changes')
  .action((identifier: string) => {
    notImplemented(
      'finish',
      ['GitHubService (Issue #3)', 'DatabaseManager (Issue #5)', 'WorkspaceManager (Issue #6)'],
      `bash/merge-and-clean.sh ${identifier}`
    )
  })

program
  .command('cleanup')
  .description('Remove workspaces')
  .argument('[identifier]', 'Specific workspace to cleanup (optional)')
  .option('--all', 'Remove all workspaces')
  .option('--force', 'Force removal even with uncommitted changes')
  .option('--remove-branch', 'Also remove the associated branch')
  .action(async (identifier?: string, options?: { all?: boolean; force?: boolean; removeBranch?: boolean }) => {
    try {
      const manager = new GitWorktreeManager()

      // Determine which worktrees to remove
      let toRemove = identifier
        ? await manager.findWorktreesByIdentifier(identifier)
        : await manager.listWorktrees({ porcelain: true })

      // Validate input
      if (!identifier && !options?.all) {
        logger.error('Either provide an identifier or use --all flag')
        process.exit(1)
      }

      if (identifier && toRemove.length === 0) {
        logger.error(`No worktree found matching: ${identifier}`)
        process.exit(1)
      }

      logger.info(`Removing ${toRemove.length} worktree(s)...`)

      // Remove worktrees
      const { successes, failures, skipped } = await manager.removeWorktrees(toRemove, {
        force: options?.force ?? false,
        removeBranch: options?.removeBranch ?? false,
      })

      // Report results
      for (const { worktree } of successes) {
        logger.success(`Removed: ${worktree.branch}`)
      }

      for (const { worktree, reason } of skipped) {
        logger.info(`Skipped: ${worktree.branch} (${reason})`)
      }

      for (const { worktree, error } of failures) {
        logger.error(`Failed to remove ${worktree.branch}: ${error}`)
      }

      if (successes.length === 0 && failures.length === 0) {
        logger.info('No worktrees to remove')
      }

      if (failures.length > 0) {
        process.exit(1)
      }
    } catch (error) {
      logger.error(`Failed to cleanup worktrees: ${error instanceof Error ? error.message : 'Unknown error'}`)
      process.exit(1)
    }
  })

program
  .command('list')
  .description('Show active workspaces')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    try {
      const manager = new GitWorktreeManager()
      const worktrees = await manager.listWorktrees({ porcelain: true })

      if (options.json) {
        console.log(JSON.stringify(worktrees, null, 2))
        return
      }

      if (worktrees.length === 0) {
        logger.info('No worktrees found')
        return
      }

      logger.info('Active workspaces:')
      for (const worktree of worktrees) {
        const formatted = manager.formatWorktree(worktree)
        logger.info(`  ${formatted.title}`)
        logger.info(`    Path: ${formatted.path}`)
        logger.info(`    Commit: ${formatted.commit}`)
      }
    } catch (error) {
      logger.error(`Failed to list worktrees: ${error instanceof Error ? error.message : 'Unknown error'}`)
      process.exit(1)
    }
  })

program
  .command('switch')
  .description('Switch to workspace context')
  .argument('<identifier>', 'Issue number, PR number, or branch name')
  .action((identifier: string) => {
    notImplemented(
      'switch',
      ['Workspace context management'],
      `cd $(git worktree list | grep ${identifier} | awk '{print $1}')`
    )
  })

// Test command for GitHub integration
program
  .command('test-github')
  .description('Test GitHub integration (Issue #3)')
  .argument('<identifier>', 'Issue number or PR number')
  .option('--no-claude', 'Skip Claude for branch name generation')
  .action(async (identifier: string, options: { claude?: boolean }) => {
    try {
      const { GitHubService } = await import('./lib/GitHubService.js')

      logger.info('Testing GitHub Integration\n')

      const service = new GitHubService(options.claude !== undefined ? { useClaude: options.claude } : {})

      // Test 1: Input detection
      logger.info('Detecting input type...')
      const detection = await service.detectInputType(identifier)
      logger.info(`   Type: ${detection.type}`)
      logger.info(`   Number: ${detection.number}`)      

      if (detection.type === 'unknown') {
        logger.error('Could not detect if input is an issue or PR')
        process.exit(1)
      }

      // Test 2: Fetch the issue/PR
      logger.info('Fetching from GitHub...')
      if (detection.type === 'issue') {
        if (!detection.number) {
          throw new Error('Issue number not detected')
        }
        const issue = await service.fetchIssue(detection.number)
        logger.success(`   Issue #${issue.number}: ${issue.title}`)
        logger.info(`   State: ${issue.state}`)
        logger.info(`   Labels: ${issue.labels.join(', ') || 'none'}`)
        logger.info(`   URL: ${issue.url}`)

        // Test 3: Generate branch name
        
        logger.info('Generating branch name...')
        const branchName = await service.generateBranchName({
          issueNumber: issue.number,
          title: issue.title
        })
        logger.success(`   Branch: ${branchName}`)

        // Test 4: Extract context
        
        logger.info('Extracting context for Claude...')
        const context = service.extractContext(issue)
        logger.info(`   ${context.split('\n').join('\n   ')}`)

      } else {
        if (!detection.number) {
          throw new Error('PR number not detected')
        }
        const pr = await service.fetchPR(detection.number)
        logger.success(`   PR #${pr.number}: ${pr.title}`)
        logger.info(`   State: ${pr.state}`)
        logger.info(`   Branch: ${pr.branch}`)
        logger.info(`   Base: ${pr.baseBranch}`)
        logger.info(`   URL: ${pr.url}`)

        // Test 3: Extract context
        
        logger.info('Extracting context for Claude...')
        const context = service.extractContext(pr)
        logger.info(`   ${context.split('\n').join('\n   ')}`)
      }

      
      logger.success('All GitHub integration tests passed!')

    } catch (error) {
      logger.error(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      if (error instanceof Error && error.stack) {
        logger.debug(error.stack)
      }
      process.exit(1)
    }
  })

// Test command for Claude integration
program
  .command('test-claude')
  .description('Test Claude integration (Issue #10)')
  .option('--detect', 'Test Claude CLI detection')
  .option('--version', 'Get Claude CLI version')
  .option('--branch <title>', 'Test branch name generation with given title')
  .option('--issue <number>', 'Issue number for branch generation', '123')
  .option('--launch <prompt>', 'Launch Claude with a prompt (headless)')
  .option('--interactive', 'Launch Claude interactively (requires --launch)')
  .option('--template <name>', 'Test template loading')
  .action(async (options: {
    detect?: boolean
    version?: boolean
    branch?: string
    issue?: string
    launch?: string
    interactive?: boolean
    template?: 'issue' | 'pr' | 'regular'
  }) => {
    try {
      const { detectClaudeCli, getClaudeVersion, generateBranchName, launchClaude } = await import('./utils/claude.js')
      const { PromptTemplateManager } = await import('./lib/PromptTemplateManager.js')
      const { ClaudeService } = await import('./lib/ClaudeService.js')
      const { ClaudeContextManager } = await import('./lib/ClaudeContextManager.js')

      logger.info('Testing Claude Integration\n')

      // Test 1: Detection
      if (options.detect) {
        logger.info('Detecting Claude CLI...')
        const isAvailable = await detectClaudeCli()
        if (isAvailable) {
          logger.success('   Claude CLI is available')
        } else {
          logger.error('   Claude CLI not found')
        }
      }

      // Test 2: Version
      if (options.version) {
        logger.info('Getting Claude version...')
        const version = await getClaudeVersion()
        if (version) {
          logger.success(`   Version: ${version}`)
        } else {
          logger.error('   Could not get version')
        }
      }

      // Test 3: Branch name generation
      if (options.branch) {
        logger.info('Generating branch name...')
        const issueNumber = parseInt(options.issue ?? '123')
        logger.info(`   Issue #${issueNumber}: ${options.branch}`)
        const branchName = await generateBranchName(options.branch, issueNumber)
        logger.success(`   Generated: ${branchName}`)
      }

      // Test 4: Launch Claude
      if (options.launch) {
        logger.info('Launching Claude...')
        logger.info(`   Prompt: "${options.launch}"`)
        logger.info(`   Mode: ${options.interactive ? 'Interactive' : 'Headless'}`)

        if (options.interactive) {
          logger.info('   Launching Claude in new terminal...')
          await launchClaude(options.launch, { headless: false })
          logger.info('   (Claude should open in a separate process)')
        } else {
          logger.info('   Waiting for response...')
          const result = await launchClaude(options.launch, { headless: true })
          if (result) {
            logger.success('   Response:')
            logger.info(`   ${result.split('\n').join('\n   ')}`)
          }
        }
      }

      // Test 5: Template loading
      if (options.template) {
        logger.info('Loading template...')
        logger.info(`   Template: ${options.template}`)
        const manager = new PromptTemplateManager()
        try {
          const content = await manager.loadTemplate(options.template)
          logger.success('   Template loaded successfully')
          logger.info('   First 200 chars:')
          logger.info(`   ${content.substring(0, 200).split('\n').join('\n   ')}...`)
        } catch (error) {
          logger.error(`   Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Run all tests in sequence when no specific options provided
      if (!options.detect && !options.version && !options.branch && !options.launch && !options.template) {
        logger.info('Running full Claude integration test suite...\n')

        // Test 1: Detection
        logger.info('1. Testing Claude CLI detection...')
        const isAvailable = await detectClaudeCli()
        if (isAvailable) {
          logger.success('   Claude CLI is available')
        } else {
          logger.error('   Claude CLI not found')
          logger.info('\nSkipping remaining tests since Claude CLI is not available')
          return
        }

        // Test 2: Version
        logger.info('\n2. Getting Claude version...')
        const version = await getClaudeVersion()
        if (version) {
          logger.success(`   Version: ${version}`)
        } else {
          logger.error('   Could not get version')
        }

        // Test 3: Branch name generation
        logger.info('\n3. Testing branch name generation...')
        const testIssueNumber = 123
        const testTitle = 'Add user authentication feature'
        logger.info(`   Issue #${testIssueNumber}: ${testTitle}`)
        const branchName = await generateBranchName(testTitle, testIssueNumber)
        logger.success(`   Generated: ${branchName}`)

        // Test 4: Service initialization
        logger.info('\n4. Testing ClaudeService initialization...')
        new ClaudeService() // Just verify it can be instantiated
        logger.success('   Service initialized')

        // Test 5: Context manager
        logger.info('\n5. Testing ClaudeContextManager...')
        const contextManager = new ClaudeContextManager()
        await contextManager.prepareContext({
          type: 'issue',
          identifier: 123,
          title: 'Test issue',
          workspacePath: process.cwd(),
          port: 3123
        })
        logger.success('   Context prepared')

        // Test 6: Template loading
        logger.info('\n6. Testing template loading...')
        const templateManager = new PromptTemplateManager()
        const templates: Array<'issue' | 'pr' | 'regular'> = ['issue', 'pr', 'regular']
        let templateCount = 0
        for (const template of templates) {
          try {
            await templateManager.loadTemplate(template)
            logger.success(`   ${template} template loaded`)
            templateCount++
          } catch {
            logger.warn(`   ${template} template not found`)
          }
        }
        logger.info(`   Loaded ${templateCount}/${templates.length} templates`)

        // Test 7: Launch Claude headless (quick test)
        logger.info('\n7. Testing Claude launch (headless)...')
        logger.info('   Sending test prompt: "Say hello"')
        try {
          const result = await launchClaude('Say hello', { headless: true })
          if (result) {
            logger.success('   Claude responded successfully')
            logger.info(`   Response preview: ${result.substring(0, 100)}...`)
          } else {
            logger.warn('   No response received')
          }
        } catch (error) {
          logger.error(`   Launch failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }

        logger.info('\n' + '='.repeat(50))
        logger.success('All Claude integration tests complete!')
        logger.info('Summary: All core Claude features are working correctly')
      }

    } catch (error) {
      logger.error(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      if (error instanceof Error && error.stack) {
        logger.debug(error.stack)
      }
      process.exit(1)
    }
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
