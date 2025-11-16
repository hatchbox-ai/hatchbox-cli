import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { InitCommand } from './init.js'
import { ShellCompletion } from '../lib/ShellCompletion.js'
import * as prompt from '../utils/prompt.js'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

// Mock prompt utilities
vi.mock('../utils/prompt.js', () => ({
  promptConfirmation: vi.fn(),
}))

// Mock fs/promises and fs
vi.mock('fs/promises')
vi.mock('fs')

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock SettingsMigrationManager
vi.mock('../lib/SettingsMigrationManager.js', () => ({
  SettingsMigrationManager: vi.fn().mockImplementation(() => ({
    migrateSettingsIfNeeded: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe('InitCommand', () => {
  let initCommand: InitCommand
  let mockShellCompletion: ShellCompletion
  let originalShell: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalShell = process.env.SHELL

    // Create mock shell completion
    mockShellCompletion = {
      detectShell: vi.fn(),
      getSetupInstructions: vi.fn(),
      init: vi.fn(),
      getBranchSuggestions: vi.fn(),
      getCompletionScript: vi.fn(),
      printCompletionScript: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  })

  afterEach(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL
    } else {
      process.env.SHELL = originalShell
    }
  })

  describe('execute', () => {
    it('should detect user shell and offer autocomplete setup', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('bash')
      vi.mocked(mockShellCompletion.getSetupInstructions).mockReturnValue(
        'Add eval "$(il --completion)" to ~/.bashrc'
      )
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(true)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      expect(prompt.promptConfirmation).toHaveBeenCalledWith(
        'Would you like to enable shell autocomplete?',
        true
      )
      expect(mockShellCompletion.getSetupInstructions).toHaveBeenCalledWith('bash')
    })

    it('should skip autocomplete setup if user declines but still run project configuration', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('zsh')
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(false)
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFile).mockResolvedValue('') // Empty .gitignore

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      expect(prompt.promptConfirmation).toHaveBeenCalled()
      expect(mockShellCompletion.getSetupInstructions).not.toHaveBeenCalled()

      // Verify project configuration still runs
      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.iloom'), { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.local.json'),
        '{}\n',
        'utf-8'
      )
    })

    it('should generate and display setup instructions for bash', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('bash')
      vi.mocked(mockShellCompletion.getSetupInstructions).mockReturnValue(
        'Bash instructions here'
      )
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(true)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.getSetupInstructions).toHaveBeenCalledWith('bash')
    })

    it('should generate and display setup instructions for zsh', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('zsh')
      vi.mocked(mockShellCompletion.getSetupInstructions).mockReturnValue('Zsh instructions here')
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(true)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.getSetupInstructions).toHaveBeenCalledWith('zsh')
    })

    it('should handle errors gracefully when shell detection fails and still run project configuration', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('unknown')
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFile).mockResolvedValue('') // Empty .gitignore

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      // Should exit early and not prompt for autocomplete
      expect(prompt.promptConfirmation).not.toHaveBeenCalled()

      // Verify project configuration still runs
      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.iloom'), { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.local.json'),
        '{}\n',
        'utf-8'
      )
    })

    it('should work when SHELL environment variable is not set and still run project configuration', async () => {
      delete process.env.SHELL
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('unknown')
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFile).mockResolvedValue('') // Empty .gitignore

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mockShellCompletion.detectShell).toHaveBeenCalled()
      // Should exit early since shell is unknown
      expect(prompt.promptConfirmation).not.toHaveBeenCalled()

      // Verify project configuration still runs
      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.iloom'), { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.local.json'),
        '{}\n',
        'utf-8'
      )
    })

    it('should throw error if execution fails', async () => {
      vi.mocked(mockShellCompletion.detectShell).mockImplementation(() => {
        throw new Error('Detection failed')
      })

      initCommand = new InitCommand(mockShellCompletion)

      await expect(initCommand.execute()).rejects.toThrow('Detection failed')
    })
  })

  describe('setupProjectConfiguration', () => {
    beforeEach(() => {
      vi.mocked(mockShellCompletion.detectShell).mockReturnValue('bash')
      vi.mocked(mockShellCompletion.getSetupInstructions).mockReturnValue('Instructions')
      vi.mocked(prompt.promptConfirmation).mockResolvedValue(true)
    })

    it('should run settings migration before creating new settings files', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFile).mockResolvedValue('') // Empty .gitignore

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      // Verify migration manager was imported and used
      const { SettingsMigrationManager } = await import('../lib/SettingsMigrationManager.js')
      expect(SettingsMigrationManager).toHaveBeenCalled()
    })

    it('should create empty settings.local.json if not exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false)
      vi.mocked(readFile).mockResolvedValue('') // Empty .gitignore

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.iloom'), { recursive: true })
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.local.json'),
        '{}\n',
        'utf-8'
      )
    })

    it('should preserve existing settings.local.json', async () => {
      // First call for settings.local.json (exists)
      // Second call for .gitignore (exists)
      vi.mocked(existsSync).mockReturnValueOnce(true).mockReturnValueOnce(true)
      vi.mocked(readFile).mockResolvedValue('') // Empty .gitignore

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('.iloom'), { recursive: true })
      // writeFile should only be called once for .gitignore, not for settings.local.json
      const writeFileCalls = vi.mocked(writeFile).mock.calls
      const settingsLocalCalls = writeFileCalls.filter(call =>
        call[0].toString().includes('settings.local.json')
      )
      expect(settingsLocalCalls).toHaveLength(0)
    })

    it('should add settings.local.json to .gitignore', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true)
      vi.mocked(readFile).mockResolvedValue('node_modules/\n')

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        'node_modules/\n\n# Added by iloom CLI\n.iloom/settings.local.json\n',
        'utf-8'
      )
    })

    it('should create .gitignore if missing', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(false)

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        '\n# Added by iloom CLI\n.iloom/settings.local.json\n',
        'utf-8'
      )
    })

    it('should not duplicate entry in .gitignore', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true)
      vi.mocked(readFile).mockResolvedValue('.iloom/settings.local.json\n')

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      // Should not write to .gitignore since entry already exists
      const writeFileCalls = vi.mocked(writeFile).mock.calls
      const gitignoreCalls = writeFileCalls.filter(call =>
        call[0].toString().includes('.gitignore')
      )
      expect(gitignoreCalls).toHaveLength(0)
    })

    it('should handle .gitignore without trailing newline', async () => {
      vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true)
      vi.mocked(readFile).mockResolvedValue('node_modules/')

      initCommand = new InitCommand(mockShellCompletion)
      await initCommand.execute()

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.gitignore'),
        'node_modules/\n\n# Added by iloom CLI\n.iloom/settings.local.json\n',
        'utf-8'
      )
    })
  })
})
