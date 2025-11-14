import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectCapabilityDetector } from './ProjectCapabilityDetector.js'
import * as packageJsonUtils from '../utils/package-json.js'
import type { PackageJson } from '../utils/package-json.js'

vi.mock('../utils/package-json.js', () => ({
  readPackageJson: vi.fn(),
  parseBinField: vi.fn(),
  hasWebDependencies: vi.fn()
}))

describe('ProjectCapabilityDetector', () => {
  let detector: ProjectCapabilityDetector

  beforeEach(() => {
    vi.clearAllMocks()
    detector = new ProjectCapabilityDetector()
  })

  describe('detectCapabilities', () => {
    it('should detect CLI-only project (iloom itself)', async () => {
      const mockPackageJson: PackageJson = {
        name: 'iloom-ai',
        bin: {
          il: './dist/cli.js',
          iloom: './dist/cli.js'
        },
        dependencies: {
          commander: '^11.0.0'
        }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(false)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({
        il: './dist/cli.js',
        iloom: './dist/cli.js'
      })

      const result = await detector.detectCapabilities('/test/path')

      expect(result.capabilities).toEqual(['cli'])
      expect(result.binEntries).toEqual({
        il: './dist/cli.js',
        iloom: './dist/cli.js'
      })
      expect(packageJsonUtils.readPackageJson).toHaveBeenCalledWith('/test/path')
      expect(packageJsonUtils.parseBinField).toHaveBeenCalledWith(
        mockPackageJson.bin,
        'iloom-ai'
      )
    })

    it('should detect web-only project (Next.js app)', async () => {
      const mockPackageJson: PackageJson = {
        name: 'my-nextjs-app',
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0'
        }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(true)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({})

      const result = await detector.detectCapabilities('/test/path')

      expect(result.capabilities).toEqual(['web'])
      expect(result.binEntries).toEqual({})
    })

    it('should detect hybrid project (CLI with web dashboard)', async () => {
      const mockPackageJson: PackageJson = {
        name: 'hybrid-tool',
        bin: './dist/cli.js',
        dependencies: {
          express: '^4.18.0'
        }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(true)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({
        'hybrid-tool': './dist/cli.js'
      })

      const result = await detector.detectCapabilities('/test/path')

      expect(result.capabilities).toEqual(['cli', 'web'])
      expect(result.binEntries).toEqual({
        'hybrid-tool': './dist/cli.js'
      })
    })

    it('should detect project with no capabilities', async () => {
      const mockPackageJson: PackageJson = {
        name: 'library-package',
        dependencies: {
          lodash: '^4.17.21'
        }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(false)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({})

      const result = await detector.detectCapabilities('/test/path')

      expect(result.capabilities).toEqual([])
      expect(result.binEntries).toEqual({})
    })

    it('should parse bin entries correctly for CLI projects', async () => {
      const mockPackageJson: PackageJson = {
        name: 'my-cli',
        bin: {
          'my-cli': './bin/cli.js',
          'my-cli-dev': './bin/dev.js'
        }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(false)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({
        'my-cli': './bin/cli.js',
        'my-cli-dev': './bin/dev.js'
      })

      const result = await detector.detectCapabilities('/test/path')

      expect(result.capabilities).toEqual(['cli'])
      expect(result.binEntries).toEqual({
        'my-cli': './bin/cli.js',
        'my-cli-dev': './bin/dev.js'
      })
      expect(packageJsonUtils.parseBinField).toHaveBeenCalledWith(
        mockPackageJson.bin,
        'my-cli'
      )
    })

    it('should return empty capabilities when package.json does not exist', async () => {
      const error = new Error('package.json not found in /test/path')
      vi.mocked(packageJsonUtils.readPackageJson).mockRejectedValueOnce(error)

      const result = await detector.detectCapabilities('/test/path')

      expect(result.capabilities).toEqual([])
      expect(result.binEntries).toEqual({})
      expect(packageJsonUtils.readPackageJson).toHaveBeenCalledWith('/test/path')
    })

    it('should re-throw non-ENOENT errors', async () => {
      const error = new Error('Invalid JSON in package.json')
      vi.mocked(packageJsonUtils.readPackageJson).mockRejectedValueOnce(error)

      await expect(detector.detectCapabilities('/test/path')).rejects.toThrow('Invalid JSON in package.json')
    })
  })

  describe('parseBinEntries', () => {
    it('should parse string bin field using package name', async () => {
      const mockPackageJson: PackageJson = {
        name: 'simple-cli',
        bin: './index.js'
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(false)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({
        'simple-cli': './index.js'
      })

      const result = await detector.detectCapabilities('/test/path')

      expect(result.binEntries).toEqual({
        'simple-cli': './index.js'
      })
      expect(packageJsonUtils.parseBinField).toHaveBeenCalledWith(
        './index.js',
        'simple-cli'
      )
    })

    it('should parse object bin field with multiple binaries', async () => {
      const mockPackageJson: PackageJson = {
        name: 'multi-bin',
        bin: {
          cmd1: './bin/cmd1.js',
          cmd2: './bin/cmd2.js'
        }
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(false)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({
        cmd1: './bin/cmd1.js',
        cmd2: './bin/cmd2.js'
      })

      const result = await detector.detectCapabilities('/test/path')

      expect(result.binEntries).toEqual({
        cmd1: './bin/cmd1.js',
        cmd2: './bin/cmd2.js'
      })
    })

    it('should handle packages with special characters in name', async () => {
      const mockPackageJson: PackageJson = {
        name: '@scope/my-cli',
        bin: './cli.js'
      }

      vi.mocked(packageJsonUtils.readPackageJson).mockResolvedValueOnce(mockPackageJson)
      vi.mocked(packageJsonUtils.hasWebDependencies).mockReturnValueOnce(false)
      vi.mocked(packageJsonUtils.parseBinField).mockReturnValueOnce({
        '@scope/my-cli': './cli.js'
      })

      const result = await detector.detectCapabilities('/test/path')

      expect(result.binEntries).toEqual({
        '@scope/my-cli': './cli.js'
      })
      expect(packageJsonUtils.parseBinField).toHaveBeenCalledWith(
        './cli.js',
        '@scope/my-cli'
      )
    })
  })
})
