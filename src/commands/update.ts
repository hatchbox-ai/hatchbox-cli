import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'
import { logger } from '../utils/logger.js'
import { detectInstallationMethod } from '../utils/installation-detector.js'
import { UpdateNotifier } from '../utils/update-notifier.js'

const __filename = fileURLToPath(import.meta.url)

export class UpdateCommand {
  async execute(): Promise<void> {
    // Check installation method - only allow updates for global installations
    const installMethod = detectInstallationMethod(__filename)

    if (installMethod !== 'global') {
      logger.error('Update command only works for globally installed hatchbox-cli')

      switch (installMethod) {
        case 'local':
          logger.info('You appear to be running from local development.')
          logger.info('To update: git pull origin main && pnpm install && pnpm build')
          break
        case 'linked':
          logger.info('You appear to be running from npm link.')
          logger.info('To update: cd to your local hatchbox repo and run git pull')
          break
        default:
          logger.info('Unable to determine installation method.')
          logger.info('If globally installed, try: npm install -g @hatchbox-ai/hatchbox-cli@latest')
          break
      }

      process.exit(1)
    }

    // Get current version from package.json
    const packageJsonPath = new URL('../../package.json', import.meta.url).pathname
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
    const currentVersion = packageJson.version
    const packageName = packageJson.name

    // Check for available updates
    logger.info('🔍 Checking for updates...')
    const notifier = new UpdateNotifier(currentVersion, packageName)
    const updateResult = await notifier.checkForUpdates()

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