import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UpdateCommand } from './update.js'

// Mock dependencies
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}))

vi.mock('../utils/installation-detector.js', () => ({
  detectInstallationMethod: vi.fn(),
  detectLegacyPackage: vi.fn()
}))

vi.mock('../utils/update-notifier.js', () => ({
  UpdateNotifier: vi.fn()
}))

vi.mock('fs-extra', () => ({
  default: {
    readFile: vi.fn()
  }
}))

vi.mock('execa', () => ({
  execaCommand: vi.fn()
}))

vi.mock('child_process', () => ({
  spawn: vi.fn()
}))

describe('UpdateCommand - hatchbox migration', () => {
  let updateCommand: UpdateCommand
  let mockExit: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.clearAllMocks()
    updateCommand = new UpdateCommand()

    // Mock process.exit - throw to stop execution like real exit would
    mockExit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)

    // Default mocks for package.json reading
    const { default: fs } = await import('fs-extra')
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      name: '@iloom/cli',
      version: '1.0.0'
    }))
  })

  it('detects hatchbox and performs migration', async () => {
    const { detectInstallationMethod, detectLegacyPackage } = await import('../utils/installation-detector.js')
    const { execaCommand } = await import('execa')

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: Legacy package detected
    vi.mocked(detectLegacyPackage).mockReturnValue('@hatchbox-ai/hatchbox-cli')

    // Mock: Install iloom succeeds
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm install -g @iloom/cli@latest',
      escapedCommand: 'npm install -g @iloom/cli@latest',
      cwd: process.cwd(),
      durationMs: 1000,
      pipedFrom: []
    })

    // Mock: Verify installation succeeds
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        dependencies: {
          '@iloom/cli': { version: '1.0.0' }
        }
      }),
      stderr: '',
      failed: false,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm list -g @iloom/cli',
      escapedCommand: 'npm list -g @iloom/cli',
      cwd: process.cwd(),
      durationMs: 100,
      pipedFrom: []
    })

    // Mock: Uninstall hatchbox succeeds
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm uninstall -g @hatchbox-ai/hatchbox-cli',
      escapedCommand: 'npm uninstall -g @hatchbox-ai/hatchbox-cli',
      cwd: process.cwd(),
      durationMs: 500,
      pipedFrom: []
    })

    // Should throw due to process.exit(0)
    await expect(updateCommand.execute()).rejects.toThrow('process.exit(0)')

    // Verify calls
    expect(execaCommand).toHaveBeenCalledWith('npm install -g @iloom/cli@latest', { stdio: 'inherit' })
    expect(execaCommand).toHaveBeenCalledWith('npm list -g @iloom/cli', { reject: false })
    expect(execaCommand).toHaveBeenCalledWith('npm uninstall -g @hatchbox-ai/hatchbox-cli', { reject: false })
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('shows migration plan in dry run', async () => {
    const { detectInstallationMethod, detectLegacyPackage } = await import('../utils/installation-detector.js')
    const { logger } = await import('../utils/logger.js')

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: Legacy package detected
    vi.mocked(detectLegacyPackage).mockReturnValue('@hatchbox-ai/hatchbox-cli')

    await updateCommand.execute({ dryRun: true })

    // Verify dry run output
    expect(logger.info).toHaveBeenCalledWith('🔍 DRY RUN - showing what would be done:')
    expect(logger.info).toHaveBeenCalledWith('   Would migrate from hatchbox to iloom:')
    expect(logger.info).toHaveBeenCalledWith('     1. Install @iloom/cli@latest')
    expect(logger.info).toHaveBeenCalledWith('     2. Verify @iloom/cli installation')
    expect(logger.info).toHaveBeenCalledWith('     3. Uninstall @hatchbox-ai/hatchbox-cli')
  })

  it('throws error if iloom installation verification fails', async () => {
    const { detectInstallationMethod, detectLegacyPackage } = await import('../utils/installation-detector.js')
    const { execaCommand } = await import('execa')

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: Legacy package detected
    vi.mocked(detectLegacyPackage).mockReturnValue('@hatchbox-ai/hatchbox-cli')

    // Mock: Install iloom succeeds
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm install -g @iloom/cli@latest',
      escapedCommand: 'npm install -g @iloom/cli@latest',
      cwd: process.cwd(),
      durationMs: 1000,
      pipedFrom: []
    })

    // Mock: Verify installation fails
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Not found',
      failed: true,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm list -g @iloom/cli',
      escapedCommand: 'npm list -g @iloom/cli',
      cwd: process.cwd(),
      durationMs: 100,
      pipedFrom: []
    })

    await expect(updateCommand.execute()).rejects.toThrow('Failed to verify @iloom/cli installation')
  })

  it('warns if hatchbox uninstall fails but continues', async () => {
    const { detectInstallationMethod, detectLegacyPackage } = await import('../utils/installation-detector.js')
    const { execaCommand } = await import('execa')
    const { logger } = await import('../utils/logger.js')

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: Legacy package detected
    vi.mocked(detectLegacyPackage).mockReturnValue('@hatchbox-ai/hatchbox-cli')

    // Mock: Install iloom succeeds
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      failed: false,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm install -g @iloom/cli@latest',
      escapedCommand: 'npm install -g @iloom/cli@latest',
      cwd: process.cwd(),
      durationMs: 1000,
      pipedFrom: []
    })

    // Mock: Verify installation succeeds
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        dependencies: {
          '@iloom/cli': { version: '1.0.0' }
        }
      }),
      stderr: '',
      failed: false,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm list -g @iloom/cli',
      escapedCommand: 'npm list -g @iloom/cli',
      cwd: process.cwd(),
      durationMs: 100,
      pipedFrom: []
    })

    // Mock: Uninstall hatchbox fails
    vi.mocked(execaCommand).mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Error uninstalling',
      failed: true,
      timedOut: false,
      isCanceled: false,
      killed: false,
      command: 'npm uninstall -g @hatchbox-ai/hatchbox-cli',
      escapedCommand: 'npm uninstall -g @hatchbox-ai/hatchbox-cli',
      cwd: process.cwd(),
      durationMs: 500,
      pipedFrom: []
    })

    // Should throw due to process.exit(0)
    await expect(updateCommand.execute()).rejects.toThrow('process.exit(0)')

    // Verify warning was logged
    expect(logger.warn).toHaveBeenCalledWith('Could not fully remove @hatchbox-ai/hatchbox-cli - you may need to uninstall manually')
    expect(mockExit).toHaveBeenCalledWith(0)
  })

  it('skips migration for non-global installations', async () => {
    const { detectInstallationMethod } = await import('../utils/installation-detector.js')

    // Mock: Local installation
    vi.mocked(detectInstallationMethod).mockReturnValue('local')

    // Should throw due to process.exit(1)
    await expect(updateCommand.execute()).rejects.toThrow('process.exit(1)')

    // Should exit with error before checking for legacy package
    expect(mockExit).toHaveBeenCalledWith(1)
  })

  it('performs regular update when no legacy package detected', async () => {
    const { detectInstallationMethod, detectLegacyPackage } = await import('../utils/installation-detector.js')
    const { UpdateNotifier } = await import('../utils/update-notifier.js')
    const { spawn } = await import('child_process')

    // Mock: Global installation
    vi.mocked(detectInstallationMethod).mockReturnValue('global')

    // Mock: No legacy package
    vi.mocked(detectLegacyPackage).mockReturnValue(null)

    // Mock: Update available
    const mockCheckForUpdates = vi.fn().mockResolvedValue({
      updateAvailable: true,
      currentVersion: '1.0.0',
      latestVersion: '1.1.0'
    })
    vi.mocked(UpdateNotifier).mockImplementation(() => ({
      checkForUpdates: mockCheckForUpdates
    }) as never)

    // Should throw due to process.exit(0)
    await expect(updateCommand.execute()).rejects.toThrow('process.exit(0)')

    // Verify regular update flow
    expect(spawn).toHaveBeenCalledWith('npm', ['install', '-g', '@iloom/cli@latest'], {
      detached: true,
      stdio: 'inherit'
    })
    expect(mockExit).toHaveBeenCalledWith(0)
  })
})
