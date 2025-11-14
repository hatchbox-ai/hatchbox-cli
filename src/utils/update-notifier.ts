import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { execa } from 'execa'
import chalk from 'chalk'
import { logger } from './logger.js'

export interface UpdateCheckCache {
  lastCheck: number // timestamp
  latestVersion: string
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

export class UpdateNotifier {
  private cacheFilePath: string
  private currentVersion: string
  private packageName: string

  constructor(currentVersion: string, packageName: string) {
    this.currentVersion = currentVersion
    this.packageName = packageName
    // Cross-platform cache directory
    const configDir = path.join(os.homedir(), '.config', 'iloom-ai')
    this.cacheFilePath = path.join(configDir, 'update-check.json')
    logger.debug(`UpdateNotifier initialized: version=${currentVersion}, package=${packageName}, cachePath=${this.cacheFilePath}`)
  }

  /**
   * Check for updates, respecting 24hr cache
   * Returns UpdateCheckResult or null if check failed/not needed
   */
  async checkForUpdates(): Promise<UpdateCheckResult | null> {
    logger.debug('checkForUpdates: Starting update check')
    try {
      // Check cache first
      logger.debug('checkForUpdates: Checking cache')
      const cached = await this.getCachedCheck()
      if (cached !== null) {
        logger.debug(`checkForUpdates: Using cached result - latest=${cached.latestVersion}, lastCheck=${new Date(cached.lastCheck).toISOString()}`)
        const updateAvailable = this.isNewerVersion(this.currentVersion, cached.latestVersion)
        logger.debug(`checkForUpdates: Update available from cache: ${updateAvailable}`)
        return {
          currentVersion: this.currentVersion,
          latestVersion: cached.latestVersion,
          updateAvailable,
        }
      }

      logger.debug('checkForUpdates: No valid cache, querying npm registry')
      // Query npm registry
      const latestVersion = await this.fetchLatestVersion()
      if (latestVersion === null) {
        logger.debug('checkForUpdates: Failed to fetch latest version from npm')
        return null
      }

      logger.debug(`checkForUpdates: Fetched latest version: ${latestVersion}`)

      // Save to cache
      logger.debug('checkForUpdates: Saving to cache')
      await this.saveCacheFile(latestVersion)

      const updateAvailable = this.isNewerVersion(this.currentVersion, latestVersion)
      logger.debug(`checkForUpdates: Update available: ${updateAvailable} (current=${this.currentVersion}, latest=${latestVersion})`)

      return {
        currentVersion: this.currentVersion,
        latestVersion,
        updateAvailable,
      }
    } catch (error) {
      // Handle all errors gracefully - update check should never break user experience
      logger.debug(`checkForUpdates: Error during update check: ${error}`)
      return null
    }
  }

  /**
   * Read cache file, return null if stale or missing
   */
  private async getCachedCheck(): Promise<UpdateCheckCache | null> {
    logger.debug(`getCachedCheck: Checking cache file at ${this.cacheFilePath}`)
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        logger.debug('getCachedCheck: Cache file does not exist')
        return null
      }

      logger.debug('getCachedCheck: Cache file exists, reading contents')
      const content = await fs.readFile(this.cacheFilePath, 'utf8')
      logger.debug(`getCachedCheck: Cache file content: ${content}`)
      const cache = JSON.parse(content) as UpdateCheckCache

      // Check if cache is still fresh (< configurable hours)
      const cacheTimeoutMins = parseInt(process.env.ILOOM_UPDATE_CACHE_TIMEOUT_MINS ?? '360', 10) // Default 6 hours
      const cacheTimeoutMs = cacheTimeoutMins * 60 * 1000
      logger.debug(`getCachedCheck: Using cache timeout of ${cacheTimeoutMins} minutes`)
      const now = Date.now()
      const age = now - cache.lastCheck
      const ageHours = age / (60 * 60 * 1000)
      logger.debug(`getCachedCheck: Cache age: ${ageHours.toFixed(2)} hours (threshold: ${cacheTimeoutMins / 60} hours)`)

      if (now - cache.lastCheck < cacheTimeoutMs) {
        logger.debug('getCachedCheck: Cache is fresh, returning cached data')
        return cache
      }

