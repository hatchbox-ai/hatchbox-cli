import { readFile } from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { logger } from '../utils/logger.js'

/**
 * Zod schema for agent settings
 */
export const AgentSettingsSchema = z.object({
	model: z
		.enum(['sonnet', 'opus', 'haiku'])
		.optional()
		.describe('Claude model shorthand: sonnet, opus, or haiku'),
	// Future: could add other per-agent overrides
})

/**
 * Zod schema for workflow permission configuration
 */
export const WorkflowPermissionSchema = z.object({
	permissionMode: z
		.enum(['plan', 'acceptEdits', 'bypassPermissions', 'default'])
		.optional()
		.describe('Permission mode for Claude CLI in this workflow type'),
	noVerify: z
		.boolean()
		.optional()
		.describe('Skip pre-commit hooks (--no-verify) when committing during finish workflow'),
	startIde: z
		.boolean()
		.default(true)
		.describe('Launch IDE (code) when starting this workflow type'),
	startDevServer: z
		.boolean()
		.default(true)
		.describe('Launch development server when starting this workflow type'),
	startAiAgent: z
		.boolean()
		.default(true)
		.describe('Launch Claude AI agent when starting this workflow type'),
})

/**
 * Zod schema for workflows settings
 */
export const WorkflowsSettingsSchema = z
	.object({
		issue: WorkflowPermissionSchema.optional(),
		pr: WorkflowPermissionSchema.optional(),
		regular: WorkflowPermissionSchema.optional(),
	})
	.optional()

/**
 * Zod schema for capabilities settings
 */
export const CapabilitiesSettingsSchema = z
	.object({
		web: z
			.object({
				basePort: z
					.number()
					.min(1, 'Base port must be >= 1')
					.max(65535, 'Base port must be <= 65535')
					.optional()
					.describe('Base port for web workspace port calculations (default: 3000)'),
			})
			.optional(),
	})
	.optional()

/**
 * Zod schema for Hatchbox settings
 */
export const HatchboxSettingsSchema = z.object({
	mainBranch: z
		.string()
		.min(1, "Settings 'mainBranch' cannot be empty")
		.optional()
		.describe('Name of the main/primary branch for the repository'),
	worktreePrefix: z
		.string()
		.optional()
		.refine(
			(val) => {
				if (val === undefined) return true // undefined = use default calculation
				if (val === '') return true // empty string = no prefix mode

				// Allowlist: only alphanumeric, hyphens, underscores, and forward slashes
				const allowedChars = /^[a-zA-Z0-9\-_/]+$/
				if (!allowedChars.test(val)) return false

				// Reject if only special characters (no alphanumeric content)
				if (/^[-_/]+$/.test(val)) return false

				// Check each segment (split by /) contains at least one alphanumeric character
				const segments = val.split('/')
				for (const segment of segments) {
					if (segment && /^[-_]+$/.test(segment)) {
						// Segment exists but contains only hyphens/underscores
						return false
					}
				}

				return true
			},
			{
				message:
					"worktreePrefix contains invalid characters. Only alphanumeric characters, hyphens (-), underscores (_), and forward slashes (/) are allowed. Use forward slashes for nested directories.",
			},
		)
		.describe(
			'Prefix for worktree directories. Empty string disables prefix. Defaults to <repo-name>-hatchboxes if not set.',
		),
	protectedBranches: z
		.array(z.string().min(1, 'Protected branch name cannot be empty'))
		.optional()
		.describe('List of branches that cannot be deleted (defaults to [mainBranch, "main", "master", "develop"])'),
	workflows: WorkflowsSettingsSchema.describe('Per-workflow-type permission configurations'),
	agents: z
		.record(z.string(), AgentSettingsSchema)
		.optional()
		.nullable()
		.describe('Per-agent configuration overrides'),
	capabilities: CapabilitiesSettingsSchema.describe('Project capability configurations'),
})

/**
 * TypeScript type for agent settings derived from Zod schema
 */
