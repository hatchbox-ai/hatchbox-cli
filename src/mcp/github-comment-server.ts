/**
 * GitHub Comment MCP Server
 *
 * A Model Context Protocol server that enables Claude to create and update
 * GitHub comments during issue/PR workflows. Uses gh CLI for all GitHub operations.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
	createIssueComment,
	updateIssueComment,
	createPRComment,
} from '../utils/github.js'
import type {
	CreateCommentInput,
	UpdateCommentInput,
} from './types.js'

// Validate required environment variables
function validateEnvironment(): void {
	const required = ['REPO_OWNER', 'REPO_NAME']
	const missing = required.filter((key) => !process.env[key])

	if (missing.length > 0) {
		console.error(
			`Missing required environment variables: ${missing.join(', ')}`
		)
		process.exit(1)
	}
}

// Initialize the MCP server
const server = new McpServer({
	name: 'github-comment-broker',
	version: '0.1.0',
})

// Register create_comment tool
server.registerTool(
	'create_comment',
	{
		title: 'Create GitHub Comment',
		description:
			'Create a new comment on a GitHub issue or pull request. Use this to start tracking a workflow phase.',
		inputSchema: {
			number: z.number().describe('The issue or PR number'),
			body: z.string().describe('The comment body (markdown supported)'),
			type: z
				.enum(['issue', 'pr'])
				.describe('Type of entity to comment on (issue or pr)'),
		},
		outputSchema: {
			id: z.number(),
			url: z.string(),
			created_at: z.string().optional(),
		},
	},
	async ({ number, body, type }: CreateCommentInput) => {
		console.error(`Creating ${type} comment on #${number}`)

		try {
			const result =
				type === 'issue'
					? await createIssueComment(number, body)
					: await createPRComment(number, body)

			console.error(
				`Comment created successfully: ${result.id} at ${result.url}`
			)

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(result),
					},
				],
				structuredContent: result as unknown as { [x: string]: unknown },
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			console.error(`Failed to create comment: ${errorMessage}`)
			throw new Error(`Failed to create ${type} comment: ${errorMessage}`)
		}
	}
)

// Register update_comment tool
server.registerTool(
	'update_comment',
	{
		title: 'Update GitHub Comment',
		description:
			'Update an existing GitHub comment. Use this to update progress during a workflow phase.',
		inputSchema: {
			commentId: z.number().describe('The GitHub comment ID to update'),
			body: z.string().describe('The updated comment body (markdown supported)'),
		},
		outputSchema: {
			id: z.number(),
			url: z.string(),
			updated_at: z.string().optional(),
		},
	},
	async ({ commentId, body }: UpdateCommentInput) => {
		console.error(`Updating comment ${commentId}`)

		try {
			const result = await updateIssueComment(commentId, body)

			console.error(
				`Comment updated successfully: ${result.id} at ${result.url}`
			)

			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(result),
					},
				],
				structuredContent: result as unknown as { [x: string]: unknown },
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : 'Unknown error'
			console.error(`Failed to update comment: ${errorMessage}`)
			throw new Error(`Failed to update comment: ${errorMessage}`)
		}
	}
)

// Main server startup
async function main(): Promise<void> {
	console.error('Starting GitHub Comment MCP Server...')

	// Validate environment
	validateEnvironment()
	console.error('Environment validated')
	console.error(`Repository: ${process.env.REPO_OWNER}/${process.env.REPO_NAME}`)
	console.error(`Event type: ${process.env.GITHUB_EVENT_NAME ?? 'not specified'}`)

	// Connect stdio transport
	const transport = new StdioServerTransport()
	await server.connect(transport)

	console.error('GitHub Comment MCP Server running on stdio transport')
}

// Run the server
main().catch((error) => {
	console.error('Fatal error starting MCP server:', error)
	process.exit(1)
})
