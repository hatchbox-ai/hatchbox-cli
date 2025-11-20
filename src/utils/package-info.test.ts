import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPackageInfo } from './package-info.js'
import fs from 'fs'

// Mock fs module
vi.mock('fs')

describe('getPackageInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads package.json successfully with default path', () => {
    // Mock readFileSync to return a valid package.json
    const mockPackageJson = {
      name: '@iloom/cli',
      version: '0.1.12',
      description: 'CLI for managing isolated workspaces',
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson))

    const result = getPackageInfo()

    expect(result).toEqual(mockPackageJson)
    expect(fs.readFileSync).toHaveBeenCalled()
  })

  it('reads package.json successfully with custom script path', () => {
    // Mock readFileSync to return a valid package.json
    const mockPackageJson = {
      name: '@hatchbox-ai/hatchbox-cli',
      version: '1.0.0',
      description: 'Legacy package',
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson))

    const result = getPackageInfo('/usr/local/lib/node_modules/@hatchbox-ai/hatchbox-cli/dist/cli.js')

    expect(result).toEqual(mockPackageJson)
    expect(result.name).toBe('@hatchbox-ai/hatchbox-cli')
  })

  it('includes additional package.json fields', () => {
    // Mock readFileSync to return package.json with extra fields
    const mockPackageJson = {
      name: '@iloom/cli',
      version: '0.1.12',
      description: 'CLI for managing isolated workspaces',
      author: 'Test Author',
      license: 'MIT',
      repository: {
        type: 'git',
        url: 'https://github.com/example/repo',
      },
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson))

    const result = getPackageInfo()

    expect(result).toEqual(mockPackageJson)
    expect(result.author).toBe('Test Author')
    expect(result.license).toBe('MIT')
  })

  it('throws error when package.json cannot be read', () => {
    // Mock readFileSync to throw an error
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    expect(() => getPackageInfo()).toThrow('Failed to read package.json')
  })

  it('throws error when package.json is invalid JSON', () => {
    // Mock readFileSync to return invalid JSON
    vi.mocked(fs.readFileSync).mockReturnValue('invalid json {]')

    expect(() => getPackageInfo()).toThrow('Failed to read package.json')
  })

  it('handles empty package.json gracefully', () => {
    // Mock readFileSync to return an empty object
    vi.mocked(fs.readFileSync).mockReturnValue('{}')

    const result = getPackageInfo()

    // Should return empty object but TypeScript expects required fields
    // This tests runtime behavior
    expect(result).toEqual({})
  })

  it('constructs correct path from script location', () => {
    const mockPackageJson = {
      name: '@iloom/cli',
      version: '0.1.12',
      description: 'CLI for managing isolated workspaces',
    }
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPackageJson))

    // Call with a specific script path
    getPackageInfo('/path/to/project/dist/cli.js')

    // Verify readFileSync was called with the correct path
    // (should go up 1 level from dist/cli.js to package.json)
    expect(fs.readFileSync).toHaveBeenCalledWith(
      '/path/to/project/package.json',
      'utf8'
    )
  })
})
