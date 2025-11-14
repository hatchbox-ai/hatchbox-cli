import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { CLIIsolationManager } from './CLIIsolationManager.js'
import * as packageManager from '../utils/package-manager.js'
import * as packageJsonUtils from '../utils/package-json.js'
import { logger } from '../utils/logger.js'
import type { PackageJson } from '../utils/package-json.js'

vi.mock('fs-extra')
vi.mock('../utils/package-manager.js')
vi.mock('../utils/package-json.js')
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

describe('CLIIsolationManager', () => {
  let manager: CLIIsolationManager
  const homedir = '/home/testuser'
  const iloomBinDir = path.join(homedir, '.iloom', 'bin')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(os, 'homedir').mockReturnValue(homedir)
    manager = new CLIIsolationManager()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('setupCLIIsolation', () => {
    it('should build project successfully', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'test-cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'test-cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      const result = await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(packageManager.runScript).toHaveBeenCalledWith('build', worktreePath)
      expect(logger.info).toHaveBeenCalledWith('Building CLI tool...')
      expect(logger.success).toHaveBeenCalledWith('Build completed')
      expect(result).toEqual(['test-cli-42'])

      process.env.PATH = originalEnv
    })

    it('should create ~/.iloom/bin directory if not exists', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(fs.ensureDir).toHaveBeenCalledWith(iloomBinDir)

      process.env.PATH = originalEnv
    })

    it('should create versioned symlinks for all bin entries', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = {
        il: './dist/cli.js',
        iloom: './dist/cli.js'
      }

      const mockPackageJson: PackageJson = {
        name: 'iloom',
        scripts: { build: 'tsup' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.symlink).mockResolvedValue(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      const result = await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(fs.symlink).toHaveBeenCalledTimes(2)
      expect(fs.symlink).toHaveBeenCalledWith(
        path.resolve(worktreePath, './dist/cli.js'),
        path.join(iloomBinDir, 'il-42')
      )
      expect(fs.symlink).toHaveBeenCalledWith(
        path.resolve(worktreePath, './dist/cli.js'),
        path.join(iloomBinDir, 'iloom-42')
      )
      expect(result).toEqual(['il-42', 'iloom-42'])

      process.env.PATH = originalEnv
    })

    it('should create multiple symlinks for same target (il, iloom)', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = {
        il: './dist/cli.js',
        iloom: './dist/cli.js'
      }

      const mockPackageJson: PackageJson = {
        name: 'iloom',
        scripts: { build: 'tsup' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.access).mockResolvedValue(undefined)
      vi.mocked(fs.symlink).mockResolvedValue(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      const result = await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(result).toHaveLength(2)
      expect(result).toContain('il-42')
      expect(result).toContain('iloom-42')
      expect(logger.success).toHaveBeenCalledWith('CLI available: il-42')
      expect(logger.success).toHaveBeenCalledWith('CLI available: iloom-42')

      process.env.PATH = originalEnv
    })

    it('should handle build failures gracefully', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockRejectedValueOnce(
        new Error('TypeScript compilation failed')
      )

      await expect(manager.setupCLIIsolation(worktreePath, 42, binEntries)).rejects.toThrow(
        'TypeScript compilation failed'
      )

      expect(logger.info).toHaveBeenCalledWith('Building CLI tool...')
      expect(logger.success).not.toHaveBeenCalledWith('Build completed')
    })

    it('should throw if bin target does not exist after build', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(false)

      await expect(manager.setupCLIIsolation(worktreePath, 42, binEntries)).rejects.toThrow(
        'Bin target does not exist: /test/worktree/dist/cli.js'
      )
    })

    it('should make symlink targets executable', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      const targetPath = path.resolve(worktreePath, './dist/cli.js')
      expect(fs.access).toHaveBeenCalledWith(targetPath, fs.constants.X_OK)

      process.env.PATH = originalEnv
    })

    it('should warn about PATH setup if not configured', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalEnv = process.env.PATH
      const originalShell = process.env.SHELL
      process.env.PATH = '/usr/bin:/bin'  // Does not include .iloom/bin
      process.env.SHELL = '/bin/zsh'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('One-time PATH setup required'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.zshrc'))

      process.env.PATH = originalEnv
      process.env.SHELL = originalShell
    })
  })

  describe('ensureIloomBinInPath', () => {
    it('should detect zsh and check ~/.zshrc', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalShell = process.env.SHELL
      const originalPath = process.env.PATH
      process.env.SHELL = '/bin/zsh'
      process.env.PATH = '/usr/bin'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.zshrc'))

      process.env.SHELL = originalShell
      process.env.PATH = originalPath
    })

    it('should detect bash and check ~/.bashrc', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalShell = process.env.SHELL
      const originalPath = process.env.PATH
      process.env.SHELL = '/bin/bash'
      process.env.PATH = '/usr/bin'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.bashrc'))

      process.env.SHELL = originalShell
      process.env.PATH = originalPath
    })

    it('should detect fish and check ~/.config/fish/config.fish', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalShell = process.env.SHELL
      const originalPath = process.env.PATH
      process.env.SHELL = '/usr/bin/fish'
      process.env.PATH = '/usr/bin'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.config/fish/config.fish'))

      process.env.SHELL = originalShell
      process.env.PATH = originalPath
    })

    it('should skip warning if PATH already configured', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      // Should not log PATH setup warnings
      const warnCalls = vi.mocked(logger.warn).mock.calls
      const hasPathWarning = warnCalls.some(call =>
        call[0]?.includes('One-time PATH setup required')
      )
      expect(hasPathWarning).toBe(false)

      process.env.PATH = originalPath
    })

    it('should provide clear setup instructions', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      const originalShell = process.env.SHELL
      process.env.PATH = '/usr/bin'
      process.env.SHELL = '/bin/zsh'

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('One-time PATH setup required'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('export PATH="$HOME/.iloom/bin:$PATH"'))
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('source ~/.zshrc'))

      process.env.PATH = originalPath
      process.env.SHELL = originalShell
    })

    it('should handle missing shell RC files gracefully', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      const originalShell = process.env.SHELL
      process.env.PATH = '/usr/bin'
      process.env.SHELL = undefined

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      // Should still provide instructions with default shell
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('~/.bashrc'))

      process.env.PATH = originalPath
      process.env.SHELL = originalShell
    })
  })

  describe('verifyBinTargets', () => {
    it('should verify all bin targets exist', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      expect(fs.pathExists).toHaveBeenCalledWith(path.resolve(worktreePath, './dist/cli.js'))

      process.env.PATH = originalPath
    })

    it('should verify bin targets are executable', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(true)
      vi.mocked(fs.access).mockResolvedValueOnce(undefined)
      vi.mocked(fs.symlink).mockResolvedValueOnce(undefined)

      const originalPath = process.env.PATH
      process.env.PATH = `${iloomBinDir}:/usr/bin`

      await manager.setupCLIIsolation(worktreePath, 42, binEntries)

      const targetPath = path.resolve(worktreePath, './dist/cli.js')
      expect(fs.access).toHaveBeenCalledWith(targetPath, fs.constants.X_OK)

      process.env.PATH = originalPath
    })

    it('should return list of missing targets', async () => {
      const worktreePath = '/test/worktree'
      const binEntries = { 'cli': './dist/cli.js' }

      const mockPackageJson: PackageJson = {
        name: 'cli',
        scripts: { build: 'tsc' }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasScript).mockReturnValueOnce(true)
      vi.mocked(packageManager.runScript).mockResolvedValueOnce(undefined)
      vi.mocked(fs.ensureDir).mockResolvedValueOnce(undefined)
      vi.mocked(fs.pathExists).mockResolvedValueOnce(false)

      await expect(manager.setupCLIIsolation(worktreePath, 42, binEntries)).rejects.toThrow(
        'Bin target does not exist: /test/worktree/dist/cli.js'
      )
    })
  })

  describe('cleanupVersionedExecutables', () => {
    it('should remove all symlinks matching the identifier', async () => {
      const identifier = 42

      // Mock readdir to return files in the bin directory
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-42',
        'iloom-42',
        'other-tool-42',
        'il-37',
        'some-other-file'
      ] as unknown as string[])

      // Mock unlink to track what gets removed
      vi.mocked(fs.unlink).mockResolvedValue(undefined)

      const removed = await manager.cleanupVersionedExecutables(identifier)

      expect(removed).toEqual(['il-42', 'iloom-42', 'other-tool-42'])
      expect(fs.unlink).toHaveBeenCalledTimes(3)
      expect(fs.unlink).toHaveBeenCalledWith(path.join(iloomBinDir, 'il-42'))
      expect(fs.unlink).toHaveBeenCalledWith(path.join(iloomBinDir, 'iloom-42'))
      expect(fs.unlink).toHaveBeenCalledWith(path.join(iloomBinDir, 'other-tool-42'))
    })

    it('should handle string identifiers with special characters', async () => {
      const identifier = 'feat/issue-42'

      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-feat/issue-42',
        'iloom-feat/issue-42',
        'il-42'
      ] as unknown as string[])

      vi.mocked(fs.unlink).mockResolvedValue(undefined)

      const removed = await manager.cleanupVersionedExecutables(identifier)

      expect(removed).toEqual(['il-feat/issue-42', 'iloom-feat/issue-42'])
      expect(fs.unlink).toHaveBeenCalledTimes(2)
    })

    it('should return empty array if no matching symlinks found', async () => {
      const identifier = 99

      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-42',
        'iloom-37',
        'other-tool'
      ] as unknown as string[])

      const removed = await manager.cleanupVersionedExecutables(identifier)

      expect(removed).toEqual([])
      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('should handle missing bin directory gracefully', async () => {
      const identifier = 42

      vi.mocked(fs.readdir).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
      )

      const removed = await manager.cleanupVersionedExecutables(identifier)

      expect(removed).toEqual([])
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No CLI executables directory found')
      )
    })

    it('should continue on individual file deletion failures', async () => {
      const identifier = 42

      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-42',
        'iloom-42',
        'tool-42'
      ] as unknown as string[])

      vi.mocked(fs.unlink)
        .mockResolvedValueOnce(undefined) // il-42 succeeds
        .mockRejectedValueOnce(new Error('Permission denied')) // iloom-42 fails
        .mockResolvedValueOnce(undefined) // tool-42 succeeds

      const removed = await manager.cleanupVersionedExecutables(identifier)

      expect(removed).toEqual(['il-42', 'tool-42'])
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to remove symlink iloom-42')
      )
    })

    it('should silently skip already-deleted symlinks (ENOENT)', async () => {
      const identifier = 42

      vi.mocked(fs.readdir).mockResolvedValueOnce(['il-42'] as unknown as string[])

      vi.mocked(fs.unlink).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
      )

      const removed = await manager.cleanupVersionedExecutables(identifier)

      expect(removed).toEqual(['il-42'])
      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('findOrphanedSymlinks', () => {
    it('should detect symlinks pointing to non-existent targets', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-42',
        'iloom-42',
        'regular-file'
      ] as unknown as string[])

      // il-42 is a symlink pointing to deleted worktree
      vi.mocked(fs.lstat).mockResolvedValueOnce({
        isSymbolicLink: () => true
      } as unknown as fs.Stats)

      vi.mocked(fs.readlink).mockResolvedValueOnce('/worktrees/issue-42/dist/cli.js')

      vi.mocked(fs.access).mockRejectedValueOnce(
        new Error('ENOENT: no such file or directory')
      )

      // iloom-42 is a symlink pointing to existing worktree
      vi.mocked(fs.lstat).mockResolvedValueOnce({
        isSymbolicLink: () => true
      } as unknown as fs.Stats)

      vi.mocked(fs.readlink).mockResolvedValueOnce('/worktrees/issue-37/dist/cli.js')

      vi.mocked(fs.access).mockResolvedValueOnce(undefined)

      // regular-file is not a symlink
      vi.mocked(fs.lstat).mockResolvedValueOnce({
        isSymbolicLink: () => false
      } as unknown as fs.Stats)

      const orphaned = await manager.findOrphanedSymlinks()

      expect(orphaned).toHaveLength(1)
      expect(orphaned[0]).toEqual({
        name: 'il-42',
        path: path.join(iloomBinDir, 'il-42'),
        brokenTarget: '/worktrees/issue-42/dist/cli.js'
      })
    })

    it('should return empty array if bin directory does not exist', async () => {
      vi.mocked(fs.readdir).mockRejectedValueOnce(
        Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
      )

      const orphaned = await manager.findOrphanedSymlinks()

      expect(orphaned).toEqual([])
    })

    it('should handle permission errors gracefully', async () => {
      vi.mocked(fs.readdir).mockRejectedValueOnce(new Error('EACCES: permission denied'))

      await expect(manager.findOrphanedSymlinks()).rejects.toThrow('permission denied')
    })

    it('should find multiple orphaned symlinks', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-42',
        'il-37',
        'il-99'
      ] as unknown as string[])

      // All are symlinks pointing to non-existent targets
      for (let i = 0; i < 3; i++) {
        vi.mocked(fs.lstat).mockResolvedValueOnce({
          isSymbolicLink: () => true
        } as unknown as fs.Stats)

        vi.mocked(fs.readlink).mockResolvedValueOnce(`/worktrees/issue-${i}/dist/cli.js`)

        vi.mocked(fs.access).mockRejectedValueOnce(
          new Error('ENOENT: no such file or directory')
        )
      }

      const orphaned = await manager.findOrphanedSymlinks()

      expect(orphaned).toHaveLength(3)
      expect(orphaned.map(o => o.name)).toEqual(['il-42', 'il-37', 'il-99'])
    })
  })

  describe('cleanupOrphanedSymlinks', () => {
    it('should remove all orphaned symlinks and return count', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-42',
        'iloom-42'
      ] as unknown as string[])

      // Both are orphaned symlinks
      for (let i = 0; i < 2; i++) {
        vi.mocked(fs.lstat).mockResolvedValueOnce({
          isSymbolicLink: () => true
        } as unknown as fs.Stats)

        vi.mocked(fs.readlink).mockResolvedValueOnce('/worktrees/deleted/dist/cli.js')

        vi.mocked(fs.access).mockRejectedValueOnce(
          new Error('ENOENT: no such file or directory')
        )
      }

      vi.mocked(fs.unlink).mockResolvedValue(undefined)

      const count = await manager.cleanupOrphanedSymlinks()

      expect(count).toBe(2)
      expect(fs.unlink).toHaveBeenCalledTimes(2)
      expect(logger.success).toHaveBeenCalledWith('Removed orphaned symlink: il-42')
      expect(logger.success).toHaveBeenCalledWith('Removed orphaned symlink: iloom-42')
    })

    it('should return 0 if no orphaned symlinks found', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce(['il-42'] as unknown as string[])

      vi.mocked(fs.lstat).mockResolvedValueOnce({
        isSymbolicLink: () => true
      } as unknown as fs.Stats)

      vi.mocked(fs.readlink).mockResolvedValueOnce('/worktrees/issue-42/dist/cli.js')

      vi.mocked(fs.access).mockResolvedValueOnce(undefined) // Target exists

      const count = await manager.cleanupOrphanedSymlinks()

      expect(count).toBe(0)
      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('should handle individual deletion failures gracefully', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        'il-42',
        'il-37'
      ] as unknown as string[])

      // Both are orphaned
      for (let i = 0; i < 2; i++) {
        vi.mocked(fs.lstat).mockResolvedValueOnce({
          isSymbolicLink: () => true
        } as unknown as fs.Stats)

        vi.mocked(fs.readlink).mockResolvedValueOnce('/worktrees/deleted/dist/cli.js')

        vi.mocked(fs.access).mockRejectedValueOnce(
          new Error('ENOENT: no such file or directory')
        )
      }

      vi.mocked(fs.unlink)
        .mockResolvedValueOnce(undefined) // il-42 succeeds
        .mockRejectedValueOnce(new Error('Permission denied')) // il-37 fails

      const count = await manager.cleanupOrphanedSymlinks()

      expect(count).toBe(1)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to remove orphaned symlink il-37')
      )
    })
  })
})
