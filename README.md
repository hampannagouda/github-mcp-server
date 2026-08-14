# GitHub MCP Server (Local)

A local MCP server that gives Claude Desktop direct access to your GitHub account
via a personal access token. Runs entirely on your machine — your token never
leaves your computer except to talk to GitHub's API directly.

## Tools included

- `github_whoami` — get the authenticated user's profile
- `github_list_repos` — list your repos
- `github_get_repo` — get details on a specific repo
- `github_search_repos` — search repositories
- `github_get_file` — read a file's contents from a repo
- `github_list_issues` — list issues in a repo
- `github_create_issue` — create an issue
- `github_list_pull_requests` — list PRs in a repo
- `github_search_code` — search code across GitHub
- `github_list_commits` — list commits in a repo (filter by branch, path, or author)
- `github_get_commit` — get a single commit with changed files and diff stats
- `github_list_branches` — list branches in a repo
- `github_get_issue` — get full details of a single issue
- `github_get_pull_request` — get full details of a single PR
- `github_list_pr_files` — list files changed in a PR
- `github_add_issue_comment` — comment on an issue or PR
- `github_search_issues` — search issues and PRs across GitHub

## 1. Prerequisites

- Node.js 18+ installed on your computer
- A GitHub Personal Access Token (PAT)

### Create a GitHub token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token** → **Fine-grained token** (recommended) or classic token
3. Give it a name, an expiration, and scopes:
   - Fine-grained: grant access to the repos you want, with **Contents** (read),
     **Issues** (read/write), **Pull requests** (read) permissions
   - Classic: the `repo` scope covers everything above
4. Copy the token (starts with `github_pat_` or `ghp_`) — you won't see it again

**Keep this token secret.** Anyone with it can act as you on GitHub within its scopes.

## 2. Install

Unzip this project anywhere on your computer, then in a terminal:

```bash
cd github-mcp-server
npm install
npm run build
```

This produces a `dist/index.js` file — that's what Claude Desktop will run.

## 3. Configure Claude Desktop

Open your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add an entry under `mcpServers` (create the file/section if it doesn't exist),
using the **absolute path** to `dist/index.js`:

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/absolute/path/to/github-mcp-server/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Replace the path and token with your own values.

## 4. Restart Claude Desktop

Fully quit and reopen the app. You should see a small tools/plug icon indicating
the "github" MCP server is connected, and its tools will be available in chat.

## Notes

- This server only runs while Claude Desktop is open — it starts/stops the process for you.
- To revoke access at any time, delete the token at https://github.com/settings/tokens.
- To add more capabilities (e.g. creating PRs, managing branches), extend `src/index.ts`
  with additional `server.tool(...)` calls using the [Octokit REST API](https://octokit.github.io/rest.js/).
