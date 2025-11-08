import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { VSCodeIntegration } from './VSCodeIntegration.js'
import path from 'path'
import fs from 'fs-extra'

// Mock fs-extra
vi.mock('fs-extra', () => ({
	default: {
		ensureDir: vi.fn(),
		pathExists: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		rename: vi.fn(),
	},
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
		success: vi.fn(),
	},
}))

describe('VSCodeIntegration', () => {
	let vscode: VSCodeIntegration
	const testWorkspacePath = '/test/workspace'
	const testVscodeDir = path.join(testWorkspacePath, '.vscode')
	const testSettingsPath = path.join(testVscodeDir, 'settings.json')

	beforeEach(() => {
		vscode = new VSCodeIntegration()
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('setTitleBarColor', () => {
		it('should create .vscode directory if it does not exist', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			expect(fs.ensureDir).toHaveBeenCalledWith(testVscodeDir)
		})

		it('should create new settings.json with color when file does not exist', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			// Check that writeFile was called with correct data
			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			// Verify all color customizations are set
			expect(settings['workbench.colorCustomizations']).toBeDefined()
			const colors = settings['workbench.colorCustomizations']

			// Title bar colors
			expect(colors['titleBar.activeBackground']).toBe('#dcebf8')
			expect(colors['titleBar.inactiveBackground']).toBe('#dcebf899')
			expect(colors['titleBar.activeForeground']).toBeDefined()
			expect(colors['titleBar.inactiveForeground']).toBeDefined()

			// Status bar colors
			expect(colors['statusBar.background']).toBe('#dcebf8')
			expect(colors['statusBar.foreground']).toBeDefined()
			expect(colors['statusBarItem.hoverBackground']).toBeDefined()

			// UI accent colors
			expect(colors['sash.hoverBorder']).toBe('#dcebf8')
			expect(colors['commandCenter.border']).toBeDefined()
		})

		it('should merge color into existing settings.json', async () => {
			const existingSettings = {
				'editor.fontSize': 14,
				'editor.tabSize': 2,
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#f8dceb')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			// Verify existing settings are preserved
			expect(settings['editor.fontSize']).toBe(14)
			expect(settings['editor.tabSize']).toBe(2)

			// Verify color customizations include all new properties
			expect(settings['workbench.colorCustomizations']).toBeDefined()
			const colors = settings['workbench.colorCustomizations']

			expect(colors['titleBar.activeBackground']).toBe('#f8dceb')
			expect(colors['statusBar.background']).toBe('#f8dceb')
			expect(colors['sash.hoverBorder']).toBe('#f8dceb')
			expect(colors['commandCenter.border']).toBeDefined()
		})

		it('should preserve existing workbench.colorCustomizations settings', async () => {
			const existingSettings = {
				'workbench.colorCustomizations': {
					'editor.background': '#ff0000',
					'panel.background': '#00ff00',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcf8eb')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			const colors = settings['workbench.colorCustomizations']

			// Verify existing custom colors are preserved
			expect(colors['editor.background']).toBe('#ff0000')
			expect(colors['panel.background']).toBe('#00ff00')

			// Verify new colors are added
			expect(colors['titleBar.activeBackground']).toBe('#dcf8eb')
			expect(colors['statusBar.background']).toBe('#dcf8eb')
			expect(colors['sash.hoverBorder']).toBe('#dcf8eb')
		})

		it('should preserve other settings keys unrelated to colors', async () => {
			const existingSettings = {
				'editor.fontSize': 14,
				'files.autoSave': 'onFocusChange',
				'terminal.integrated.fontSize': 12,
				'workbench.colorCustomizations': {
					'statusBar.background': '#ff0000',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#f8f0dc')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			expect(settings).toMatchObject({
				'editor.fontSize': 14,
				'files.autoSave': 'onFocusChange',
				'terminal.integrated.fontSize': 12,
			})
		})

		it('should handle JSONC files with comments (preserving comments)', async () => {
			const jsoncContent = `{
  // Editor settings
  "editor.fontSize": 14,
  /* Multi-line
     comment */
  "editor.tabSize": 2
}`

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(jsoncContent)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string

			// Comments should be preserved
			expect(content).toContain('// Editor settings')
			expect(content).toContain('/* Multi-line')

			// Settings should be valid
			const { parse } = await import('jsonc-parser')
			const settings = parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#dcebf8'
			)
		})

		it('should overwrite existing titleBar colors', async () => {
			const existingSettings = {
				'workbench.colorCustomizations': {
					'titleBar.activeBackground': '#ff0000',
					'titleBar.activeForeground': '#ffffff',
					'statusBar.background': '#ff0000',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)
			const colors = settings['workbench.colorCustomizations']

			// Verify all colors are overwritten with new values
			expect(colors['titleBar.activeBackground']).toBe('#dcebf8')
			expect(colors['statusBar.background']).toBe('#dcebf8')
			expect(colors['titleBar.activeForeground']).toBe('#000000') // Light background = black text
		})

		it('should handle malformed JSON gracefully with descriptive error', async () => {
			const malformedJson = '{ "editor.fontSize": 14, invalid }'

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(malformedJson)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)

			await expect(vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')).rejects.toThrow(
				/Failed to parse settings\.json/
			)
		})

		it('should write atomically using temp file and rename', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			// Should write to temp file first
			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringMatching(/settings\.json\.tmp$/),
				expect.any(String),
				'utf8'
			)

			// Should rename temp to final
			expect(fs.rename).toHaveBeenCalledWith(
				expect.stringMatching(/settings\.json\.tmp$/),
				testSettingsPath
			)
		})

		it('should format JSON with 2-space indentation', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string

			// Check indentation
			expect(content).toContain('  "workbench.colorCustomizations"')
			expect(content).toContain('    "titleBar.activeBackground"')
		})
	})

	describe('error scenarios', () => {
		it('should throw meaningful error when ensureDir fails', async () => {
			vi.mocked(fs.ensureDir).mockRejectedValue(new Error('EACCES: permission denied'))

			await expect(vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')).rejects.toThrow(
				/Failed to set VSCode title bar color/
			)
		})

		it('should handle file write permission errors', async () => {
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockRejectedValue(new Error('EACCES: permission denied'))

			await expect(vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')).rejects.toThrow(
				/Failed to set VSCode title bar color/
			)
		})
	})

	describe('integration scenarios', () => {
		it('should handle complex real-world settings file', async () => {
			const complexSettings = {
				'editor.fontSize': 14,
				'editor.fontFamily': 'Fira Code',
				'editor.rulers': [80, 120],
				'files.exclude': {
					'**/.git': true,
					'**/node_modules': true,
				},
				'workbench.colorCustomizations': {
					'editor.background': '#1e1e1e',
					'panel.background': '#2d2d2d',
				},
				'[javascript]': {
					'editor.defaultFormatter': 'esbenp.prettier-vscode',
				},
			}

			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(complexSettings, null, 2))
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')

			const writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			const content = writeCall[1] as string
			const settings = JSON.parse(content)

			// All original settings preserved
			expect(settings['editor.fontSize']).toBe(14)
			expect(settings['editor.fontFamily']).toBe('Fira Code')
			expect(settings['editor.rulers']).toEqual([80, 120])
			expect(settings['files.exclude']).toEqual({
				'**/.git': true,
				'**/node_modules': true,
			})
			expect(settings['[javascript]']).toEqual({
				'editor.defaultFormatter': 'esbenp.prettier-vscode',
			})

			// Color customizations merged - preserves existing custom colors
			const colors = settings['workbench.colorCustomizations']
			expect(colors['statusBar.background']).toBe('#dcebf8') // Overwritten by our color
			expect(colors['titleBar.activeBackground']).toBe('#dcebf8')
			expect(colors['sash.hoverBorder']).toBe('#dcebf8')
			expect(colors['commandCenter.border']).toBeDefined()
		})

		it('should handle sequential color changes (simulating branch switches)', async () => {
			vi.mocked(fs.ensureDir).mockResolvedValue(undefined)
			vi.mocked(fs.writeFile).mockResolvedValue(undefined)
			vi.mocked(fs.rename).mockResolvedValue(undefined)

			// First color - file doesn't exist
			vi.mocked(fs.pathExists).mockResolvedValue(false)
			await vscode.setTitleBarColor(testWorkspacePath, '#dcebf8')
			let writeCall = vi.mocked(fs.writeFile).mock.calls[0]
			let content = writeCall[1] as string
			let settings = JSON.parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#dcebf8'
			)

			// Second color - file now exists with first color
			vi.mocked(fs.pathExists).mockResolvedValue(true)
			vi.mocked(fs.readFile).mockResolvedValue(content)
			await vscode.setTitleBarColor(testWorkspacePath, '#f8dceb')
			writeCall = vi.mocked(fs.writeFile).mock.calls[1]
			content = writeCall[1] as string
			settings = JSON.parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#f8dceb'
			)

			// Third color - file exists with second color
			vi.mocked(fs.readFile).mockResolvedValue(content)
			await vscode.setTitleBarColor(testWorkspacePath, '#dcf8eb')
			writeCall = vi.mocked(fs.writeFile).mock.calls[2]
			content = writeCall[1] as string
			settings = JSON.parse(content)
			expect(settings['workbench.colorCustomizations']['titleBar.activeBackground']).toBe(
				'#dcf8eb'
			)
		})
	})
})
