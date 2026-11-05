import { seedDemoPost } from "./demo-post"
import { startSiteHarness } from "./site-harness"

// The signed-in fake account is the demo post's author, so 내 프로필 수정 can be tried.
const harness = await startSiteHarness({
  port: Number(process.env["EDITOR_SITE_PORT"] ?? 4175),
  writer: "Donghyeon Choi",
})
// The local site also carries a finished demo post that uses every editor tool.
await seedDemoPost(harness.github)
console.info(
  `Local blog with the editor (fake GitHub and token exchange): ${harness.url}/ (login: ${harness.url}/editor-login/)`,
)
const stop = (): void => {
  harness.stop()
  process.exit(0)
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
