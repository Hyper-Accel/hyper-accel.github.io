import type { Editor } from "@tiptap/core"
import type { PostDocument, PostSummary } from "../shared/contracts"
import { connectAgentContext } from "./agent-context-attachment"
import { setupAgentController } from "./agent-controller"
import { fetchPost, fetchPosts, persistPost, uploadImage } from "./api"
import { applyMergedContent } from "./apply-merge"
import { type EditorCommand, runEditorCommand, syncToolbarState } from "./commands"
import { setupCoverEditor } from "./cover-editor"
import { setupCreatePost } from "./create-post"
import { errorMessage, renderPostRows, requiredElement, resizeTextarea } from "./dom"
import { createBlogEditor, insertImage } from "./editor"
import { mediaPreviewUrl, prepareMarkdown, restoreMarkdown } from "./markdown"
import { setupRail } from "./rail"
import { createToastController } from "./toast"
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
  let saving = false
  let coverBusy = false
  let changeVersion = 0
  let bodyVersion = 0
  let bodyEdited = false
  let documentGeneration = 0
  let loadedGeneration = 0
  let canonicalVersion = 0
  let revisionInvalid = false
  let coverEditor: ReturnType<typeof setupCoverEditor> | undefined
  let agentController: ReturnType<typeof setupAgentController> | undefined

  const showToast = createToastController(toast)

  const updateSaveState = (label?: string): void => {
    saveButton.disabled = !current || !dirty || saving || coverBusy || revisionInvalid
    previewButton.disabled = !current || saving || coverBusy

    coverEditor?.setDisabled(saving || loadingDocument)
    saveState.textContent = revisionInvalid
      ? "파일이 변경됐습니다. 현재 변경을 복사한 뒤 글을 다시 열어 주세요."
      : (label ?? (dirty ? "저장되지 않은 변경" : "모든 변경 저장됨"))
    saveState.dataset["dirty"] = String(dirty)
  }

  const markDirty = (): void => {
    if (loadingDocument || !current) {
      return
    }
    dirty = true
    changeVersion++
    updateSaveState()
  }

  coverEditor = setupCoverEditor({
    onChange: markDirty,
    onBusyChange: (busy) => {
      coverBusy = busy
      updateSaveState(busy ? "대표 이미지 업로드 중…" : undefined)
    },
  })

  const mediaUrl = (source: string): string => mediaPreviewUrl(current?.path, source)

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
      if (!loadingDocument && current) {
        bodyEdited = true
        bodyVersion++
      }
      markDirty()
      syncToolbarState(editor, toolbar)
    },
    onImage: handleImage,
  })

  const renderPostList = (): void => {
    const count = renderPostRows(postList, posts, current?.path, search.value)
    postResultStatus.textContent = `${count}개의 글`
  }

  const showDocument = (document: PostDocument): void => {
    loadingDocument = true
    try {
      current = document
      coverEditor?.showPost(document)
      const prepared = prepareMarkdown(document.body, document.path)
      shortcodes = prepared.shortcodes
      editor.commands.setContent(prepared.markdown, { contentType: "markdown" })
      title.value = document.title
      kicker.textContent = `${document.slug} / ${document.language.toUpperCase()}`
      meta.textContent = document.draft ? "초안 · 로컬 파일" : "발행됨 · 로컬 파일"
      dirty = false
      bodyEdited = false
      bodyVersion++
      revisionInvalid = false
      canvas.hidden = false
      welcome.hidden = true
      resizeTextarea(title)
      renderPostList()
    } finally {
      loadingDocument = false
    }
  }

  const openPost = async (path: string): Promise<void> => {
    if (dirty && !window.confirm("저장하지 않은 변경을 버리고 다른 글을 열까요?")) {
      return
    }
    const generation = ++documentGeneration
    updateSaveState("글 불러오는 중…")
    try {
      await agentController?.reset()
      if (generation !== documentGeneration) return
      let document: PostDocument
      let fetchedVersion: number
      do {
        fetchedVersion = canonicalVersion
        document = await fetchPost(path)
        if (generation !== documentGeneration) return
      } while (fetchedVersion !== canonicalVersion)
      showDocument(document)
      loadedGeneration = generation
      await agentController?.showPost(document.path)
      if (generation !== documentGeneration) return
      localStorage.setItem("blog-editor:last-post", path)
    } catch (error: unknown) {
      showToast(errorMessage(error), "error")
    } finally {
      updateSaveState()
    }
  }

  const save = async (): Promise<boolean> => {
    if (!current || saving) {
      return false
    }
    if (revisionInvalid || loadedGeneration !== documentGeneration) {
      showToast("현재 변경을 복사한 뒤 글을 다시 열어 최신 파일을 확인해 주세요.", "error")
      return false
    }
    if (coverBusy) {
      showToast("대표 이미지 업로드가 끝난 뒤 저장해 주세요.", "error")
      return false
    }
    if (!dirty) {
      return true
    }
    const snapshot = current
    const nextTitle = title.value
    const version = changeVersion
    const savedBodyVersion = bodyVersion
    const generation = documentGeneration
    const coverChange = coverEditor?.getChange() ?? {}
    saving = true
    updateSaveState("Hugo 렌더링 확인 중…")
    try {
      // Tiptap cannot round-trip every Markdown construct. Only serialize real body edits.
      const body = bodyEdited ? restoreMarkdown(editor.getMarkdown(), shortcodes) : snapshot.body
      const result = await persistPost({
        path: snapshot.path,
        title: nextTitle,
        body,
        revision: snapshot.revision,
        ...coverChange,
      })
      canonicalVersion++
      if (generation !== documentGeneration) {
        if (current?.path !== snapshot.path || loadedGeneration !== documentGeneration) return true
        const reopenedGeneration = documentGeneration
        const reopenedVersion = changeVersion
        const invalidate = (): void => {
          revisionInvalid = true
          dirty = true
          showToast(
            "이전 저장으로 파일이 변경됐습니다. 현재 변경을 복사한 뒤 글을 다시 열어 주세요.",
            "error",
          )
        }
        if (dirty || coverBusy) {
          invalidate()
          return false
        }
        try {
          const document = await fetchPost(snapshot.path)
          if (reopenedGeneration !== documentGeneration) return true
          if (dirty || coverBusy || changeVersion !== reopenedVersion) {
            invalidate()
            return false
          }
          showDocument(document)
        } catch (error: unknown) {
          if (reopenedGeneration !== documentGeneration) return true
          invalidate()
          showToast(errorMessage(error), "error")
          return false
        }
        return true
      }
      current = {
        ...snapshot,
        title: nextTitle,
        body: bodyVersion === savedBodyVersion ? body : current.body,
        revision: result.revision,
        ...(coverChange.cover !== undefined ? { cover: coverChange.cover } : {}),
      }
      coverEditor?.markSaved(coverChange.cover)
      if (bodyVersion === savedBodyVersion) bodyEdited = false
      posts = posts.map((post) =>
        post.path === snapshot.path ? { ...post, title: nextTitle } : post,
      )
      dirty = changeVersion !== version || (coverEditor?.isDirty() ?? false)
      renderPostList()
      showToast("저장했고 Hugo 렌더링까지 확인했습니다.", "success")
      return true
    } catch (error: unknown) {
      showToast(errorMessage(error), "error")
      return false
    } finally {
      saving = false
      updateSaveState()
    }
  }

  setupCreatePost({
    beforeOpen: async () => {
      if (!dirty) return true
      if (!window.confirm("새 글을 만들기 전에 현재 글의 변경을 저장할까요?")) return false
      return save()
    },
    onCreated: async (path) => {
      try {
        posts = await fetchPosts()
        search.value = ""
        renderPostList()
        await openPost(path)
        railController.close()
        showToast("한국어·영어 글 파일을 만들었습니다. 내용을 작성해 주세요.", "success")
      } catch (error: unknown) {
        showToast(
          `글은 생성됐지만 목록을 갱신하지 못했습니다. 새로고침해 주세요. ${errorMessage(error)}`,
          "error",
        )
      }
    },
  })

  agentController = setupAgentController({
    getDocument: () => current,
    ensureSaved: save,
    mediaUrl,
    showToast,
    applyMerged: (nextTitle, body) => {
      if (!current) {
        return
      }
      loadingDocument = true
      const merged = applyMergedContent(current, editor, title, nextTitle, body)
      shortcodes = merged.shortcodes
      current = merged.document
      loadingDocument = false
      // Preserve explicit merged Markdown until the user edits the body again.
      bodyEdited = false
      bodyVersion++
      resizeTextarea(title)
      markDirty()
      canvas.hidden = false
      welcome.hidden = true
      showToast("선택한 AI 변경을 편집기에 적용했습니다.", "success")
    },
  })
  connectAgentContext(
    editor,
    () => shortcodes,
    (context) => agentController?.attachContext(context),
  )

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
    resizeTextarea(title)
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
