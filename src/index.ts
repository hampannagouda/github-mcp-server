#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Octokit } from "@octokit/rest";
import { z } from "zod";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error(
    "Missing GITHUB_TOKEN environment variable. Set it in your Claude Desktop config's `env` block."
  );
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

const server = new McpServer({
  name: "github-mcp-server",
  version: "1.0.0",
});

// ---- Tools ----

server.tool(
  "github_whoami",
  "Get the authenticated GitHub user's profile (login, name, email, etc).",
  {},
  async () => {
    const { data } = await octokit.users.getAuthenticated();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "github_list_repos",
  "List repositories owned by or accessible to the authenticated user.",
  {
    type: z
      .enum(["all", "owner", "member"])
      .default("owner")
      .describe("Filter by repo relationship to the user"),
    sort: z
      .enum(["created", "updated", "pushed", "full_name"])
      .default("updated"),
    per_page: z.number().min(1).max(100).default(30),
  },
  async ({ type, sort, per_page }) => {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      type,
      sort,
      per_page,
    });
    const simplified = data.map((r) => ({
      full_name: r.full_name,
      private: r.private,
      description: r.description,
      default_branch: r.default_branch,
      updated_at: r.updated_at,
      html_url: r.html_url,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_get_repo",
  "Get details about a specific repository.",
  {
    owner: z.string().describe("Repository owner (user or org)"),
    repo: z.string().describe("Repository name"),
  },
  async ({ owner, repo }) => {
    const { data } = await octokit.repos.get({ owner, repo });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "github_search_repos",
  "Search GitHub repositories by keyword/query.",
  {
    query: z.string().describe("Search query, e.g. 'language:python stars:>100 machine learning'"),
    per_page: z.number().min(1).max(50).default(10),
  },
  async ({ query, per_page }) => {
    const { data } = await octokit.search.repos({ q: query, per_page });
    const simplified = data.items.map((r) => ({
      full_name: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
      html_url: r.html_url,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_get_file",
  "Get the contents of a file from a GitHub repository.",
  {
    owner: z.string(),
    repo: z.string(),
    path: z.string().describe("File path within the repo, e.g. 'src/index.ts'"),
    ref: z.string().optional().describe("Branch, tag, or commit SHA (defaults to default branch)"),
  },
  async ({ owner, repo, path, ref }) => {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data)) {
      return {
        content: [
          {
            type: "text",
            text: `Path is a directory, not a file. Contents:\n${JSON.stringify(
              data.map((d) => ({ name: d.name, type: d.type, path: d.path })),
              null,
              2
            )}`,
          },
        ],
      };
    }
    if ("content" in data && data.content) {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      return { content: [{ type: "text", text: decoded }] };
    }
    return { content: [{ type: "text", text: "Unable to read file content." }] };
  }
);

server.tool(
  "github_list_issues",
  "List issues in a repository.",
  {
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).default("open"),
    per_page: z.number().min(1).max(100).default(20),
  },
  async ({ owner, repo, state, per_page }) => {
    const { data } = await octokit.issues.listForRepo({
      owner,
      repo,
      state,
      per_page,
    });
    const simplified = data.map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      user: i.user?.login,
      html_url: i.html_url,
      created_at: i.created_at,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_create_issue",
  "Create a new issue in a repository.",
  {
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
  },
  async ({ owner, repo, title, body, labels }) => {
    const { data } = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });
    return {
      content: [
        {
          type: "text",
          text: `Created issue #${data.number}: ${data.html_url}`,
        },
      ],
    };
  }
);

server.tool(
  "github_list_pull_requests",
  "List pull requests in a repository.",
  {
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).default("open"),
    per_page: z.number().min(1).max(100).default(20),
  },
  async ({ owner, repo, state, per_page }) => {
    const { data } = await octokit.pulls.list({ owner, repo, state, per_page });
    const simplified = data.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      user: p.user?.login,
      html_url: p.html_url,
      created_at: p.created_at,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_search_code",
  "Search code across GitHub (or within a specific repo using `repo:owner/name` in the query).",
  {
    query: z.string().describe("Search query, e.g. 'repo:facebook/react useState'"),
    per_page: z.number().min(1).max(50).default(10),
  },
  async ({ query, per_page }) => {
    const { data } = await octokit.search.code({ q: query, per_page });
    const simplified = data.items.map((i) => ({
      name: i.name,
      path: i.path,
      repository: i.repository.full_name,
      html_url: i.html_url,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_list_commits",
  "List commits in a repository (optionally filtered by branch/ref, path, or author).",
  {
    owner: z.string(),
    repo: z.string(),
    sha: z
      .string()
      .optional()
      .describe("Branch, tag, or commit SHA to start listing from (defaults to default branch)"),
    path: z.string().optional().describe("Only commits touching this file path"),
    author: z.string().optional().describe("Filter by GitHub login or email"),
    per_page: z.number().min(1).max(100).default(20),
  },
  async ({ owner, repo, sha, path, author, per_page }) => {
    const { data } = await octokit.repos.listCommits({
      owner,
      repo,
      sha,
      path,
      author,
      per_page,
    });
    const simplified = data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.name,
      date: c.commit.author?.date,
      html_url: c.html_url,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_get_commit",
  "Get details of a single commit, including changed files and diff stats.",
  {
    owner: z.string(),
    repo: z.string(),
    ref: z.string().describe("Commit SHA, branch, or tag"),
  },
  async ({ owner, repo, ref }) => {
    const { data } = await octokit.repos.getCommit({ owner, repo, ref });
    const simplified = {
      sha: data.sha,
      message: data.commit.message,
      author: data.commit.author?.name,
      date: data.commit.author?.date,
      html_url: data.html_url,
      stats: data.stats,
      files: data.files?.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
      })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_list_branches",
  "List branches in a repository.",
  {
    owner: z.string(),
    repo: z.string(),
    per_page: z.number().min(1).max(100).default(30),
  },
  async ({ owner, repo, per_page }) => {
    const { data } = await octokit.repos.listBranches({ owner, repo, per_page });
    const simplified = data.map((b) => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_get_issue",
  "Get full details of a single issue, including its body.",
  {
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
  },
  async ({ owner, repo, issue_number }) => {
    const { data } = await octokit.issues.get({ owner, repo, issue_number });
    const simplified = {
      number: data.number,
      title: data.title,
      state: data.state,
      user: data.user?.login,
      labels: data.labels.map((l) => (typeof l === "string" ? l : l.name)),
      body: data.body,
      html_url: data.html_url,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_get_pull_request",
  "Get full details of a single pull request, including its body, branches, and merge status.",
  {
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
  },
  async ({ owner, repo, pull_number }) => {
    const { data } = await octokit.pulls.get({ owner, repo, pull_number });
    const simplified = {
      number: data.number,
      title: data.title,
      state: data.state,
      user: data.user?.login,
      body: data.body,
      head: data.head.ref,
      base: data.base.ref,
      merged: data.merged,
      mergeable: data.mergeable,
      additions: data.additions,
      deletions: data.deletions,
      changed_files: data.changed_files,
      html_url: data.html_url,
      created_at: data.created_at,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_list_pr_files",
  "List the files changed in a pull request.",
  {
    owner: z.string(),
    repo: z.string(),
    pull_number: z.number(),
    per_page: z.number().min(1).max(100).default(50),
  },
  async ({ owner, repo, pull_number, per_page }) => {
    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number,
      per_page,
    });
    const simplified = data.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

server.tool(
  "github_add_issue_comment",
  "Add a comment to an issue or pull request.",
  {
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number().describe("Issue or PR number"),
    body: z.string().describe("Comment text (Markdown supported)"),
  },
  async ({ owner, repo, issue_number, body }) => {
    const { data } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
    return {
      content: [{ type: "text", text: `Comment added: ${data.html_url}` }],
    };
  }
);

server.tool(
  "github_search_issues",
  "Search issues and pull requests across GitHub (use `repo:owner/name` to scope to a repo).",
  {
    query: z
      .string()
      .describe("Search query, e.g. 'repo:facebook/react is:issue is:open label:bug'"),
    per_page: z.number().min(1).max(50).default(10),
  },
  async ({ query, per_page }) => {
    const { data } = await octokit.search.issuesAndPullRequests({
      q: query,
      per_page,
    });
    const simplified = data.items.map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      is_pull_request: !!i.pull_request,
      html_url: i.html_url,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(simplified, null, 2) }],
    };
  }
);

// ---- Start server over stdio ----

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
