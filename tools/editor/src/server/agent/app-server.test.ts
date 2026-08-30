import { describe, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { CodexAppServerHarness } from "./app-server"

// Bun의 Windows test runner에서는 테스트 내부의 중첩 subprocess가 EPERM으로 차단된다.
// Windows 명령 변환은 process-command.test.ts에서 별도로 검증한다.
const subprocessTestsAvailable = process.platform !== "win32"

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
  test.skipIf(!subprocessTestsAvailable)(
    "rejects initialization when the app server exits without output",
    async () => {
      const harness = new CodexAppServerHarness("codex", tmpdir(), [
        process.execPath,
        "-e",
        "process.exit(7)",
      ])
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
    },
  )
})
