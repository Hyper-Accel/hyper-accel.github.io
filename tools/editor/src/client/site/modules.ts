import type { SiteMount } from "./contracts"

export async function loadSiteMount(
  name: "mountLogin" | "mountCallback" | "mountComposer",
): Promise<SiteMount> {
  if (name === "mountLogin" || name === "mountCallback") {
    const { mountAuth } = await import("../auth")
    return (root, deps) => {
      const mount = mountAuth(root, {
        auth: deps.auth,
        onSession: (session) => {
          if (session) deps.onAuthenticated()
        },
      })
      const unsubscribe = deps.onSession((session) => {
        if (session) deps.onAuthenticated()
      })
      return () => {
        unsubscribe()
        mount.dispose()
      }
    }
  }
  return (await import("./composer")).mountComposer
}