export type AgentSettings = z.infer<typeof AgentSettingsSchema>

/**
 * TypeScript type for workflow permission configuration derived from Zod schema
 */
export type WorkflowPermission = z.infer<typeof WorkflowPermissionSchema>

/**
 * TypeScript type for workflows settings derived from Zod schema
 */
export type WorkflowsSettings = z.infer<typeof WorkflowsSettingsSchema>

/**
 * TypeScript type for capabilities settings derived from Zod schema
 */
export type CapabilitiesSettings = z.infer<typeof CapabilitiesSettingsSchema>

/**
 * TypeScript type for Hatchbox settings derived from Zod schema
 */
export type HatchboxSettings = z.infer<typeof HatchboxSettingsSchema>

/**
 * Manages project-level settings from .hatchbox/settings.json
 */
export class SettingsManager {
	/**
	 * Load settings from <PROJECT_ROOT>/.hatchbox/settings.json and settings.local.json
	 * Merges settings.local.json over settings.json with priority
	 * CLI overrides have highest priority if provided
	 * Returns empty object if both files don't exist (not an error)
	 */
	async loadSettings(
		projectRoot?: string,
		cliOverrides?: Partial<HatchboxSettings>,
	): Promise<HatchboxSettings> {
		const root = this.getProjectRoot(projectRoot)

		// Load base settings from settings.json
		const baseSettings = await this.loadSettingsFile(root, 'settings.json')

		// Load local overrides from settings.local.json
		const localSettings = await this.loadSettingsFile(root, 'settings.local.json')

		// Deep merge with priority: cliOverrides > localSettings > baseSettings
		let merged = this.mergeSettings(baseSettings, localSettings)

		if (cliOverrides && Object.keys(cliOverrides).length > 0) {
			logger.debug('Applying CLI overrides:', cliOverrides)
			merged = this.mergeSettings(merged, cliOverrides)
		}

		// Validate merged result
		try {
			return HatchboxSettingsSchema.parse(merged)
		} catch (error) {
			// Show all Zod validation errors
			if (error instanceof z.ZodError) {
				const errorMsg = this.formatAllZodErrors(error, '<merged settings>')
				// Enhance error message if CLI overrides were applied
				if (cliOverrides && Object.keys(cliOverrides).length > 0) {
					throw new Error(`${errorMsg.message}\n\nNote: CLI overrides were applied. Check your --set arguments.`)
				}
				throw errorMsg
			}
			throw error
		}
	}

	/**
	 * Load and parse a single settings file
	 * Returns empty object if file doesn't exist (not an error)
	 */
	private async loadSettingsFile(
		projectRoot: string,
		filename: string,
	): Promise<Partial<HatchboxSettings>> {
		const settingsPath = path.join(projectRoot, '.hatchbox', filename)

		try {
			const content = await readFile(settingsPath, 'utf-8')
			let parsed: unknown

			try {
				parsed = JSON.parse(content)
			} catch (error) {
				throw new Error(
					`Failed to parse settings file at ${settingsPath}: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
				)
			}

			// Basic validation: ensure parsed content is an object
			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				throw new Error(
					`Settings validation failed at ${settingsPath}:\n  - root: Expected object, received ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
				)
			}

			// Return parsed content (detailed validation happens after merge)
			return parsed as Partial<HatchboxSettings>
		} catch (error) {
			// File not found is not an error - return empty settings
			if ((error as { code?: string }).code === 'ENOENT') {
				logger.debug(`No settings file found at ${settingsPath}, using defaults`)
				return {}
			}

			// Re-throw parsing errors
			throw error
		}
	}

