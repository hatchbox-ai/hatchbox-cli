import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AgentManager, type AgentConfigs } from './AgentManager.js'
import { readFile, readdir } from 'fs/promises'

vi.mock('fs/promises')
vi.mock('../utils/logger.js', () => ({
	logger: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}))

describe('AgentManager', () => {
	let manager: AgentManager

	beforeEach(() => {
		manager = new AgentManager('templates/agents')
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('loadAgents', () => {
		it('should load all three agent markdown files successfully', async () => {
			// Mock readdir to return the agent filenames
			vi.mocked(readdir).mockResolvedValueOnce([
				'hatchbox-issue-analyzer.md',
				'hatchbox-issue-planner.md',
				'hatchbox-issue-implementer.md',
			] as string[])

			// Mock readFile to return valid markdown for each agent
			const mockAnalyzerMd = `---
name: hatchbox-issue-analyzer
description: Analyzer agent
tools: Read, Grep
model: sonnet
color: pink
---

You are an analyzer`

			const mockPlannerMd = `---
name: hatchbox-issue-planner
description: Planner agent
tools: Read, Write
model: sonnet
color: blue
---

You are a planner`

			const mockImplementerMd = `---
name: hatchbox-issue-implementer
description: Implementer agent
tools: Edit, Bash
model: sonnet
color: green
---

You are an implementer`

			vi.mocked(readFile)
				.mockResolvedValueOnce(mockAnalyzerMd)
				.mockResolvedValueOnce(mockPlannerMd)
				.mockResolvedValueOnce(mockImplementerMd)

			const result = await manager.loadAgents()

			expect(Object.keys(result)).toHaveLength(3)
			expect(result['hatchbox-issue-analyzer']).toEqual({
				description: 'Analyzer agent',
				prompt: 'You are an analyzer',
				tools: ['Read', 'Grep'],
				model: 'sonnet',
				color: 'pink',
			})
			expect(result['hatchbox-issue-planner']).toEqual({
				description: 'Planner agent',
				prompt: 'You are a planner',
				tools: ['Read', 'Write'],
				model: 'sonnet',
				color: 'blue',
			})
			expect(result['hatchbox-issue-implementer']).toEqual({
				description: 'Implementer agent',
				prompt: 'You are an implementer',
				tools: ['Edit', 'Bash'],
				model: 'sonnet',
				color: 'green',
			})
		})

		it('should handle missing agent files gracefully', async () => {
			vi.mocked(readdir).mockResolvedValueOnce([
				'hatchbox-issue-analyzer.md',
			] as string[])
			vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT: no such file'))

			await expect(manager.loadAgents()).rejects.toThrow(
				'Failed to load agent from hatchbox-issue-analyzer.md',
			)
		})

		it('should handle malformed markdown in agent files', async () => {
			vi.mocked(readdir).mockResolvedValueOnce([
				'bad-agent.md',
			] as string[])
			// Markdown without proper frontmatter delimiters
			vi.mocked(readFile).mockResolvedValueOnce('Just some text without frontmatter')

			await expect(manager.loadAgents()).rejects.toThrow(
				'Failed to load agent from bad-agent.md',
			)
		})
	})

	describe('formatForCli', () => {
		it('should format agents as object for --agents flag', () => {
			const agents: AgentConfigs = {
				'test-agent': {
					description: 'Test',
					prompt: 'Test prompt',
					tools: ['Read'],
					model: 'sonnet',
					color: 'blue',
				},
			}

			const result = manager.formatForCli(agents)

			expect(result).toEqual(agents)
			expect(typeof result).toBe('object')
		})

		it('should include color field in output', () => {
			const agents: AgentConfigs = {
				'test-agent': {
					description: 'Test',
					prompt: 'Test prompt',
					tools: ['Read'],
					model: 'sonnet',
					color: 'pink',
				},
			}

			const result = manager.formatForCli(agents)

			expect(result['test-agent']).toHaveProperty('color', 'pink')
		})

		it('should preserve tools array structure', () => {
			const agents: AgentConfigs = {
				'test-agent': {
					description: 'Test',
					prompt: 'Test prompt',
					tools: ['Read', 'Write', 'Edit'],
					model: 'sonnet',
				},
			}

			const result = manager.formatForCli(agents)

			expect(Array.isArray(result['test-agent'].tools)).toBe(true)
			expect(result['test-agent'].tools).toHaveLength(3)
		})
	})

	describe('loadAgents - Markdown Support', () => {
		it('should successfully load agent from .md file with valid frontmatter', async () => {
			// Mock readdir to return .md file
			vi.mocked(readdir).mockResolvedValueOnce([
				'test-agent.md',
			] as string[])

			// Mock readFile to return markdown with frontmatter
			const markdownContent = `---
name: test-agent
description: Test agent description
tools: Bash, Read, Write, Grep
model: sonnet
color: blue
---

You are a test agent.
This is the prompt content.`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(Object.keys(result)).toHaveLength(1)
			expect(result['test-agent']).toEqual({
				description: 'Test agent description',
				prompt: 'You are a test agent.\nThis is the prompt content.',
				tools: ['Bash', 'Read', 'Write', 'Grep'],
				model: 'sonnet',
				color: 'blue',
			})
		})

		it('should extract all required fields from frontmatter', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: full-agent
description: Full description
tools: Read, Write
model: opus
color: green
---

Agent prompt here.`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['full-agent']).toMatchObject({
				description: 'Full description',
				prompt: 'Agent prompt here.',
				tools: ['Read', 'Write'],
				model: 'opus',
				color: 'green',
			})
		})

		it('should handle multiline description field with embedded XML', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['complex-agent.md'] as string[])

			const markdownContent = `---
name: complex-agent
description: |
  Multi-line description with <example>XML tags</example>
  and newlines preserved.
tools: Read
model: sonnet
---

Prompt content`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['complex-agent'].description).toContain('<example>XML tags</example>')
			expect(result['complex-agent'].description).toContain('newlines preserved')
		})

		it('should parse name field from frontmatter', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['filename.md'] as string[])

			const markdownContent = `---
name: frontmatter-name
description: Test
tools: Read
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			// Agent name should come from frontmatter, not filename
			expect(result['frontmatter-name']).toBeDefined()
			expect(result['filename']).toBeUndefined()
		})

		it('should convert comma-separated tools string to array', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: tools-agent
description: Test
tools: Bash, Read, Write
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['tools-agent'].tools).toEqual(['Bash', 'Read', 'Write'])
			expect(Array.isArray(result['tools-agent'].tools)).toBe(true)
		})

		it('should handle tools with special characters and patterns', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: special-tools-agent
description: Test
tools: mcp__context7__get-library-docs, Bash(gh api:*), Bash(gh pr view:*)
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['special-tools-agent'].tools).toEqual([
				'mcp__context7__get-library-docs',
				'Bash(gh api:*)',
				'Bash(gh pr view:*)',
			])
		})

		it('should trim whitespace from each tool name', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: whitespace-agent
description: Test
tools: Bash,  Read,   Write  ,Grep
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['whitespace-agent'].tools).toEqual(['Bash', 'Read', 'Write', 'Grep'])
		})

		it('should extract markdown body as prompt field', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: prompt-agent
description: Test
tools: Read
model: sonnet
---

This is the actual prompt.
It has multiple lines.
With various formatting.`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['prompt-agent'].prompt).toBe(
				'This is the actual prompt.\nIt has multiple lines.\nWith various formatting.'
			)
		})

		it('should preserve formatting in prompt', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: format-agent
description: Test
tools: Read
model: sonnet
---

# Heading

\`\`\`typescript
const code = "block";
\`\`\`

<example>XML tag</example>`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['format-agent'].prompt).toContain('# Heading')
			expect(result['format-agent'].prompt).toContain('```typescript')
			expect(result['format-agent'].prompt).toContain('<example>XML tag</example>')
		})

		it('should throw error for missing frontmatter delimiters', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['bad-agent.md'] as string[])

			const markdownContent = `name: bad-agent
description: Missing delimiters
tools: Read
model: sonnet

Just content without frontmatter`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			await expect(manager.loadAgents()).rejects.toThrow('Failed to load agent')
		})

		it('should throw error for missing required field: name', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
description: Missing name
tools: Read
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			await expect(manager.loadAgents()).rejects.toThrow('Missing required field: name')
		})

		it('should throw error for missing required field: description', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: no-desc-agent
tools: Read
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			await expect(manager.loadAgents()).rejects.toThrow('Missing required field: description')
		})

		it('should throw error for missing required field: tools', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: no-tools-agent
description: Test
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			await expect(manager.loadAgents()).rejects.toThrow('Missing required field: tools')
		})

		it('should throw error for missing required field: model', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: no-model-agent
description: Test
tools: Read
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			await expect(manager.loadAgents()).rejects.toThrow('Missing required field: model')
		})

		it('should handle optional color field', async () => {
			vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

			const markdownContent = `---
name: no-color-agent
description: Test
tools: Read
model: sonnet
---

Prompt`

			vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

			const result = await manager.loadAgents()

			expect(result['no-color-agent'].color).toBeUndefined()
		})
	})

	describe('validateAgentConfig - model validation', () => {
		it('should accept valid model aliases', async () => {
			const validModels = ['sonnet', 'opus', 'haiku']

			for (const model of validModels) {
				vi.clearAllMocks()
				vi.mocked(readdir).mockResolvedValueOnce(['agent.md'] as string[])

				const markdownContent = `---
name: ${model}-agent
description: Test
tools: Read
model: ${model}
---

Prompt`

				vi.mocked(readFile).mockResolvedValueOnce(markdownContent)

				const result = await manager.loadAgents()

				expect(result[`${model}-agent`].model).toBe(model)
			}
		})
	})
})
