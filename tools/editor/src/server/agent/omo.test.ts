import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentEvent } from "../../shared/agent-contracts"
import { OmoCliHarness } from "./omo"

const temporaryRoots: string[] = []

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
  test("drains a large stderr stream while reading JSON stdout", async () => {
    const root = await mkdtemp(join(tmpdir(), "omo-harness-test-"))
    temporaryRoots.push(root)
    const executable = join(root, "fake-omo")
    await Bun.write(
      executable,
      `#!/bin/sh
i=0
while [ "$i" -lt 200000 ]; do
  printf 'stderr-line-%04d-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n' "$i" >&2
  i=$((i + 1))
done
printf '{"type":"session","id":"10000000-0000-4000-8000-000000000001"}\\n'
`,
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
  })
})