      logger.debug('getCachedCheck: Cache is stale, will query npm registry')
      return null
    } catch (error) {
      // If cache is corrupted or unreadable, treat as missing
      logger.debug(`getCachedCheck: Error reading cache: ${error}`)
      return null
    }
  }

  /**
   * Save successful check to cache
   */
  private async saveCacheFile(latestVersion: string): Promise<void> {
    logger.debug(`saveCacheFile: Attempting to save cache for version ${latestVersion}`)
    try {
      // Ensure cache directory exists
      const configDir = path.dirname(this.cacheFilePath)
      logger.debug(`saveCacheFile: Ensuring cache directory exists: ${configDir}`)
      await fs.ensureDir(configDir)

      // Write cache file
      const cache: UpdateCheckCache = {
        lastCheck: Date.now(),
        latestVersion,
      }
      const cacheJson = JSON.stringify(cache, null, 2)
      logger.debug(`saveCacheFile: Writing cache file: ${cacheJson}`)
      await fs.writeFile(this.cacheFilePath, cacheJson, 'utf8')
      logger.debug(`saveCacheFile: Cache file saved successfully to ${this.cacheFilePath}`)
    } catch (error) {
      // Log debug message but don't throw - cache write failure shouldn't break anything
      logger.debug(`saveCacheFile: Failed to save update check cache to ${this.cacheFilePath}: ${error}`)
    }
  }

  /**
   * Display update notification to user
   */
  displayUpdateNotification(result: UpdateCheckResult): void {
    logger.debug(`displayUpdateNotification: updateAvailable=${result.updateAvailable}, current=${result.currentVersion}, latest=${result.latestVersion}`)
    if (result.updateAvailable) {
      logger.debug('displayUpdateNotification: Displaying update notification to user')
      // Simple, clear update notification
      /* eslint-disable no-console */
      console.log('')
      console.log('  ' + chalk.bold(`Update available: ${result.currentVersion} → ${result.latestVersion}`))
      console.log('  ' + chalk.bold('Run: il update'))
      console.log('')
      /* eslint-enable no-console */
    } else {
      logger.debug('displayUpdateNotification: No update available, skipping notification')
    }
  }

  /**
   * Query npm registry for latest version
   */
  private async fetchLatestVersion(): Promise<string | null> {
    logger.debug(`fetchLatestVersion: Querying npm for package ${this.packageName}`)
    try {
      const { stdout } = await execa('npm', ['view', this.packageName, 'version'], {
        timeout: 5000,
      })
      const version = stdout.trim()
      logger.debug(`fetchLatestVersion: npm returned version: ${version}`)
      return version
    } catch (error) {
      // Network errors, timeouts, npm not available, or package not found
      logger.debug(`fetchLatestVersion: Failed to query npm: ${error}`)
      return null
    }
  }

  /**
   * Compare semver versions
   * Returns true if latest > current
   */
  private isNewerVersion(current: string, latest: string): boolean {
    logger.debug(`isNewerVersion: Comparing versions - current=${current}, latest=${latest}`)
    // Simple version comparison: split by dots and compare numerically
    try {
      const currentParts = current.split('.').map(p => parseInt(p, 10))
      const latestParts = latest.split('.').map(p => parseInt(p, 10))
      logger.debug(`isNewerVersion: Parsed parts - current=[${currentParts.join(', ')}], latest=[${latestParts.join(', ')}]`)

      for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const curr = currentParts[i] ?? 0
        const next = latestParts[i] ?? 0

        logger.debug(`isNewerVersion: Comparing part ${i}: current=${curr}, latest=${next}`)

        if (next > curr) {
          logger.debug(`isNewerVersion: Latest is newer (${next} > ${curr})`)
          return true
        }
        if (next < curr) {
          logger.debug(`isNewerVersion: Current is newer (${curr} > ${next})`)
          return false
        }
      }

      logger.debug('isNewerVersion: Versions are equal')
      return false
    } catch (error) {
      // If parsing fails, assume no update
      logger.debug(`isNewerVersion: Error comparing versions: ${error}`)
      return false
    }
  }
}

/**
 * Main entry point for update check
 * Call from CLI postAction hook
 */
export async function checkAndNotifyUpdate(
  currentVersion: string,
  packageName: string,
  installMethod: string
): Promise<void> {
  logger.debug(`checkAndNotifyUpdate: Called with version=${currentVersion}, package=${packageName}, installMethod=${installMethod}`)
  try {
    // Only check for global installations
    if (installMethod !== 'global') {
      logger.debug(`checkAndNotifyUpdate: Skipping update check - not a global installation (method=${installMethod})`)
      return
    }

    logger.debug('checkAndNotifyUpdate: Creating UpdateNotifier instance')
    const notifier = new UpdateNotifier(currentVersion, packageName)

    logger.debug('checkAndNotifyUpdate: Calling checkForUpdates()')
    const result = await notifier.checkForUpdates()

    if (result !== null) {
      logger.debug(`checkAndNotifyUpdate: Got result, calling displayUpdateNotification`)
      notifier.displayUpdateNotification(result)
    } else {
      logger.debug('checkAndNotifyUpdate: Result was null, not displaying notification')
    }

    logger.debug('checkAndNotifyUpdate: Completed')
  } catch (error) {
    // All errors handled internally - this should never throw
    logger.debug(`checkAndNotifyUpdate: Unexpected error: ${error}`)
  }
}
