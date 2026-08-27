import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cleanupAgentWorkspace, createAgentWorkspace, readWorkspacePost } from "./workspace"

const temporaryRoots: string[] = []

async function git(cwd: string, ...args: string[]): Promise<void> {
  const process = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(await new Response(process.stderr).text())
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })))
})

describe("agent workspace", () => {
  test("rejects symbolic links that escape the post bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "techblog-agent-test-"))
    temporaryRoots.push(root)
    await git(root, "init")
    await git(root, "config", "user.email", "editor@example.com")
    await git(root, "config", "user.name", "Editor Test")
    const postDirectory = join(root, "content/posts/example")
    await mkdir(postDirectory, { recursive: true })
    await Bun.write(
      join(postDirectory, "index.md"),
      "---\ntitle: '기준 글'\ndraft: false\n---\n\n기준 본문\n",
    )
    await git(root, "add", ".")
    await git(root, "commit", "-m", "base")
    await symlink("/tmp/outside-post-bundle", join(postDirectory, "outside.png"))

    await expect(
      createAgentWorkspace(root, "content/posts/example/index.md", "session-link"),
    ).rejects.toThrow("심볼릭 링크")
  })

  test("seeds the current post bundle and cleans the git worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "techblog-agent-test-"))
    temporaryRoots.push(root)
    await git(root, "init")
    await git(root, "config", "user.email", "editor@example.com")
    await git(root, "config", "user.name", "Editor Test")
    const postDirectory = join(root, "content/posts/example")
    await mkdir(postDirectory, { recursive: true })
    await Bun.write(
      join(postDirectory, "index.md"),
      "---\ntitle: '기준 글'\ndraft: false\n---\n\n기준 본문\n",
    )
    await Bun.write(join(postDirectory, "diagram.png"), "base-image")
    await git(root, "add", ".")
    await git(root, "commit", "-m", "base")

    await Bun.write(
      join(postDirectory, "index.md"),
      "---\ntitle: '현재 글'\ndraft: false\n---\n\n저장되지 않은 현재 본문\n",
    )
    await Bun.write(join(postDirectory, "diagram.png"), "current-image")

    const workspace = await createAgentWorkspace(
      root,
      "content/posts/example/index.md",
      "session-one",
    )
    const seeded = await readWorkspacePost(workspace)
    expect(seeded.title).toBe("현재 글")
    expect(seeded.body).toBe("저장되지 않은 현재 본문\n")
    expect(await Bun.file(join(workspace.root, "content/posts/example/diagram.png")).text()).toBe(
      "current-image",
    )

    await Bun.write(
      join(workspace.root, "content/posts/example/index.md"),
      "---\ntitle: '제안 글'\ndraft: false\n---\n\n에이전트 제안 본문\n",
    )
    const proposed = await readWorkspacePost(workspace)
    expect(proposed.title).toBe("제안 글")
    expect(proposed.body).toBe("에이전트 제안 본문\n")

    await cleanupAgentWorkspace(workspace)
    const listProcess = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
      cwd: root,
      stdout: "pipe",
    })
    await listProcess.exited
    expect(await new Response(listProcess.stdout).text()).not.toContain(workspace.root)
  })
})
