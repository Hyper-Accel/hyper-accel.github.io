import { postBundleSchema } from "../../shared/onsite/document"
import type { DraftCursor } from "../../shared/onsite/drafts"
import fixture from "../../shared/onsite/fixtures/image-layouts/bundle.json"
import { createDraftAutosave, createDraftStore } from "../drafts"
import { createAuthController, mountAuth } from "./index"

// This isolated browser fixture exercises lane A without editing H's application entry.
const root = document.querySelector<HTMLElement>("#auth")
const ko = document.querySelector<HTMLTextAreaElement>("#ko")
const en = document.querySelector<HTMLTextAreaElement>("#en")
const titleKo = document.querySelector<HTMLInputElement>("#title-ko")
const titleEn = document.querySelector<HTMLInputElement>("#title-en")
const image = document.querySelector<HTMLInputElement>("#image")
const preview = document.querySelector<HTMLImageElement>("#preview")
const saved = document.querySelector<HTMLElement>("#saved")
const expire = document.querySelector<HTMLButtonElement>("#expire")
if (!root || !ko || !en || !titleKo || !titleEn || !image || !preview || !saved || !expire) {
  throw new Error("Missing browser fixture controls")
}
const controls = { root, ko, en, titleKo, titleEn, image, preview, saved, expire }
const store = createDraftStore()
let bundle = postBundleSchema.parse(fixture)
let autosave: ReturnType<typeof createDraftAutosave> | null = null
let cursor: DraftCursor = {
  language: "ko",
  anchor: { blockId: "image-layouts-1", offset: 0 },
  focus: { blockId: "image-layouts-1", offset: 0 },
  scrollTop: 0,
}
let revision = 0
const auth = createAuthController({
  clientId: "fake-client",
  exchangeUrl: `${location.origin}/exchange`,
  apiOrigin: `${location.origin}`,
  repository: { owner: "Hyper-Accel", name: "hyper-accel.github.io" },
  flushDrafts: () => store.flush(),
})
const callback = auth.handleCallback
auth.handleCallback = async () => {
  try {
    return await callback()
  } catch (error) {
    controls.saved.dataset["error"] =
      error instanceof Error ? `${error.name}: ${error.message}` : "Unknown callback error"
    throw error
  }
}
function render(): void {
  controls.ko.value = bundle.ko.blocks[0]?.markdown ?? ""
  controls.en.value = bundle.en.blocks[0]?.markdown ?? ""
  controls.titleKo.value = bundle.ko.frontMatter.title
  controls.titleEn.value = bundle.en.frontMatter.title
  const pending = bundle.images.find((entry) => entry.status === "pending")
  if (pending?.status === "pending") controls.preview.src = URL.createObjectURL(pending.blob)
  const active = cursor.language === "ko" ? controls.ko : controls.en
  active.focus()
  active.setSelectionRange(cursor.anchor.offset, cursor.focus.offset)
}
async function persist(): Promise<void> {
  if (!autosave) return
  const current = ++revision
  await autosave.update(bundle, cursor)
  controls.saved.dataset["revision"] = String(current)
}
mountAuth(controls.root, {
  auth,
  async onSession(session) {
    if (!session?.canWrite) return
    const key = {
      owner: session.repository.owner,
      repository: session.repository.name,
      userId: session.userId,
      slug: bundle.slug,
    }
    const restored = await store.restore(key, bundle.headSha)
    if (restored.status === "conflict") throw new Error("Unexpected fixture conflict")
    if (restored.status === "restored") {
      bundle = restored.snapshot.bundle
      cursor = restored.snapshot.cursor ?? cursor
    }
    autosave?.dispose()
    autosave = createDraftAutosave({
      store,
      key,
      initialSequence: restored.status === "restored" ? restored.snapshot.sequence : 0,
      onError: (error) => {
        throw error
      },
    })
    render()
    controls.saved.dataset["ready"] = "true"
  },
})
for (const language of ["ko", "en"] as const) {
  const textarea = controls[language]
  textarea.addEventListener("input", () => {
    const first = bundle[language].blocks[0]
    if (!first) throw new Error("Missing fixture block")
    first.markdown = textarea.value
    cursor = {
      language,
      anchor: { blockId: first.id, offset: textarea.selectionStart },
      focus: { blockId: first.id, offset: textarea.selectionEnd },
      scrollTop: textarea.scrollTop,
    }
    void persist()
  })
  textarea.addEventListener("select", () => {
    const first = bundle[language].blocks[0]
    if (!first) throw new Error("Missing fixture block")
    cursor = {
      language,
      anchor: { blockId: first.id, offset: textarea.selectionStart },
      focus: { blockId: first.id, offset: textarea.selectionEnd },
      scrollTop: textarea.scrollTop,
    }
    void persist()
  })
}
controls.titleKo.addEventListener("input", () => {
  bundle.ko.frontMatter.title = controls.titleKo.value
  void persist()
})
controls.titleEn.addEventListener("input", () => {
  bundle.en.frontMatter.title = controls.titleEn.value
  void persist()
})
controls.image.addEventListener("change", () => {
  const file = controls.image.files?.[0]
  if (!file) return
  bundle.images = [{ status: "pending", path: "images/pasted.svg", blob: file, mime: file.type }]
  controls.preview.src = URL.createObjectURL(file)
  void persist()
})
controls.expire.addEventListener("click", () => {
  const token = auth.tokens.getAccessToken()
  if (token) auth.tokens.setAccessToken(token, Date.now() - 1)
  auth.tokens.getAccessToken()
})