	/**
	 * Deep merge two settings objects with priority to override
	 * Arrays are replaced, not concatenated
	 */
	private mergeSettings(
		base: Partial<HatchboxSettings>,
		override: Partial<HatchboxSettings>,
	): HatchboxSettings {
		// Start with base settings
		const merged = { ...base }

		// Merge top-level primitive fields
		if (override.mainBranch !== undefined) {
			merged.mainBranch = override.mainBranch
		}
		if (override.worktreePrefix !== undefined) {
			merged.worktreePrefix = override.worktreePrefix
		}
		if (override.protectedBranches !== undefined) {
			merged.protectedBranches = override.protectedBranches
		}

		// Deep merge workflows
		if (override.workflows !== undefined) {
			merged.workflows = {
				...base.workflows,
				...override.workflows,
				issue:
					override.workflows.issue !== undefined
						? { ...base.workflows?.issue, ...override.workflows.issue }
						: base.workflows?.issue,
				pr:
					override.workflows.pr !== undefined
						? { ...base.workflows?.pr, ...override.workflows.pr }
						: base.workflows?.pr,
				regular:
					override.workflows.regular !== undefined
						? { ...base.workflows?.regular, ...override.workflows.regular }
						: base.workflows?.regular,
			}
		}

		// Deep merge agents
		if (override.agents !== undefined) {
			merged.agents = { ...base.agents, ...override.agents }
		}

		// Deep merge capabilities
		if (override.capabilities !== undefined) {
			merged.capabilities = {
				...base.capabilities,
				...override.capabilities,
				web:
					override.capabilities.web !== undefined
						? { ...base.capabilities?.web, ...override.capabilities.web }
						: base.capabilities?.web,
			}
		}

		return merged as HatchboxSettings
	}

	/**
	 * Format all Zod validation errors into a single error message
	 */
	private formatAllZodErrors(error: z.ZodError, settingsPath: string): Error {
		const errorMessages = error.issues.map(issue => {
			const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
			return `  - ${path}: ${issue.message}`
		})

		return new Error(
			`Settings validation failed at ${settingsPath}:\n${errorMessages.join('\n')}`,
		)
	}

	/**
	 * Validate settings structure and model names using Zod schema
	 * This method is kept for testing purposes but uses Zod internally
	 * @internal - Only used in tests via bracket notation
	 */
	// @ts-expect-error - Used in tests via bracket notation, TypeScript can't detect this usage
	private validateSettings(settings: HatchboxSettings): void {
		try {
			HatchboxSettingsSchema.parse(settings)
		} catch (error) {
			if (error instanceof z.ZodError) {
				throw this.formatAllZodErrors(error, '<validation>')
			}
			throw error
		}
	}

	/**
	 * Get project root (defaults to process.cwd())
	 */
	private getProjectRoot(projectRoot?: string): string {
		return projectRoot ?? process.cwd()
	}

	/**
	 * Get effective protected branches list with mainBranch always included
	 *
	 * This method provides a single source of truth for protected branches logic:
	 * 1. Use configured protectedBranches if provided
	 * 2. Otherwise use defaults: [mainBranch, 'main', 'master', 'develop']
	 * 3. ALWAYS ensure mainBranch is included even if user configured custom list
	 *
	 * @param projectRoot - Optional project root directory (defaults to process.cwd())
	 * @returns Array of protected branch names with mainBranch guaranteed to be included
	 */
	async getProtectedBranches(projectRoot?: string): Promise<string[]> {
		const settings = await this.loadSettings(projectRoot)
		const mainBranch = settings.mainBranch ?? 'main'

		// Build protected branches list:
		// 1. Use configured protectedBranches if provided
		// 2. Otherwise use defaults: [mainBranch, 'main', 'master', 'develop']
		// 3. ALWAYS ensure mainBranch is included even if user configured custom list
		let protectedBranches: string[]
		if (settings.protectedBranches) {
			// Use configured list but ensure mainBranch is always included
			protectedBranches = settings.protectedBranches.includes(mainBranch)
				? settings.protectedBranches
				: [mainBranch, ...settings.protectedBranches]
		} else {
			// Use defaults with current mainBranch
			protectedBranches = [mainBranch, 'main', 'master', 'develop']
		}

		return protectedBranches
	}
}
