import { seedDemoPost } from "./demo-post"
import { startSiteHarness } from "./site-harness"

const harness = await startSiteHarness({ port: Number(process.env["EDITOR_SITE_PORT"] ?? 4175) })
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
