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
	 * Load settings from <PROJECT_ROOT>/.hatchbox/settings.json
	 * Returns empty object if file doesn't exist (not an error)
	 */
	async loadSettings(projectRoot?: string): Promise<HatchboxSettings> {
		const root = this.getProjectRoot(projectRoot)
		const settingsPath = this.getSettingsPath(root)

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

			// Validate with Zod schema
			try {
				return HatchboxSettingsSchema.parse(parsed)
			} catch (error) {
				// Show all Zod validation errors
				if (error instanceof z.ZodError) {
					throw this.formatAllZodErrors(error, settingsPath)
				}
				throw error
			}
		} catch (error) {
			// File not found is not an error - return empty settings
			if ((error as { code?: string }).code === 'ENOENT') {
				logger.debug(`No settings file found at ${settingsPath}, using defaults`)
				return {}
			}

			// Re-throw validation or parsing errors
			throw error
		}
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
	 * Get settings file path
	 */
	private getSettingsPath(projectRoot: string): string {
		return path.join(projectRoot, '.hatchbox', 'settings.json')
	}
}
