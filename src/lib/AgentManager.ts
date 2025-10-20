import { readFile } from 'fs/promises'
import { accessSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { MarkdownAgentParser } from '../utils/MarkdownAgentParser.js'
import { logger } from '../utils/logger.js'

// Agent schema interface
export interface AgentConfig {
	description: string
	prompt: string
	tools: string[]
	model: string
	color?: string
}

// Container for all loaded agents (keyed by agent name without extension)
export interface AgentConfigs {
	[agentName: string]: AgentConfig
}

export class AgentManager {
	private agentDir: string

	constructor(agentDir?: string) {
		if (agentDir) {
			this.agentDir = agentDir
		} else {
			// Find agents relative to package installation
			// Same pattern as PromptTemplateManager
			// When running from dist/, agents are copied to dist/agents/
			const currentFileUrl = import.meta.url
			const currentFilePath = fileURLToPath(currentFileUrl)
			const distDir = path.dirname(currentFilePath)

			// Walk up to find the agents directory
			let agentDirPath = path.join(distDir, 'agents')
			let currentDir = distDir

			while (currentDir !== path.dirname(currentDir)) {
				const candidatePath = path.join(currentDir, 'agents')
				try {
					accessSync(candidatePath)
					agentDirPath = candidatePath
					break
				} catch {
					currentDir = path.dirname(currentDir)
				}
			}

			this.agentDir = agentDirPath
			logger.debug('AgentManager initialized', { agentDir: this.agentDir })
		}
	}

	/**
	 * Load all agent configuration files from markdown (.md) format
	 * Throws error if agents directory doesn't exist or files are malformed
	 */
	async loadAgents(): Promise<AgentConfigs> {
		// Load all .md files from the agents directory
		const { readdir } = await import('fs/promises')
		const files = await readdir(this.agentDir)
		const agentFiles = files.filter(file => file.endsWith('.md'))

		const agents: AgentConfigs = {}

		for (const filename of agentFiles) {
			const agentPath = path.join(this.agentDir, filename)

			try {
				const content = await readFile(agentPath, 'utf-8')

				// Parse markdown with frontmatter
				const parsed = this.parseMarkdownAgent(content, filename)
				const agentConfig = parsed.config
				const agentName = parsed.name

				// Validate required fields
				this.validateAgentConfig(agentConfig, agentName)

				agents[agentName] = agentConfig
				logger.debug(`Loaded agent: ${agentName}`)
			} catch (error) {
				logger.error(`Failed to load agent from ${filename}`, { error })
				throw new Error(
					`Failed to load agent from ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`,
				)
			}
		}

		return agents
	}

	/**
	 * Validate agent configuration has required fields
	 */
	private validateAgentConfig(config: AgentConfig, agentName: string): void {
		const requiredFields: (keyof AgentConfig)[] = ['description', 'prompt', 'tools', 'model']

		for (const field of requiredFields) {
			if (!config[field]) {
				throw new Error(`Agent ${agentName} missing required field: ${field}`)
			}
		}

		if (!Array.isArray(config.tools)) {
			throw new Error(`Agent ${agentName} tools must be an array`)
		}
	}

	/**
	 * Parse markdown agent file with YAML frontmatter
	 * @param content - Raw markdown file content
	 * @param filename - Original filename for error messages
	 * @returns Parsed agent config and name
	 */
	private parseMarkdownAgent(content: string, filename: string): { config: AgentConfig; name: string } {
		try {
			// Parse frontmatter using custom parser
			const { data, content: markdownBody } = MarkdownAgentParser.parse(content)

			// Validate frontmatter has required fields
			if (!data.name) {
				throw new Error('Missing required field: name')
			}
			if (!data.description) {
				throw new Error('Missing required field: description')
			}
			if (!data.tools) {
				throw new Error('Missing required field: tools')
			}
			if (!data.model) {
				throw new Error('Missing required field: model')
			}

			// Parse tools from comma-separated string to array
			const tools = data.tools
				.split(',')
				.map((tool: string) => tool.trim())
				.filter((tool: string) => tool.length > 0)

			// Validate model and warn if non-standard
			const validModels = ['sonnet', 'opus', 'haiku']
			if (!validModels.includes(data.model)) {
				logger.warn(
					`Agent ${data.name} uses model "${data.model}" which may not be recognized by Claude CLI, and your workflow may fail or produce unexpected results. ` +
						`Valid values are: ${validModels.join(', ')}`
				)
			}

			// Construct AgentConfig
			const config: AgentConfig = {
				description: data.description,
				prompt: markdownBody.trim(),
				tools,
				model: data.model,
				...(data.color && { color: data.color }),
			}

			return { config, name: data.name }
		} catch (error) {
			throw new Error(
				`Failed to parse markdown agent ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Format loaded agents for Claude CLI --agents flag
	 * Returns object suitable for JSON.stringify
	 */
	formatForCli(agents: AgentConfigs): Record<string, unknown> {
		// The agents object is already in the correct format
		// Just return it - launchClaude will JSON.stringify it
		return agents as Record<string, unknown>
	}
}
