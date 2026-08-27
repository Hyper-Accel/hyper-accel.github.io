import type { Editor } from "@tiptap/core"
import type { PostDocument, PostSummary } from "../shared/contracts"
import { fetchPost, fetchPosts, persistPost, uploadImage } from "./api"
import { type EditorCommand, runEditorCommand, syncToolbarState } from "./commands"
import { errorMessage, renderPostRows, requiredElement } from "./dom"
import { createBlogEditor, insertImage } from "./editor"
import { prepareMarkdown, restoreMarkdown } from "./markdown"
import { setupRail } from "./rail"
import { applicationMarkup } from "./view"

export function mountApplication(root: HTMLElement): void {
  root.innerHTML = applicationMarkup()

  const postList = requiredElement<HTMLElement>("#post-list")
  const postResultStatus = requiredElement<HTMLElement>("#post-result-status")
  const search = requiredElement<HTMLInputElement>("#post-search")
  const title = requiredElement<HTMLTextAreaElement>("#post-title")
  const canvas = requiredElement<HTMLElement>("#article-canvas")
  const welcome = requiredElement<HTMLElement>("#welcome")
  const toolbar = requiredElement<HTMLElement>("#toolbar")
  const saveButton = requiredElement<HTMLButtonElement>("#save-button")
  const previewButton = requiredElement<HTMLButtonElement>("#preview-button")
  const saveState = requiredElement<HTMLElement>("#save-state")
  const meta = requiredElement<HTMLElement>("#post-meta")
  const kicker = requiredElement<HTMLElement>("#document-kicker")
  const toast = requiredElement<HTMLElement>("#toast")
  const rail = requiredElement<HTMLElement>("#post-rail")
  const imageInput = requiredElement<HTMLInputElement>("#image-input")
  const editorHost = requiredElement<HTMLElement>("#editor")
  const railOpen = requiredElement<HTMLButtonElement>("#rail-open")
  const railClose = requiredElement<HTMLButtonElement>("#rail-close")
  const railController = setupRail(rail, search, railOpen, railClose)

  let posts: readonly PostSummary[] = []
  let current: PostDocument | undefined
  let shortcodes: ReadonlyMap<string, string> = new Map()
  let loadingDocument = false
  let dirty = false
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  const showToast = (message: string, tone: "success" | "error"): void => {
    toast.textContent = message
    toast.dataset["tone"] = tone
    toast.hidden = false
    if (toastTimer) {
      clearTimeout(toastTimer)
    }
    toastTimer = setTimeout(() => {
      toast.hidden = true
    }, 4_000)
  }

  const updateSaveState = (label?: string): void => {
    saveButton.disabled = !current || !dirty
    previewButton.disabled = !current
    saveState.textContent = label ?? (dirty ? "저장되지 않은 변경" : "모든 변경 저장됨")
    saveState.dataset["dirty"] = String(dirty)
  }

  const markDirty = (): void => {
    if (loadingDocument || !current) {
      return
    }
    dirty = true
    updateSaveState()
  }

  const mediaUrl = (source: string): string => {
    if (!current || source.startsWith("/") || /^https?:\/\//.test(source)) {
      return source
    }
    const query = new URLSearchParams({ path: current.path, src: source })
    return `/api/media?${query.toString()}`
  }

  let editor: Editor
  const handleImage = async (file: File, position: number): Promise<void> => {
    if (!current) {
      return
    }
    updateSaveState("이미지 업로드 중…")
    try {
      const result = await uploadImage(current.path, file)
      insertImage(editor, position, result.previewUrl, file.name || "붙여넣은 이미지")
      markDirty()
      showToast(`${result.markdownPath}에 이미지를 저장했습니다.`, "success")
    } catch (error: unknown) {
      showToast(errorMessage(error), "error")
      updateSaveState()
    }
  }

  editor = createBlogEditor(editorHost, {
    mediaUrl,
    onChange: () => {
      markDirty()
      syncToolbarState(editor, toolbar)
    },
    onImage: handleImage,
  })

  const resizeTitle = (): void => {
    title.style.height = "auto"
    title.style.height = `${title.scrollHeight}px`
  }

  const renderPostList = (): void => {
    const count = renderPostRows(postList, posts, current?.path, search.value)
    postResultStatus.textContent = `${count}개의 글`
  }

  const openPost = async (path: string): Promise<void> => {
    if (dirty && !window.confirm("저장하지 않은 변경을 버리고 다른 글을 열까요?")) {
      return
    }
    updateSaveState("글 불러오는 중…")
    try {
      const document = await fetchPost(path)
      loadingDocument = true
      current = document
      const prepared = prepareMarkdown(document.body, document.path)
      shortcodes = prepared.shortcodes
      editor.commands.setContent(prepared.markdown, { contentType: "markdown" })
      title.value = document.title
      kicker.textContent = `${document.slug} / ${document.language.toUpperCase()}`
      meta.textContent = document.draft ? "초안 · 로컬 파일" : "발행됨 · 로컬 파일"
      dirty = false
      canvas.hidden = false
      welcome.hidden = true
      resizeTitle()
      renderPostList()
      localStorage.setItem("blog-editor:last-post", path)
    } catch (error: unknown) {
      showToast(errorMessage(error), "error")
    } finally {
      loadingDocument = false
      updateSaveState()
    }
  }

  const save = async (): Promise<void> => {
    if (!current || !dirty) {
      return
    }
    saveButton.disabled = true
    updateSaveState("Hugo 렌더링 확인 중…")
    try {
      const body = restoreMarkdown(editor.getMarkdown(), shortcodes)
      const result = await persistPost({
        path: current.path,
        title: title.value,
        body,
        revision: current.revision,
      })
      current = { ...current, title: title.value, body, revision: result.revision }
      posts = posts.map((post) =>
        post.path === current?.path ? { ...post, title: title.value } : post,
      )
      dirty = false
      renderPostList()
      showToast("저장했고 Hugo 렌더링까지 확인했습니다.", "success")
    } catch (error: unknown) {
      showToast(errorMessage(error), "error")
    } finally {
      updateSaveState()
    }
  }

  toolbar.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-command]")
    const command = button?.dataset["command"] as EditorCommand | undefined
    if (command) {
      runEditorCommand(editor, command)
      syncToolbarState(editor, toolbar)
    }
  })
  postList.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-path]")
    const path = button?.dataset["path"]
    if (path) {
      void openPost(path)
      railController.close()
    }
  })
  search.addEventListener("input", renderPostList)
  title.addEventListener("input", () => {
    resizeTitle()
    markDirty()
  })
  saveButton.addEventListener("click", () => void save())
  previewButton.addEventListener("click", () => {
    if (current) {
      window.open(`http://127.0.0.1:1413/posts/${current.slug}/`, "_blank", "noopener")
    }
  })
  requiredElement("#image-button").addEventListener("click", () => imageInput.click())
  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0]
    if (file) {
      void handleImage(file, editor.state.selection.from)
    }
    imageInput.value = ""
  })
  requiredElement("#link-button").addEventListener("click", () => {
    const previous = editor.getAttributes("link")["href"]
    const href = window.prompt("링크 주소", typeof previous === "string" ? previous : "https://")
    if (href === null) {
      return
    }
    if (href.trim() === "") {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
    }
  })
  requiredElement("#alt-button").addEventListener("click", () => {
    if (!editor.isActive("image")) {
      showToast("설명을 편집할 이미지를 먼저 선택하세요.", "error")
      return
    }
    const previous = editor.getAttributes("image")["alt"]
    const alt = window.prompt(
      "이미지를 보지 못하는 독자를 위한 설명",
      typeof previous === "string" ? previous : "",
    )
    if (alt !== null) {
      editor.chain().focus().updateAttributes("image", { alt }).run()
    }
  })
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      void save()
    }
  })

  void fetchPosts()
    .then((result) => {
      posts = result
      renderPostList()
      const last = localStorage.getItem("blog-editor:last-post")
      const initial = posts.find((post) => post.path === last) ?? posts[0]
      if (initial) {
        return openPost(initial.path)
      }
      return undefined
    })
    .catch((error: unknown) => showToast(errorMessage(error), "error"))
}
