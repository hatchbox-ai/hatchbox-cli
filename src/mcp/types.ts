/**
 * Type definitions for GitHub Comment MCP Server
 */

/**
 * Environment variables required by MCP server
 */
export interface McpServerEnvironment {
  REPO_OWNER: string
  REPO_NAME: string
  GITHUB_EVENT_NAME: 'issues' | 'pull_request'
  GITHUB_API_URL?: string // Optional, defaults to https://api.github.com/
}

/**
 * Input schema for creating a comment
 */
export interface CreateCommentInput {
  number: number // Issue or PR number
  body: string // Comment markdown content
  type: 'issue' | 'pr' // Type of entity to comment on
}

/**
 * Input schema for updating a comment
 */
export interface UpdateCommentInput {
  commentId: number // GitHub comment ID to update
  body: string // Updated markdown content
}

/**
 * Output schema for comment operations
 */
export interface CommentResult {
  id: number
  url: string
  created_at?: string
  updated_at?: string
}
