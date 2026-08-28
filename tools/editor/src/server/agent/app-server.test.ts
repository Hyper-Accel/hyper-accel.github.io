import { describe, expect, test } from "bun:test"
import { CodexAppServerHarness } from "./app-server"

function timeoutAfter(milliseconds: number): Promise<never> {
  return new Promise((_, reject) => {
    const signal = AbortSignal.timeout(milliseconds)
    signal.addEventListener(
      "abort",
      () => reject(new Error("app-server 종료 회귀 검사가 제한 시간을 넘겼습니다.")),
      { once: true },
    )
  })
}

describe("CodexAppServerHarness", () => {
  test("rejects initialization when the app server exits without output", async () => {
    const harness = new CodexAppServerHarness("codex", "/tmp", ["/bin/sh", "-c", "exit 7"])
    try {
      const failure = await Promise.race([
        harness
          .run("요청", () => undefined)
          .then(
            () => new Error("app-server 종료 뒤 요청이 성공했습니다."),
            (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
          ),
        timeoutAfter(2_000),
      ])
      expect(failure.message).not.toContain("제한 시간을 넘겼습니다")
      expect(failure.message).toContain("예기치 않게 종료")
    } finally {
      await harness.dispose()
    }
  })
})
