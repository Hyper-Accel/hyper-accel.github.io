import { Node } from "@tiptap/core"
import {
  YOUTUBE_ALLOW,
  YOUTUBE_CONTAINER_STYLE,
  YOUTUBE_FRAME_STYLE,
  youtubeId,
  youtubeSource,
} from "../../document/youtube"
import { attrString } from "./dom"
import { SHORTCODE_TOKEN, shortcodeBlockKind } from "./tokenizers"
import { youtubeNodeView } from "./youtube-view"

export const Youtube = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,
  markdownTokenName: SHORTCODE_TOKEN,
  addAttributes() {
    return { videoId: { default: "" }, raw: { default: null, rendered: false } }
  },
  parseHTML: () => [{ tag: "div[data-youtube]" }],
  renderHTML({ node }) {
    const id = attrString(node.attrs, "videoId")
    return [
      "div",
      { "data-youtube": id, style: YOUTUBE_CONTAINER_STYLE },
      [
        "iframe",
        {
          src: youtubeId(id) ? youtubeSource(id) : undefined,
          title: "YouTube video",
          style: YOUTUBE_FRAME_STYLE,
          allow: YOUTUBE_ALLOW,
          loading: "eager",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      ],
    ]
  },
  parseMarkdown: (token) =>
    shortcodeBlockKind(token) !== "youtube"
      ? []
      : {
          type: "youtube",
          attrs: { videoId: token["videoId"], raw: token.raw },
        },
  renderMarkdown: (node) => {
    const attrs = node.attrs ?? {}
    if (typeof attrs["raw"] === "string") return attrs["raw"]
    // An empty box waiting for its address is never written out.
    const id = youtubeId(attrString(attrs, "videoId"))
    return id ? `{{< youtube ${id} >}}` : ""
  },
  addNodeView() {
    return youtubeNodeView
  },
})
