import type { BundleImage, PostBundle } from "../../shared/onsite/document"
import type { Renderer } from "../../shared/onsite/render"
import type { SiteServices } from "./contracts"

/**
 * Where a committed file can be read as of a commit without the API: raw.githubusercontent.com
 * for the public repository, the fake server's /raw locally. The address names the commit, so
 * its content never changes.
 */
function rawFileUrl(apiBaseUrl: string, commit: string, path: string): string {
  const base =
    apiBaseUrl === "https://api.github.com"
      ? "https://raw.githubusercontent.com"
      : `${apiBaseUrl.replace(/\/$/, "")}/raw`
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${base}/Hyper-Accel/hyper-accel.github.io/${commit}/${encoded}`
}

export async function prepareSiteImages(
  services: SiteServices,
  bundle: {
    readonly slug: string
    readonly headSha: string | null
    readonly images: readonly BundleImage[]
  },
): Promise<{
  imageUrl(path: string): string | undefined
  imageSize(path: string): { width: number; height: number } | undefined
  dispose(): void
}> {
  const urls = new Map<string, string>()
  const sizes = new Map<string, { width: number; height: number }>()
  const pathOf = (path: string): string => path.replace(/^\.\//, "").split("#")[0] ?? path
  const objectUrls: string[] = []
  // Committed pictures are not downloaded first: the editor opens at once and the browser loads
  // each picture from its commit address as it draws it. Pending ones exist only on this device.
  const loads = await Promise.allSettled(
    bundle.images.map(async (image) => {
      if (image.status !== "pending") {
        if (!bundle.headSha) throw new Error("이미지를 불러오지 못했습니다.")
        urls.set(
          image.path,
          rawFileUrl(
            services.apiBaseUrl,
            bundle.headSha,
            `content/posts/${bundle.slug}/${image.path}`,
          ),
        )
        return
      }
      const url = URL.createObjectURL(image.blob)
      objectUrls.push(url)
      urls.set(image.path, url)
      if (image.mime !== "image/svg+xml") {
        const bitmap = await createImageBitmap(image.blob)
        sizes.set(image.path, { width: bitmap.width, height: bitmap.height })
        bitmap.close()
      }
    }),
  )
  try {
    const failed = loads.find((load) => load.status === "rejected")
    if (failed) throw failed.reason
    return {
      imageUrl(path) {
        return urls.get(pathOf(path))
      },
      imageSize(path) {
        return sizes.get(pathOf(path))
      },
      dispose() {
        for (const url of objectUrls) URL.revokeObjectURL(url)
      },
    }
  } catch (error: unknown) {
    for (const url of objectUrls) URL.revokeObjectURL(url)
    throw error
  }
}

export async function prepareSiteRenderer(
  services: SiteServices,
  bundle: PostBundle,
): Promise<{ readonly renderer: Renderer; dispose(): void }> {
  const images = await prepareSiteImages(services, bundle)
  try {
    // The review frame is sandboxed without same-origin access, so it cannot read this page's
    // blob: URLs; it gets the post's pictures as data: URLs instead.
    const dataUrls = new Map<string, string>()
    for (const image of bundle.images) {
      const url = images.imageUrl(image.path)
      if (!url) continue
      const blob = await (await fetch(url)).blob()
      dataUrls.set(
        image.path,
        await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error ?? new Error("그림을 읽지 못했습니다."))
          reader.readAsDataURL(blob)
        }),
      )
    }
    const [serialized, { createRenderer }] = await Promise.all([
      services.codec.serialize(bundle),
      import("../../render"),
    ])
    const resolveImage = (source: string, language: "ko" | "en"): string =>
      dataUrls.get(source.replace(/^\.\//, "").split("#")[0] ?? source) ??
      new URL(source, `${location.origin}${language === "en" ? "/en" : ""}/posts/${bundle.slug}/`)
        .href
    const real = createRenderer({
      resolveImage: (source, language) => resolveImage(source, language.language),
      imageSize: images.imageSize,
      serializedMarkdown: (language) => {
        const file = serialized.files.find((entry) => entry.path === language.path)
        if (file?.encoding !== "utf-8") throw new Error("Serialized language source is missing")
        return file.content
      },
    })
    return {
      renderer: {
        render(language) {
          const result = real.render(language)
          const parsed = new DOMParser().parseFromString(result.html, "text/html")
          const wrapper = parsed.body.firstElementChild
          if (!wrapper?.classList.contains("post-content"))
            throw new Error("Renderer post-content wrapper is missing")
          for (const image of wrapper.querySelectorAll("img[src]")) {
            image.setAttribute(
              "src",
              resolveImage(image.getAttribute("src") ?? "", language.language),
            )
          }
          return { ...result, html: wrapper.innerHTML }
        },
      },
      dispose: images.dispose,
    }
  } catch (error: unknown) {
    images.dispose()
    throw error
  }
}
