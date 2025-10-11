import { readFile } from 'fs/promises'
import { accessSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'

export interface TemplateVariables {
	ISSUE_NUMBER?: number
	PR_NUMBER?: number
	ISSUE_TITLE?: string
	PR_TITLE?: string
	WORKSPACE_PATH?: string
	PORT?: number
}

export class PromptTemplateManager {
	private templateDir: string

	constructor(templateDir?: string) {
		if (templateDir) {
			this.templateDir = templateDir
		} else {
			// Find templates relative to the package installation
			// When running from dist/, templates are copied to dist/prompts/
			const currentFileUrl = import.meta.url
			const currentFilePath = fileURLToPath(currentFileUrl)
			const distDir = path.dirname(currentFilePath) // dist directory (may be chunked file location)

			// Walk up to find the dist directory (in case of chunked files)
			let templateDir = path.join(distDir, 'prompts')
			let currentDir = distDir

			// Try to find the prompts directory by walking up
			while (currentDir !== path.dirname(currentDir)) {
				const candidatePath = path.join(currentDir, 'prompts')
				try {
					// Check if this directory exists (sync check for constructor)
					accessSync(candidatePath)
					templateDir = candidatePath
					break
				} catch {
					currentDir = path.dirname(currentDir)
				}
			}

			this.templateDir = templateDir
			logger.debug('PromptTemplateManager initialized', {
				currentFilePath,
				distDir,
				templateDir: this.templateDir
			})
		}
	}

	/**
	 * Load a template file by name
	 */
	async loadTemplate(templateName: 'issue' | 'pr' | 'regular'): Promise<string> {
		const templatePath = path.join(this.templateDir, `${templateName}-prompt.txt`)

		logger.debug('Loading template', {
			templateName,
			templateDir: this.templateDir,
			templatePath
		})

		try {
			return await readFile(templatePath, 'utf-8')
		} catch (error) {
			logger.error('Failed to load template', { templateName, templatePath, error })
			throw new Error(`Template not found: ${templatePath}`)
		}
	}

	/**
	 * Substitute variables in a template string
	 */
	substituteVariables(template: string, variables: TemplateVariables): string {
		let result = template

		// Replace each variable if it exists
		if (variables.ISSUE_NUMBER !== undefined) {
			result = result.replace(/ISSUE_NUMBER/g, String(variables.ISSUE_NUMBER))
		}

		if (variables.PR_NUMBER !== undefined) {
			result = result.replace(/PR_NUMBER/g, String(variables.PR_NUMBER))
		}

		if (variables.ISSUE_TITLE !== undefined) {
			result = result.replace(/ISSUE_TITLE/g, variables.ISSUE_TITLE)
		}

		if (variables.PR_TITLE !== undefined) {
			result = result.replace(/PR_TITLE/g, variables.PR_TITLE)
		}

		if (variables.WORKSPACE_PATH !== undefined) {
			result = result.replace(/WORKSPACE_PATH/g, variables.WORKSPACE_PATH)
		}

		if (variables.PORT !== undefined) {
			result = result.replace(/PORT/g, String(variables.PORT))
		}

		return result
	}

	/**
	 * Get a fully processed prompt for a workflow type
	 */
	async getPrompt(
		type: 'issue' | 'pr' | 'regular',
		variables: TemplateVariables
	): Promise<string> {
		const template = await this.loadTemplate(type)
		return this.substituteVariables(template, variables)
	}
}
