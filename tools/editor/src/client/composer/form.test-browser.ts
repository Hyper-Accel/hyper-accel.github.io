import "../../../../../assets/css/core/theme-vars.css"
import "./composer.css"
import { createMetadataForm, type MetadataForm, type MetadataFormOptions } from "./form"
import type { PostMetadata } from "./metadata"

export interface MetadataFormHarness {
  readonly changes: PostMetadata[]
  readonly submitted: PostMetadata[]
  mount(mode: MetadataFormOptions["mode"], initial?: Partial<PostMetadata>): void
  read(): PostMetadata
}

declare global {
  interface Window {
    __metadataForm: MetadataFormHarness
  }
}

const AUTHORS = ["Donghyeon Choi", "Hyunjun Park", "Jaewon Lim", "Minho Park", "Sinhyun Park"]
const CATEGORIES = ["AI Hardware", "Engineering Culture"]
const EMPTY: PostMetadata = {
  slug: "",
  title: { ko: "", en: "" },
  authors: [],
  category: "",
  tags: [],
  series: "",
  seriesIndex: null,
  cover: null,
  date: "2026-10-28T09:00:00+09:00",
  draft: false,
  editors: [],
}

const root = document.createElement("div")
root.className = "composer"
document.body.append(root)
const changes: PostMetadata[] = []
const submitted: PostMetadata[] = []
let form: MetadataForm | null = null

window.__metadataForm = {
  changes,
  submitted,
  mount(mode, initial = {}) {
    form?.element.remove()
    changes.length = 0
    submitted.length = 0
    form = createMetadataForm({
      mode,
      initial: { ...EMPTY, ...initial },
      authors: AUTHORS,
      categories: CATEGORIES,
      onChange: (metadata) => {
        changes.push(metadata)
      },
      onSubmit: (metadata) => {
        submitted.push(metadata)
      },
      onCoverFile: (file) => Promise.resolve(`images/${file.name.replace(/\.[^.]+$/, "")}.webp`),
      coverPreviewUrl: () => undefined,
    })
    root.append(form.element)
  },
  read() {
    if (!form) throw new Error("Mount the metadata form first")
    return form.read()
  },
}
