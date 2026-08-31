import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepareCommand } from "../process-command"
import { cleanupAgentWorkspace, createAgentWorkspace, readWorkspacePost } from "./workspace"

const temporaryRoots: string[] = []
const subprocessTestsAvailable = process.platform !== "win32"

async function git(cwd: string, ...args: string[]): Promise<void> {
  const process = Bun.spawn(prepareCommand(["git", ...args]), {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(await new Response(process.stderr).text())
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })))
})

// Windows는 개발자 모드나 관리자 권한 없이는 파일 심볼릭 링크를 만들 수 없다.
// 디렉터리 링크는 junction으로 대체할 수 있지만 파일 링크는 대안이 없어, 만들 수 있을 때만 검사한다.
async function supportsFileSymlinks(): Promise<boolean> {
  const probe = await mkdtemp(join(tmpdir(), "techblog-symlink-probe-"))
  try {
    await symlink(join(probe, "target"), join(probe, "link"), "file")
    return true
  } catch {
    return false
  } finally {
    await rm(probe, { recursive: true, force: true })
  }
}

const fileSymlinksAvailable = await supportsFileSymlinks()

describe("agent workspace", () => {
  test.skipIf(!fileSymlinksAvailable)(
    "rejects symbolic links that escape the post bundle",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "techblog-agent-test-"))
      temporaryRoots.push(root)
      const postDirectory = join(root, "content/posts/example")
      await mkdir(postDirectory, { recursive: true })
      await Bun.write(
        join(postDirectory, "index.md"),
        "---\ntitle: '기준 글'\ndraft: false\n---\n\n기준 본문\n",
      )
      await symlink(
        join(tmpdir(), "outside-post-bundle"),
        join(postDirectory, "outside.png"),
        "file",
      )

      await expect(
        createAgentWorkspace(root, "content/posts/example/index.md", "session-link"),
      ).rejects.toThrow("심볼릭 링크")
    },
  )

  test("rejects a post bundle directory that is itself a symbolic link", async () => {
    const root = await mkdtemp(join(tmpdir(), "techblog-agent-test-"))
    temporaryRoots.push(root)
    const postsDirectory = join(root, "content/posts")
    const outsideDirectory = join(root, "outside")
    await mkdir(postsDirectory, { recursive: true })
    await mkdir(outsideDirectory)
    await Bun.write(
      join(outsideDirectory, "index.md"),
      "---\ntitle: '외부 글'\ndraft: false\n---\n\n외부 본문\n",
    )
    await symlink(outsideDirectory, join(postsDirectory, "example"), "junction")

    await expect(
      createAgentWorkspace(root, "content/posts/example/index.md", "session-directory-link"),
    ).rejects.toThrow("심볼릭 링크")
  })

  test.skipIf(!subprocessTestsAvailable)(
    "seeds the current post bundle and cleans the git worktree",
    async () => {
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
      const listProcess = Bun.spawn(prepareCommand(["git", "worktree", "list", "--porcelain"]), {
        cwd: root,
        stdout: "pipe",
      })
      await listProcess.exited
      expect(await new Response(listProcess.stdout).text()).not.toContain(workspace.root)
    },
  )
})
