import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent } from "../../shared/agent-contracts"
import { OmoCliHarness } from "./omo"

const temporaryRoots: string[] = []
const subprocessTestsAvailable = process.platform !== "win32"

function timeoutAfter(milliseconds: number): Promise<never> {
  return new Promise((_, reject) => {
    const signal = AbortSignal.timeout(milliseconds)
    signal.addEventListener(
      "abort",
      () => reject(new Error("OMO stderr 회귀 검사가 제한 시간을 넘겼습니다.")),
      { once: true },
    )
  })
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })))
})

describe("OmoCliHarness", () => {
  test.skipIf(!subprocessTestsAvailable)(
    "drains a large stderr stream while reading JSON stdout",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "omo-harness-test-"))
      temporaryRoots.push(root)
      const script = join(root, "fake-omo.mjs")
      await Bun.write(
        script,
        `const filler = "-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
for (let i = 0; i < 200000; i += 1) {
  console.error(\`stderr-line-\${String(i).padStart(4, "0")}\${filler}\`)
}
console.log('{"type":"session","id":"10000000-0000-4000-8000-000000000001"}')
`,
      )
      const isWindows = process.platform === "win32"
      const executable = join(root, isWindows ? "fake-omo.cmd" : "fake-omo")
      await Bun.write(
        executable,
        isWindows
          ? `@"${process.execPath}" "${script}" %*\r\n`
          : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
      )
      await chmod(executable, 0o755)
      const harness = new OmoCliHarness(root, executable)
      const events: AgentEvent[] = []
      try {
        await Promise.race([
          harness.run("요청", (event) => {
            events.push(event)
          }),
          timeoutAfter(5_000),
        ])
        expect(events).toContainEqual({
          type: "session",
          sessionId: "10000000-0000-4000-8000-000000000001",
        })
      } finally {
        await harness.dispose()
      }
    },
  )
})
