import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SettingsManager } from './SettingsManager.js'
import { readFile } from 'fs/promises'

// Mock fs/promises
vi.mock('fs/promises')
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('SettingsManager', () => {
	let settingsManager: SettingsManager

	beforeEach(() => {
		settingsManager = new SettingsManager()
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('loadSettings', () => {
		it('should load and parse valid settings.json file', async () => {
			const projectRoot = '/test/project'
			const validSettings = {
				agents: {
					'hatchbox-issue-analyzer': {
						model: 'sonnet',
					},
					'hatchbox-issue-planner': {
						model: 'opus',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validSettings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual(validSettings)
		})

		it('should return empty object when settings file does not exist', async () => {
			const projectRoot = '/test/project'
			const error: { code?: string; message: string } = {
				code: 'ENOENT',
				message: 'ENOENT: no such file or directory',
			}
			vi.mocked(readFile).mockRejectedValueOnce(error)

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual({})
		})

		it('should return empty object when .hatchbox directory does not exist', async () => {
			const projectRoot = '/test/project'
			const error: { code?: string; message: string } = {
				code: 'ENOENT',
				message: 'ENOENT: no such file or directory',
			}
			vi.mocked(readFile).mockRejectedValueOnce(error)

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual({})
		})

		it('should throw error for malformed JSON in settings file', async () => {
			const projectRoot = '/test/project'

			vi.mocked(readFile).mockResolvedValueOnce('invalid json {')

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Failed to parse settings file/,
			)
		})

		it('should throw error for invalid settings structure (not an object)', async () => {
			const projectRoot = '/test/project'

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify('not an object'))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*Expected object, received string/,
			)
		})

		it('should handle settings file with empty agents object', async () => {
			const projectRoot = '/test/project'
			const emptyAgentsSettings = {
				agents: {},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(emptyAgentsSettings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual(emptyAgentsSettings)
		})

		it('should handle settings file with null agents value', async () => {
			const projectRoot = '/test/project'
			const nullAgentsSettings = {
				agents: null,
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(nullAgentsSettings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result).toEqual(nullAgentsSettings)
		})

		it('should use process.cwd() when projectRoot not provided', async () => {
			const validSettings = {
				agents: {
					'test-agent': {
						model: 'haiku',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(validSettings))

			const result = await settingsManager.loadSettings()
			expect(result).toEqual(validSettings)
		})

		it('should load settings with mainBranch field', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'develop',
				agents: {},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.mainBranch).toBe('develop')
		})
	})

	describe('validateSettings', () => {
		describe('mainBranch setting validation', () => {
			it('should accept valid mainBranch string setting', () => {
				const settings = {
					mainBranch: 'develop',
				}
				// Should not throw
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})

			it('should accept "main" as mainBranch', () => {
				const settings = {
					mainBranch: 'main',
				}
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})

			it('should accept "master" as mainBranch', () => {
				const settings = {
					mainBranch: 'master',
				}
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})

			it('should throw error when mainBranch is not a string', () => {
				const settings = {
					mainBranch: 123,
				}
				expect(() =>
					settingsManager['validateSettings'](settings as never),
				).toThrow(/mainBranch.*Expected string, received number/)
			})

			it('should throw error when mainBranch is empty string', () => {
				const settings = {
					mainBranch: '',
				}
				expect(() => settingsManager['validateSettings'](settings)).toThrow(
					/mainBranch.*cannot be empty/i,
				)
			})

			it('should accept settings with both mainBranch and agents', () => {
				const settings = {
					mainBranch: 'develop',
					agents: {
						'test-agent': {
							model: 'sonnet',
						},
					},
				}
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})
		})

		it('should accept valid settings with all agents configured', () => {
			const validSettings = {
				agents: {
					'hatchbox-issue-analyzer': {
						model: 'sonnet',
					},
					'hatchbox-issue-planner': {
						model: 'opus',
					},
					'hatchbox-issue-implementer': {
						model: 'haiku',
					},
				},
			}

			// Should not throw
			expect(() => settingsManager['validateSettings'](validSettings)).not.toThrow()
		})

		it('should accept valid settings with partial agent configuration', () => {
			const partialSettings = {
				agents: {
					'hatchbox-issue-implementer': {
						model: 'haiku',
					},
				},
			}

			// Should not throw
			expect(() => settingsManager['validateSettings'](partialSettings)).not.toThrow()
		})

		it('should accept valid settings with empty agents object', () => {
			const emptySettings = {
				agents: {},
			}

			// Should not throw
			expect(() => settingsManager['validateSettings'](emptySettings)).not.toThrow()
		})

		it('should throw error for invalid model names', () => {
			const invalidSettings = {
				agents: {
					'test-agent': {
						model: 'invalid-model',
					},
				},
			}

			expect(() => settingsManager['validateSettings'](invalidSettings)).toThrow(
				/Invalid enum value.*Expected 'sonnet' \| 'opus' \| 'haiku'/,
			)
		})

		it('should accept all valid shorthand model names', () => {
			const validModels = ['sonnet', 'opus', 'haiku']

			validModels.forEach(model => {
				const settings = {
					agents: {
						'test-agent': {
							model,
						},
					},
				}

				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})
		})

		it('should handle agent settings without model field', () => {
			const settingsWithoutModel = {
				agents: {
					'test-agent': {},
				},
			}

			// Should not throw - missing model is acceptable
			expect(() => settingsManager['validateSettings'](settingsWithoutModel)).not.toThrow()
		})

		it('should throw error when agents is not an object', () => {
			const invalidSettings = {
				agents: 'not an object',
			}

			expect(() =>
				settingsManager['validateSettings'](invalidSettings as never),
			).toThrow(/agents.*Expected object, received string/)
		})
	})

	describe('getProjectRoot', () => {
		it('should return process.cwd() when no projectRoot provided', () => {
			const result = settingsManager['getProjectRoot']()
			expect(result).toBe(process.cwd())
		})

		it('should return provided projectRoot when given', () => {
			const customRoot = '/custom/project/root'
			const result = settingsManager['getProjectRoot'](customRoot)
			expect(result).toBe(customRoot)
		})
	})

	describe('getSettingsPath', () => {
		it('should construct correct .hatchbox/settings.json path', () => {
			const projectRoot = '/test/project'
			const result = settingsManager['getSettingsPath'](projectRoot)
			expect(result).toBe('/test/project/.hatchbox/settings.json')
		})

		it('should handle paths with trailing slash', () => {
			const projectRoot = '/test/project/'
			const result = settingsManager['getSettingsPath'](projectRoot)
			expect(result).toBe('/test/project/.hatchbox/settings.json')
		})
	})

	describe('workflows settings validation', () => {
		it('should accept valid workflows configuration with issue and pr permission modes', () => {
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'bypassPermissions',
					},
					pr: {
						permissionMode: 'acceptEdits',
					},
				},
			}
			expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
		})

		it('should accept workflows with only issue configuration', () => {
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'plan',
					},
				},
			}
			expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
		})

		it('should accept workflows with only pr configuration', () => {
			const settings = {
				workflows: {
					pr: {
						permissionMode: 'acceptEdits',
					},
				},
			}
			expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
		})

		it('should accept all valid permission mode values: plan, acceptEdits, bypassPermissions, default', () => {
			const validModes = ['plan', 'acceptEdits', 'bypassPermissions', 'default']

			validModes.forEach(mode => {
				const settings = {
					workflows: {
						issue: {
							permissionMode: mode,
						},
					},
				}
				expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
			})
		})

		it('should throw error for invalid permission mode value', () => {
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'invalidMode',
					},
				},
			}
			expect(() =>
				settingsManager['validateSettings'](settings as never),
			).toThrow(/Invalid enum value/)
		})

		it('should throw error when permissionMode is not a string', () => {
			const settings = {
				workflows: {
					issue: {
						permissionMode: 123,
					},
				},
			}
			expect(() =>
				settingsManager['validateSettings'](settings as never),
			).toThrow(/received number/)
		})

		it('should accept settings with workflows, mainBranch, and agents combined', () => {
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'bypassPermissions',
					},
				},
				mainBranch: 'develop',
				agents: {
					'test-agent': {
						model: 'sonnet',
					},
				},
			}
			expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
		})

		it('should accept empty workflows object', () => {
			const settings = {
				workflows: {},
			}
			expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
		})

		it('should accept regular workflow permission mode configuration', () => {
			const settings = {
				workflows: {
					regular: {
						permissionMode: 'plan',
					},
				},
			}
			expect(() => settingsManager['validateSettings'](settings)).not.toThrow()
		})
	})

	describe('workflows.{type}.noVerify configuration', () => {
		it('should accept valid noVerify boolean in workflows.issue', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'plan',
						noVerify: true,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.noVerify).toBe(true)
		})

		it('should accept valid noVerify boolean in workflows.pr', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					pr: {
						permissionMode: 'acceptEdits',
						noVerify: false,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.pr?.noVerify).toBe(false)
		})

		it('should accept missing noVerify field (defaults to undefined)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'plan',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.noVerify).toBeUndefined()
		})

		it('should reject invalid noVerify types (non-boolean)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'plan',
						noVerify: 'true', // String instead of boolean
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*workflows\.issue\.noVerify[\s\S]*Expected boolean, received string/,
			)
		})

		it('should handle multiple workflow types with different noVerify settings', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'plan',
						noVerify: true,
					},
					pr: {
						permissionMode: 'acceptEdits',
						noVerify: false,
					},
					regular: {
						permissionMode: 'bypassPermissions',
						noVerify: true,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.noVerify).toBe(true)
			expect(result.workflows?.pr?.noVerify).toBe(false)
			expect(result.workflows?.regular?.noVerify).toBe(true)
		})
	})

	describe('loadSettings with workflows', () => {
		it('should load settings with workflows configuration correctly', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'bypassPermissions',
					},
					pr: {
						permissionMode: 'acceptEdits',
					},
				},
				mainBranch: 'develop',
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.permissionMode).toBe('bypassPermissions')
			expect(result.workflows?.issue?.startIde).toBe(true) // Zod default
			expect(result.workflows?.issue?.startDevServer).toBe(true) // Zod default
			expect(result.workflows?.issue?.startAiAgent).toBe(true) // Zod default
			expect(result.workflows?.pr?.permissionMode).toBe('acceptEdits')
			expect(result.workflows?.pr?.startIde).toBe(true) // Zod default
			expect(result.workflows?.pr?.startDevServer).toBe(true) // Zod default
			expect(result.workflows?.pr?.startAiAgent).toBe(true) // Zod default
			expect(result.mainBranch).toBe('develop')
		})

		it('should handle settings with partial workflows (issue only)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'plan',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.permissionMode).toBe('plan')
			expect(result.workflows?.pr).toBeUndefined()
		})

		it('should handle settings with partial workflows (pr only)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					pr: {
						permissionMode: 'acceptEdits',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.pr?.permissionMode).toBe('acceptEdits')
			expect(result.workflows?.issue).toBeUndefined()
		})
	})

	describe('capabilities.web.basePort configuration', () => {
		it('should accept valid basePort value (8080)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: 8080,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.capabilities?.web?.basePort).toBe(8080)
		})

		it('should accept valid basePort value (3000)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: 3000,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.capabilities?.web?.basePort).toBe(3000)
		})

		it('should accept valid basePort value (65535 - maximum)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: 65535,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.capabilities?.web?.basePort).toBe(65535)
		})

		it('should accept valid basePort value (1 - minimum)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: 1,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.capabilities?.web?.basePort).toBe(1)
		})

		it('should accept valid basePort value (80 - well-known port)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: 80,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.capabilities?.web?.basePort).toBe(80)
		})

		it('should reject basePort < 1', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: 0,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*capabilities\.web\.basePort[\s\S]*Base port must be >= 1/,
			)
		})

		it('should reject basePort > 65535', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: 65536,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*capabilities\.web\.basePort[\s\S]*Base port must be <= 65535/,
			)
		})

		it('should reject basePort that is not a number', async () => {
			const projectRoot = '/test/project'
			const settings = {
				capabilities: {
					web: {
						basePort: '8080',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*capabilities\.web\.basePort[\s\S]*Expected number, received string/,
			)
		})

		it('should accept missing capabilities.web.basePort (uses default)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'main',
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.capabilities?.web?.basePort).toBeUndefined()
		})

		it('should accept missing capabilities object entirely', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'main',
				agents: {},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.capabilities).toBeUndefined()
		})

		it('should preserve other settings when basePort is added', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'develop',
				workflows: {
					issue: {
						permissionMode: 'bypassPermissions',
					},
				},
				agents: {
					'test-agent': {
						model: 'sonnet',
					},
				},
				capabilities: {
					web: {
						basePort: 8080,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.mainBranch).toBe('develop')
			expect(result.workflows?.issue?.permissionMode).toBe('bypassPermissions')
			expect(result.agents?.['test-agent']?.model).toBe('sonnet')
			expect(result.capabilities?.web?.basePort).toBe(8080)
		})
	})

	describe('WorkflowPermissionSchema - Component Launch Configuration', () => {
		it('should validate workflow config with all component flags enabled', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						startIde: true,
						startDevServer: true,
						startAiAgent: true,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.startIde).toBe(true)
			expect(result.workflows?.issue?.startDevServer).toBe(true)
			expect(result.workflows?.issue?.startAiAgent).toBe(true)
		})

		it('should validate workflow config with all component flags disabled', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						startIde: false,
						startDevServer: false,
						startAiAgent: false,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.startIde).toBe(false)
			expect(result.workflows?.issue?.startDevServer).toBe(false)
			expect(result.workflows?.issue?.startAiAgent).toBe(false)
		})

		it('should validate workflow config with mixed component flags', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						startIde: true,
						startDevServer: false,
						startAiAgent: true,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.startIde).toBe(true)
			expect(result.workflows?.issue?.startDevServer).toBe(false)
			expect(result.workflows?.issue?.startAiAgent).toBe(true)
		})

		it('should apply default true to component flags when not specified', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'plan',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.startIde).toBe(true)
			expect(result.workflows?.issue?.startDevServer).toBe(true)
			expect(result.workflows?.issue?.startAiAgent).toBe(true)
		})

		it('should accept different workflow types (issue, pr, regular) with component configs', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						startIde: true,
						startDevServer: false,
						startAiAgent: true,
					},
					pr: {
						startIde: false,
						startDevServer: true,
						startAiAgent: false,
					},
					regular: {
						startIde: true,
						startDevServer: true,
						startAiAgent: false,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.startIde).toBe(true)
			expect(result.workflows?.issue?.startDevServer).toBe(false)
			expect(result.workflows?.issue?.startAiAgent).toBe(true)
			expect(result.workflows?.pr?.startIde).toBe(false)
			expect(result.workflows?.pr?.startDevServer).toBe(true)
			expect(result.workflows?.pr?.startAiAgent).toBe(false)
			expect(result.workflows?.regular?.startIde).toBe(true)
			expect(result.workflows?.regular?.startDevServer).toBe(true)
			expect(result.workflows?.regular?.startAiAgent).toBe(false)
		})

		it('should reject invalid types for component launch flags (non-boolean)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						startIde: 'yes',
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*workflows\.issue\.startIde[\s\S]*Expected boolean, received string/,
			)
		})

		it('should reject invalid startDevServer type (number)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						startDevServer: 1,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*workflows\.issue\.startDevServer[\s\S]*Expected boolean, received number/,
			)
		})

		it('should reject invalid startAiAgent type (null)', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						startAiAgent: null,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			await expect(settingsManager.loadSettings(projectRoot)).rejects.toThrow(
				/Settings validation failed[\s\S]*workflows\.issue\.startAiAgent[\s\S]*Expected boolean/,
			)
		})

		it('should accept component flags alongside existing workflow settings', async () => {
			const projectRoot = '/test/project'
			const settings = {
				workflows: {
					issue: {
						permissionMode: 'bypassPermissions',
						noVerify: true,
						startIde: false,
						startDevServer: true,
						startAiAgent: false,
					},
				},
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.loadSettings(projectRoot)
			expect(result.workflows?.issue?.permissionMode).toBe('bypassPermissions')
			expect(result.workflows?.issue?.noVerify).toBe(true)
			expect(result.workflows?.issue?.startIde).toBe(false)
			expect(result.workflows?.issue?.startDevServer).toBe(true)
			expect(result.workflows?.issue?.startAiAgent).toBe(false)
		})
	})

	describe('getProtectedBranches', () => {
		it('should return default protected branches when no settings configured', async () => {
			const projectRoot = '/test/project'
			// Return empty settings (ENOENT)
			const error: { code?: string; message: string } = {
				code: 'ENOENT',
				message: 'ENOENT: no such file or directory',
			}
			vi.mocked(readFile).mockRejectedValueOnce(error)

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should return defaults with 'main' as default mainBranch
			expect(result).toEqual(['main', 'main', 'master', 'develop'])
		})

		it('should return default protected branches with custom mainBranch', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'develop',
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should return defaults with 'develop' as mainBranch
			expect(result).toEqual(['develop', 'main', 'master', 'develop'])
		})

		it('should use configured protectedBranches and ensure mainBranch is included', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'main',
				protectedBranches: ['production', 'staging'],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should prepend mainBranch to configured list
			expect(result).toEqual(['main', 'production', 'staging'])
		})

		it('should not duplicate mainBranch if already in protectedBranches', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'main',
				protectedBranches: ['main', 'production', 'staging'],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should use configured list as-is since mainBranch is already included
			expect(result).toEqual(['main', 'production', 'staging'])
		})

		it('should add custom mainBranch to configured protectedBranches if not present', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'develop',
				protectedBranches: ['main', 'master', 'production'],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should prepend 'develop' to configured list
			expect(result).toEqual(['develop', 'main', 'master', 'production'])
		})

		it('should handle empty protectedBranches array', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'main',
				protectedBranches: [],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should add mainBranch to empty configured list
			expect(result).toEqual(['main'])
		})

		it('should use process.cwd() when projectRoot not provided', async () => {
			const settings = {
				mainBranch: 'main',
				protectedBranches: ['production'],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches()

			// Should work without explicit projectRoot
			expect(result).toEqual(['main', 'production'])
		})

		it('should handle master as mainBranch with configured protectedBranches', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'master',
				protectedBranches: ['main', 'develop'],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should prepend 'master' to configured list
			expect(result).toEqual(['master', 'main', 'develop'])
		})

		it('should handle mainBranch already in middle of protectedBranches list', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'main',
				protectedBranches: ['production', 'main', 'staging'],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should use configured list as-is since mainBranch is already included
			expect(result).toEqual(['production', 'main', 'staging'])
		})

		it('should handle mainBranch at end of protectedBranches list', async () => {
			const projectRoot = '/test/project'
			const settings = {
				mainBranch: 'main',
				protectedBranches: ['production', 'staging', 'main'],
			}

			vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify(settings))

			const result = await settingsManager.getProtectedBranches(projectRoot)

			// Should use configured list as-is since mainBranch is already included
			expect(result).toEqual(['production', 'staging', 'main'])
		})
	})
})
