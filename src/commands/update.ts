import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs-extra'
import { execaCommand } from 'execa'
import { logger } from '../utils/logger.js'
import { detectInstallationMethod, detectLegacyPackage } from '../utils/installation-detector.js'
import { UpdateNotifier } from '../utils/update-notifier.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class UpdateCommand {
  async execute(options: { dryRun?: boolean } = {}): Promise<void> {
    // Check installation method - only allow updates for global installations
    const installMethod = detectInstallationMethod(__filename)
    logger.debug(`[update] Installation method detected: ${installMethod}`)

    if (installMethod !== 'global') {
      logger.error('Update command only works for globally installed iloom-cli')

      switch (installMethod) {
        case 'local':
          logger.info('You appear to be running from local development.')
          logger.info('To update: git pull origin main && pnpm install && pnpm build')
          break
        case 'linked':
          logger.info('You appear to be running from npm link.')
          logger.info('To update: cd to your local iloom repo and run git pull')
          break
        default:
          logger.info('Unable to determine installation method.')
          logger.info('If globally installed, try: npm install -g @iloom/cli@latest')
          break
      }

      process.exit(1)
    }

    // Detect legacy package
    const legacyPackage = detectLegacyPackage(__filename)
    const isMigration = legacyPackage !== null
    logger.debug(`[update] Legacy package detected: ${legacyPackage}`)
    logger.debug(`[update] Is migration: ${isMigration}`)

    // Get current version from package.json
    const packageJsonPath = join(__dirname, '..', 'package.json')
    logger.debug(`[update] Reading package.json from: ${packageJsonPath}`)
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
    const currentVersion = packageJson.version
    const packageName = packageJson.name
    logger.debug(`[update] Current version: ${currentVersion}, package: ${packageName}`)

    // For migration, we don't need to check for updates - we're switching packages
    let updateResult = null
    if (!isMigration) {
      // Check for available updates
      logger.info('🔍 Checking for updates...')
      const notifier = new UpdateNotifier(currentVersion, packageName)
      updateResult = await notifier.checkForUpdates()
      logger.debug(`[update] Update check result: ${JSON.stringify(updateResult)}`)

      if (!updateResult) {
        logger.error('Failed to check for updates. Please try again later.')
        process.exit(1)
      }

      if (!updateResult.updateAvailable) {
        logger.success(`Already up to date! Current version: ${currentVersion}`)
        return
      }

      // Show update info and proceed
      logger.info(`Update available: ${updateResult.currentVersion} → ${updateResult.latestVersion}`)
    } else {
      logger.info('🔄 Hatchbox to iloom migration detected')
    }

    if (options.dryRun) {
      logger.info('🔍 DRY RUN - showing what would be done:')
      if (isMigration) {
        logger.info('   Would migrate from hatchbox to iloom:')
        logger.info('     1. Install @iloom/cli@latest')
        logger.info('     2. Verify @iloom/cli installation')
        logger.info('     3. Uninstall @hatchbox-ai/hatchbox-cli')
      } else {
        logger.info(`   Would run: npm install -g ${packageName}@latest`)
        logger.info(`   Current version: ${currentVersion}`)
        logger.info(`   Target version: ${updateResult?.latestVersion}`)
      }
      logger.debug(`[update] Dry run complete, skipping actual update`)
      return
    }

    // Handle migration from hatchbox to iloom
    if (isMigration) {
      logger.info('🔄 Migrating from hatchbox to iloom...')

      // Step 1: Install iloom
      logger.info('Installing @iloom/cli@latest...')
      await execaCommand('npm install -g @iloom/cli@latest', { stdio: 'inherit' })

      // Step 2: Verify installation
      logger.info('Verifying @iloom/cli installation...')
      const verifyResult = await execaCommand('npm list -g @iloom/cli', { reject: false })
      if (verifyResult.exitCode !== 0) {
        throw new Error('Failed to verify @iloom/cli installation')
      }

      // Step 3: Uninstall hatchbox (best-effort)
      logger.info('Removing legacy @hatchbox-ai/hatchbox-cli package...')
      const uninstallResult = await execaCommand('npm uninstall -g @hatchbox-ai/hatchbox-cli', { reject: false })
      if (uninstallResult.exitCode !== 0) {
        logger.warn('Could not fully remove @hatchbox-ai/hatchbox-cli - you may need to uninstall manually')
      }

      // Success message
      logger.success('Migration complete!')
      logger.info('You are now using @iloom/cli')
      logger.info("Use these executables: 'iloom', 'il' instead of 'hatchbox', 'hb'")
      process.exit(0)
    }

    logger.info('🔄 Starting update...')

    // Start npm update in background and exit immediately
    spawn('npm', ['install', '-g', `${packageName}@latest`], {
      detached: true,
      stdio: 'inherit'
    })

    // Exit before npm tries to replace files (avoids file locking issues)
    process.exit(0)
  }
}