import { cp, lstat, mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { parse } from "yaml"
import { z } from "zod"
import { splitMarkdownDocument } from "../content"
import { ContentError } from "../errors"
import { prepareCommand } from "../process-command"

const workspaceMetadataSchema = z.object({
  title: z.string().default("제목 없음"),
})

export type AgentWorkspace = {
  readonly id: string
  readonly repositoryRoot: string
  readonly root: string
  readonly postPath: string
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const process = Bun.spawn(prepareCommand(["git", ...args]), {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new ContentError(stderr.trim() || `git ${args[0] ?? ""} 실행에 실패했습니다.`)
  }
  return stdout
}

async function rejectSymbolicLinks(directory: string): Promise<void> {
  if ((await lstat(directory)).isSymbolicLink()) {
    throw new ContentError("글 번들의 심볼릭 링크는 에이전트 작업공간에 복사할 수 없습니다.")
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new ContentError(
        `글 번들의 심볼릭 링크는 에이전트 작업공간에 복사할 수 없습니다: ${entry.name}`,
      )
    }
    if (entry.isDirectory()) {
      await rejectSymbolicLinks(join(directory, entry.name))
    }
  }
}

export async function createAgentWorkspace(
  repositoryRoot: string,
  postPath: string,
  id: string,
): Promise<AgentWorkspace> {
  const sourceBundle = dirname(join(repositoryRoot, postPath))
  await rejectSymbolicLinks(sourceBundle)
  const parent = await mkdtemp(join(tmpdir(), "techblog-editor-agent-"))
  const root = join(parent, `worktree-${id}`)
  try {
    await git(repositoryRoot, ["worktree", "add", "--detach", root, "HEAD"])
    const targetBundle = dirname(join(root, postPath))
    await rm(targetBundle, { recursive: true, force: true })
    await cp(sourceBundle, targetBundle, { recursive: true, force: true })
    return { id, repositoryRoot, root, postPath }
  } catch (error: unknown) {
    await rm(parent, { recursive: true, force: true })
    throw error
  }
}

export async function readWorkspacePost(
  workspace: AgentWorkspace,
): Promise<{ readonly title: string; readonly body: string }> {
  const source = await Bun.file(join(workspace.root, workspace.postPath)).text()
  const parts = splitMarkdownDocument(source)
  const metadata = workspaceMetadataSchema.parse(parse(parts.frontmatter))
  return { title: metadata.title, body: parts.body }
}

export async function cleanupAgentWorkspace(workspace: AgentWorkspace): Promise<void> {
  try {
    await git(workspace.repositoryRoot, ["worktree", "remove", "--force", workspace.root])
  } catch (error: unknown) {
    await rm(dirname(workspace.root), { recursive: true, force: true })
    await git(workspace.repositoryRoot, ["worktree", "prune", "--expire", "now"])
    if (!(error instanceof ContentError)) {
      throw error
    }
    return
  }
  await rm(dirname(workspace.root), { recursive: true, force: true })
}

export function workspacePostLabel(workspace: AgentWorkspace): string {
  return `${basename(dirname(workspace.postPath))}/${basename(workspace.postPath)}`
}
