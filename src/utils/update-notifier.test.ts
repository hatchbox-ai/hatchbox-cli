import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UpdateNotifier, checkAndNotifyUpdate } from './update-notifier.js'
import fs from 'fs-extra'
import os from 'os'
import { execa } from 'execa'

// Mock dependencies
vi.mock('fs-extra')
vi.mock('execa')
vi.mock('os')

// Helper to avoid type issues with mocking execa
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockExecaResponse = (stdout: string): any => ({
  stdout,
})

describe('UpdateNotifier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock os.homedir()
    vi.mocked(os.homedir).mockReturnValue('/home/user')
  })

  describe('checkForUpdates', () => {
    it('returns null when current version is latest', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      // Mock no cache file
      vi.mocked(fs.existsSync).mockReturnValue(false)

      // Mock npm query returning same version
      vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.2.3'))

      // Mock cache save
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await notifier.checkForUpdates()

      expect(result).not.toBeNull()
      expect(result?.updateAvailable).toBe(false)
      expect(result?.latestVersion).toBe('1.2.3')
    })

    it('returns update info when newer version available', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      // Mock no cache file
      vi.mocked(fs.existsSync).mockReturnValue(false)

      // Mock npm query returning newer version
      vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))

      // Mock cache save
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await notifier.checkForUpdates()

      expect(result).not.toBeNull()
      expect(result?.updateAvailable).toBe(true)
      expect(result?.currentVersion).toBe('1.2.3')
      expect(result?.latestVersion).toBe('1.3.0')
    })

    it('returns cached data when cache is fresh', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      // Mock cache file exists and is fresh
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const cacheData = {
        lastCheck: Date.now() - 1000, // 1 second ago
        latestVersion: '1.3.0',
      }
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cacheData))

      // Should NOT call execa when cache is fresh
      const result = await notifier.checkForUpdates()

      expect(result).not.toBeNull()
      expect(result?.updateAvailable).toBe(true)
      expect(result?.latestVersion).toBe('1.3.0')
      expect(execa).not.toHaveBeenCalled()
    })

    it('queries npm registry when cache is stale', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      // Mock cache file exists but is stale (> 24 hours)
      vi.mocked(fs.existsSync).mockReturnValue(true)
      const oldTime = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
      const staleCache = {
        lastCheck: oldTime,
        latestVersion: '1.2.5',
      }
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(staleCache))

      // Mock new npm query
      vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.4.0'))

      // Mock cache save
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await notifier.checkForUpdates()

      expect(result?.latestVersion).toBe('1.4.0')
      expect(execa).toHaveBeenCalled()
    })

    it('handles network errors gracefully', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      // Mock no cache file
      vi.mocked(fs.existsSync).mockReturnValue(false)

      // Mock npm query throwing error
      vi.mocked(execa).mockRejectedValue(new Error('Network error'))

      const result = await notifier.checkForUpdates()

      expect(result).toBeNull()
    })

    it('handles corrupted cache file', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      // Mock cache file exists but is corrupted
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFile).mockResolvedValue('invalid json {]')

      // Mock npm query
      vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))

      // Mock cache save
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      const result = await notifier.checkForUpdates()

      // Should recover by querying npm
      expect(result?.latestVersion).toBe('1.3.0')
    })

    it('handles npm query timeout', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execa).mockRejectedValue(new Error('Timeout'))

      const result = await notifier.checkForUpdates()

      expect(result).toBeNull()
    })
  })

  describe('displayUpdateNotification', () => {
    it('displays notification when update is available', () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')
      const loggerInfoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = {
        currentVersion: '1.2.3',
        latestVersion: '1.3.0',
        updateAvailable: true,
      }

      notifier.displayUpdateNotification(result)

      // Should have called logger.info at least once
      expect(loggerInfoSpy).toHaveBeenCalled()
      loggerInfoSpy.mockRestore()
    })

    it('does not display notification when no update available', () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')
      const loggerInfoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = {
        currentVersion: '1.2.3',
        latestVersion: '1.2.3',
        updateAvailable: false,
      }

      notifier.displayUpdateNotification(result)

      loggerInfoSpy.mockRestore()
    })
  })

  describe('Cache operations', () => {
    it('creates cache directory if it does not exist', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await notifier.checkForUpdates()

      expect(fs.ensureDir).toHaveBeenCalled()
    })

    it('writes cache file with proper format', async () => {
      const notifier = new UpdateNotifier('1.2.3', '@test/package')

      vi.mocked(fs.existsSync).mockReturnValue(false)
      vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))
      vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
      vi.mocked(fs.writeFile).mockResolvedValue(undefined)

      await notifier.checkForUpdates()

      // Check that writeFile was called with JSON data
      const calls = vi.mocked(fs.writeFile).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const [filePath, jsonContent, encoding] = calls[0]
      expect(String(filePath)).toContain('update-check.json')
      expect(String(jsonContent)).toContain('latestVersion')
      expect(String(jsonContent)).toContain('1.3.0')
      expect(encoding).toBe('utf8')
    })
  })
})

describe('checkAndNotifyUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(os.homedir).mockReturnValue('/home/user')
  })

  it('does nothing for local installations', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))

    await checkAndNotifyUpdate('1.2.3', '@test/package', 'local')

    // Should not call execa for local installations
    expect(execa).not.toHaveBeenCalled()
  })

  it('does nothing for linked installations', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))

    await checkAndNotifyUpdate('1.2.3', '@test/package', 'linked')

    expect(execa).not.toHaveBeenCalled()
  })

  it('does nothing for unknown installations', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))

    await checkAndNotifyUpdate('1.2.3', '@test/package', 'unknown')

    expect(execa).not.toHaveBeenCalled()
  })

  it('checks for updates for global installations', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(execa).mockResolvedValue(mockExecaResponse('1.3.0'))
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
    vi.mocked(fs.writeFile).mockResolvedValue(undefined)

    await checkAndNotifyUpdate('1.2.3', '@test/package', 'global')

    // Should call execa for global installations
    expect(execa).toHaveBeenCalled()
  })

  it('handles errors silently', async () => {
    vi.mocked(fs.existsSync).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    // Should not throw
    await expect(checkAndNotifyUpdate('1.2.3', '@test/package', 'global')).resolves.toBeUndefined()
  })
})
