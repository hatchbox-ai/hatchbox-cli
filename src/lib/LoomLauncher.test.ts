import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoomLauncher } from './LoomLauncher.js'
import type { LaunchLoomOptions } from './LoomLauncher.js'
import * as terminal from '../utils/terminal.js'
import type { TerminalWindowOptions } from '../utils/terminal.js'
import * as vscode from '../utils/vscode.js'
import * as devServer from '../utils/dev-server.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'

// Mock all external dependencies
vi.mock('../utils/terminal.js')
vi.mock('../utils/vscode.js')
vi.mock('../utils/dev-server.js')
vi.mock('./ClaudeContextManager.js')
vi.mock('../utils/color.js', () => ({
	generateColorFromBranchName: vi.fn(() => ({
		rgb: { r: 0.5, g: 0.3, b: 0.7 },
		hex: '#8833bb',
		index: 0,
	})),
}))

describe('LoomLauncher', () => {
	let launcher: LoomLauncher
	let mockClaudeContext: { launchWithContext: ReturnType<typeof vi.fn> }

	const baseOptions: LaunchLoomOptions = {
		enableClaude: true,
		enableCode: true,
		enableDevServer: true,
		enableTerminal: false,
		worktreePath: '/Users/test/workspace',
		branchName: 'feat/test-feature',
		port: 3042,
		capabilities: ['web'],
		workflowType: 'issue',
		identifier: 42,
		title: 'Test Issue',
	}

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock ClaudeContextManager
		mockClaudeContext = {
			launchWithContext: vi.fn().mockResolvedValue(undefined),
		}
		vi.mocked(ClaudeContextManager).mockImplementation(() => mockClaudeContext)

		launcher = new LoomLauncher() // Uses default ClaudeContextManager for tests
	})

	describe('launchLoom', () => {
		describe('all components enabled', () => {
			beforeEach(() => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockResolvedValue(
					'code . && echo Starting... && pnpm dev'
				)
			})

			it('should launch all components when all are enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: true,
					enableDevServer: true,
					enableTerminal: false,
				})

				// Should launch VSCode
				expect(vscode.openVSCodeWindow).toHaveBeenCalledWith(baseOptions.worktreePath)

				// Should launch multiple terminals (not individual Claude/terminal calls)
				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should handle PR workflow type', async () => {
				await launcher.launchLoom({
					...baseOptions,
					workflowType: 'pr',
					enableTerminal: false,
				})

				// Multiple terminals should be launched (not individual Claude call)
				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
			})

			it('should handle regular workflow type', async () => {
				await launcher.launchLoom({
					...baseOptions,
					workflowType: 'regular',
					enableTerminal: false,
				})

				// Multiple terminals should be launched (not individual Claude call)
				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
			})
		})

		describe('individual components', () => {
			it('should launch only Claude when only Claude enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: false,
					enableTerminal: false,
				})

				expect(mockClaudeContext.launchWithContext).toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should launch only VSCode when only Code enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: true,
					enableDevServer: false,
					enableTerminal: false,
				})

				expect(vscode.openVSCodeWindow).toHaveBeenCalledWith(baseOptions.worktreePath)
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should launch only dev server terminal when only DevServer enabled', async () => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockResolvedValue(
					'code . && echo Starting... && pnpm dev'
				)

				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
				})

				expect(terminal.openTerminalWindow).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
			})

			it('should launch nothing when all components disabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: false,
					enableTerminal: false,
				})

				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})
		})

		describe('component combinations', () => {
			beforeEach(() => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockResolvedValue(
					'code . && echo Starting... && pnpm dev'
				)
			})

			it('should launch Claude + VSCode when both enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: true,
					enableDevServer: false,
					enableTerminal: false,
				})

				expect(mockClaudeContext.launchWithContext).toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).toHaveBeenCalledWith(baseOptions.worktreePath)
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should launch Claude + DevServer when both enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
				})

				// Should use multiple terminal windows
				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
				expect(vscode.openVSCodeWindow).not.toHaveBeenCalled()
			})

			it('should launch VSCode + DevServer when both enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: true,
					enableDevServer: true,
					enableTerminal: false,
				})

				expect(vscode.openVSCodeWindow).toHaveBeenCalled()
				expect(terminal.openTerminalWindow).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
			})

			it('should launch multiple terminals when Claude and DevServer both enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
				})

				// Should use multiple terminal windows (single call, not sequential)
				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should not need delay when using multiple terminal windows', async () => {
				// With openMultipleTerminalWindows, all tabs are created in a single AppleScript call
				// No need for sequential timing or delays
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
				})

				// Should use multiple terminal windows (single synchronous call)
				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalled()
				expect(mockClaudeContext.launchWithContext).not.toHaveBeenCalled()
				expect(terminal.openTerminalWindow).not.toHaveBeenCalled()
			})

			it('should export PORT when project has web capability', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
					capabilities: ['web'],
				})

				const call = vi.mocked(terminal.openTerminalWindow).mock.calls[0][0]
				expect(call.includePortExport).toBe(true)
				expect(call.port).toBe(3042)
			})

			it('should apply background color to terminal', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
				})

				const call = vi.mocked(terminal.openTerminalWindow).mock.calls[0][0]
				expect(call.backgroundColor).toEqual({ r: 0.5, g: 0.3, b: 0.7 })
			})
		})

		describe('error handling', () => {
			it('should throw when platform not supported for terminal launching', async () => {
				vi.mocked(terminal.openTerminalWindow).mockRejectedValue(
					new Error('Terminal window launching not yet supported on linux')
				)

				await expect(
					launcher.launchLoom({
						...baseOptions,
						enableClaude: false,
						enableCode: false,
						enableDevServer: true,
						enableTerminal: false,
					})
				).rejects.toThrow('not yet supported on linux')
			})

			it('should throw when VSCode required but not available', async () => {
				vi.mocked(vscode.openVSCodeWindow).mockRejectedValue(
					new Error('VSCode is not available')
				)

				await expect(
					launcher.launchLoom({
						...baseOptions,
						enableClaude: false,
						enableCode: true,
						enableDevServer: false,
						enableTerminal: false,
					})
				).rejects.toThrow('VSCode is not available')
			})

			it('should throw when Claude context manager fails', async () => {
				mockClaudeContext.launchWithContext.mockRejectedValue(
					new Error('Claude CLI not found')
				)

				await expect(
					launcher.launchLoom({
						...baseOptions,
						enableClaude: true,
						enableCode: false,
						enableDevServer: false,
						enableTerminal: false,
					})
				).rejects.toThrow('Claude CLI not found')
			})

			it('should throw when dev server command generation fails', async () => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockRejectedValue(
					new Error('No package.json found')
				)

				await expect(
					launcher.launchLoom({
						...baseOptions,
						enableClaude: false,
						enableCode: false,
						enableDevServer: true,
						enableTerminal: false,
					})
				).rejects.toThrow('No package.json found')
			})
		})

		describe('terminal flag combinations', () => {
			beforeEach(() => {
				vi.mocked(devServer.getDevServerLaunchCommand).mockResolvedValue('pnpm dev')
			})

			it('should launch 3 tabs when Claude + DevServer + Terminal all enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: true,
				})

				// Should launch 3 terminals as tabs
				const call = vi.mocked(terminal.openMultipleTerminalWindows).mock.calls[0][0]
				expect(call).toHaveLength(3)
				expect(call[0]).toMatchObject({
					title: 'Dev Server - Issue #42',
					command: 'pnpm dev',
				})
				expect(call[1]).toMatchObject({
					title: 'Terminal - Issue #42',
				})
				// Terminal tab should NOT have a command field
				expect(call[1].command).toBeUndefined()
				expect(call[2]).toMatchObject({
					title: 'Claude - Issue #42',
					command: 'il ignite',
				})
			})

			it('should launch 2 tabs when DevServer + Terminal enabled (no Claude)', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: true,
				})

				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({ title: 'Dev Server - Issue #42' }),
						expect.objectContaining({ title: 'Terminal - Issue #42' }),
					])
				)
			})

			it('should launch 2 tabs when Claude + Terminal enabled (no DevServer)', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: false,
					enableTerminal: true,
				})

				expect(terminal.openMultipleTerminalWindows).toHaveBeenCalledWith(
					expect.arrayContaining([
						expect.objectContaining({ title: 'Claude - Issue #42' }),
						expect.objectContaining({ title: 'Terminal - Issue #42' }),
					])
				)
			})

			it('should launch single terminal when only Terminal enabled', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: false,
					enableTerminal: true,
				})

				// Single terminal should use openTerminalWindow
				expect(terminal.openTerminalWindow).toHaveBeenCalled()
				expect(terminal.openMultipleTerminalWindows).not.toHaveBeenCalled()
			})

			it('should include PORT export for web projects in terminal tab', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: false,
					enableCode: false,
					enableDevServer: false,
					enableTerminal: true,
					capabilities: ['web'],
				})

				const call = vi.mocked(terminal.openTerminalWindow).mock.calls[0][0]
				expect(call.includePortExport).toBe(true)
				expect(call.port).toBe(3042)
			})

			it('should use custom executablePath in multi-terminal mode', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
					executablePath: '/custom/path/to/cli.js',
				})

				const calls = vi.mocked(terminal.openMultipleTerminalWindows).mock.calls[0][0]
				const claudeTab = calls.find((tab: TerminalWindowOptions) => tab.title?.includes('Claude'))
				expect(claudeTab).toBeDefined()
				expect(claudeTab?.command).toContain('/custom/path/to/cli.js ignite')
			})

			it('should include setArguments in multi-terminal Claude command', async () => {
				await launcher.launchLoom({
					...baseOptions,
					enableClaude: true,
					enableCode: false,
					enableDevServer: true,
					enableTerminal: false,
					setArguments: ['foo=bar', 'baz=qux'],
				})

				const calls = vi.mocked(terminal.openMultipleTerminalWindows).mock.calls[0][0]
				const claudeTab = calls.find((tab: TerminalWindowOptions) => tab.title?.includes('Claude'))
				expect(claudeTab).toBeDefined()
				expect(claudeTab?.command).toContain('--set foo=bar')
				expect(claudeTab?.command).toContain('--set baz=qux')
			})
		})
	})
})
