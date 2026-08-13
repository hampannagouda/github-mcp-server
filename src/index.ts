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
