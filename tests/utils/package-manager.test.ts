import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { detectPackageManager, installDependencies, runScript } from '../../src/utils/package-manager.js'
import { logger } from '../../src/utils/logger.js'

type MockExecaReturn = Partial<ExecaReturnValue<string>>

vi.mock('execa')
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }
}))

describe('package-manager utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('detectPackageManager', () => {
    it('should detect pnpm when available', async () => {
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)

      const result = await detectPackageManager()

      expect(result).toBe('pnpm')
      expect(execa).toHaveBeenCalledWith('pnpm', ['--version'])
    })

    it('should fallback to npm when pnpm not available', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockResolvedValueOnce({ stdout: '9.0.0' } as MockExecaReturn)

      const result = await detectPackageManager()

      expect(result).toBe('npm')
      expect(execa).toHaveBeenCalledWith('npm', ['--version'])
    })

    it('should fallback to yarn when pnpm and npm not available', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockRejectedValueOnce(new Error('npm not found'))
        .mockResolvedValueOnce({ stdout: '1.22.0' } as MockExecaReturn)

      const result = await detectPackageManager()

      expect(result).toBe('yarn')
      expect(execa).toHaveBeenCalledWith('yarn', ['--version'])
    })

    it('should return null when no package manager found', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('not found'))

      const result = await detectPackageManager()

      expect(result).toBeNull()
    })
  })

  describe('installDependencies', () => {
    it('should install with pnpm --frozen-lockfile', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', true)

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['install', '--frozen-lockfile'],
        expect.objectContaining({
          cwd: '/test/path',
          stdio: 'inherit',
          timeout: 300000
        })
      )
      expect(logger.success).toHaveBeenCalledWith('Dependencies installed successfully')
    })

    it('should install with pnpm without frozen lockfile', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', false)

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use npm ci for frozen installs', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockResolvedValueOnce({ stdout: '9.0.0' } as MockExecaReturn)  // detect npm
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', true)

      expect(execa).toHaveBeenCalledWith(
        'npm',
        ['ci'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use npm install for non-frozen installs', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockResolvedValueOnce({ stdout: '9.0.0' } as MockExecaReturn)  // detect npm
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', false)

      expect(execa).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use yarn with frozen lockfile', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockRejectedValueOnce(new Error('npm not found'))
        .mockResolvedValueOnce({ stdout: '1.22.0' } as MockExecaReturn)  // detect yarn
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', true)

      expect(execa).toHaveBeenCalledWith(
        'yarn',
        ['install', '--frozen-lockfile'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should throw error when no package manager found', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('not found'))

      await expect(installDependencies('/test/path')).rejects.toThrow(
        'No package manager found (pnpm, npm, or yarn)'
      )
    })

    it('should throw error when install fails', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockRejectedValueOnce({
          stderr: 'Lockfile is out of date',
          message: 'Command failed'
        })

      await expect(installDependencies('/test/path')).rejects.toThrow(
        'Failed to install dependencies: Lockfile is out of date'
      )
    })

    it('should handle install error with only message', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockRejectedValueOnce({
          message: 'Install failed'
        })

      await expect(installDependencies('/test/path')).rejects.toThrow(
        'Failed to install dependencies: Install failed'
      )
    })
  })

  describe('runScript', () => {
    it('should run script with pnpm', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('test', '/test/path', ['--coverage'])

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['test', '--coverage'],
        expect.objectContaining({
          cwd: '/test/path',
          stdio: 'inherit',
          timeout: 600000
        })
      )
    })

    it('should run script with pnpm without additional args', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('build', '/test/path')

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['build'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use npm run for npm', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockResolvedValueOnce({ stdout: '9.0.0' } as MockExecaReturn)  // detect npm
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('build', '/test/path')

      expect(execa).toHaveBeenCalledWith(
        'npm',
        ['run', 'build'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use yarn for yarn', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockRejectedValueOnce(new Error('npm not found'))
        .mockResolvedValueOnce({ stdout: '1.22.0' } as MockExecaReturn)  // detect yarn
        .mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('test', '/test/path')

      expect(execa).toHaveBeenCalledWith(
        'yarn',
        ['test'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should throw error when no package manager found', async () => {
      vi.mocked(execa).mockRejectedValue(new Error('not found'))

      await expect(runScript('test', '/test/path')).rejects.toThrow(
        'No package manager found (pnpm, npm, or yarn)'
      )
    })

    it('should throw error when script fails', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockRejectedValueOnce({
          stderr: 'Test failed',
          message: 'Command failed'
        })

      await expect(runScript('test', '/test/path')).rejects.toThrow(
        "Failed to run script 'test': Test failed"
      )
    })

    it('should handle script error with only message', async () => {
      vi.mocked(execa)
        .mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)  // detect pnpm
        .mockRejectedValueOnce({
          message: 'Script not found'
        })

      await expect(runScript('unknown', '/test/path')).rejects.toThrow(
        "Failed to run script 'unknown': Script not found"
      )
    })
  })
})
