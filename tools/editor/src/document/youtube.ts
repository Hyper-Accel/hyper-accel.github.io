const VIDEO_ID = /^[\w-]{11}$/

export function youtubeId(value: string): string | null {
  if (VIDEO_ID.test(value)) return value
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const host = url.hostname.replace(/^www\./, "")
  const parts = url.pathname.split("/")
  const id =
    host === "youtu.be"
      ? parts[1]
      : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
        ? url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed"].includes(parts[1] ?? "")
            ? parts[2]
            : null
        : null
  return id && VIDEO_ID.test(id) ? id : null
}

export function youtubeSource(id: string): string {
  return `https://www.youtube.com/embed/${id}?autoplay=0&controls=1&end=0&loop=0&mute=0&start=0`
}

export const YOUTUBE_CONTAINER_STYLE =
  "position:relative;padding-bottom:56.25%;height:0;overflow:hidden"
export const YOUTUBE_FRAME_STYLE = "position:absolute;top:0;left:0;width:100%;height:100%;border:0"
export const YOUTUBE_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
