export const BLOCK_ID_PREFIX = "<!-- b:"
export const BLOCK_ID_SUFFIX = " -->"
export const BLOCK_ID_PATTERN = /^<!-- b:([A-Za-z0-9][A-Za-z0-9_-]*) -->$/m
export const IMAGE_PRESETS = {
  body: "",
  wide: "#wide",
  "side-right": "#side-right",
  "side-left": "#side-left",
} as const
export type ImagePreset = keyof typeof IMAGE_PRESETS
export const IMAGE_PRESET_ALIASES = { "#side": "#side-right" } as const
export const SHORTCODES = {
  /** Naver's "나란히 놓기": two or three pictures in one row. */
  pair: { open: "{{< pair >}}", close: "{{< /pair >}}", minImages: 2, maxImages: 3 },
  /** Naver's "슬라이드": pictures shown one at a time. */
  slides: { open: "{{< slides >}}", close: "{{< /slides >}}", minImages: 2, maxImages: 10 },
  steps: { open: "{{< steps >}}", close: "{{< /steps >}}" },
  compare: {
    open: '{{< compare caption="…" start="50" >}}',
    close: "{{< /compare >}}",
    imageCount: 2,
    defaultStart: 50,
    minStart: 0,
    maxStart: 100,
  },
  tabs: { open: "{{< tabs >}}", close: "{{< /tabs >}}" },
  tab: { open: '{{< tab name="…" >}}', close: "{{< /tab >}}" },
} as const
export const ALERT_TYPES = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const
export const ALERT_PATTERN = /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?: (.*))?$/
export const PRESERVED_SHORTCODES = ["ref", "figure", "rawhtml"] as const
