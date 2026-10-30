(() => {
  // A post opened with ?edit (or ?review=<PR number>) is edited right there: the editor takes the
  // place of the article, inside the same page.
  const params = new URLSearchParams(location.search)
  const main = document.querySelector("main")
  if (main && document.querySelector("[data-editor-entry]") && (params.has("edit") || params.has("review"))) {
    main.style.visibility = "hidden"
    fetch("/editor/manifest.json")
      .then((response) => response.json())
      .then((manifest) => {
        const app = manifest["../src/client/site.ts"]
        for (const href of app.css ?? []) {
          const style = document.createElement("link")
          style.rel = "stylesheet"
          style.href = `/editor/${href}`
          document.head.append(style)
        }
        // The editor's font menu (same list as layouts/partials/d/fonts.html).
        if (!document.querySelector('link[href*="Nanum+Myeongjo"]')) {
          const fonts = document.createElement("link")
          fonts.rel = "stylesheet"
          fonts.href =
            "https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700&family=Nanum+Myeongjo:wght@400;700&family=Noto+Serif+KR:wght@400;700&family=Gowun+Dodum&family=Gowun+Batang:wght@400;700&family=Nanum+Pen+Script&family=Nanum+Gothic+Coding:wght@400;700&display=swap"
          document.head.append(fonts)
        }
        const root = document.createElement("div")
        root.id = "app"
        root.className = "onsite-app"
        main.replaceChildren(root)
        main.style.visibility = ""
        const script = document.createElement("script")
        script.type = "module"
        script.src = `/editor/${app.file}`
        document.head.append(script)
      })
      .catch(() => {
        main.style.visibility = ""
      })
    return
  }
  let returning = false
  try {
    returning = localStorage.getItem("onsite:returning-editor") !== null
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
  }
  if (!returning) return
  // Home page: load the editor's "작성 중인 글" shelf, for returning editors only.
  const shelf = document.querySelector("[data-editor-drafts]")
  if (shelf?.dataset.module) {
    for (const href of (shelf.dataset.styles ?? "").split(" ").filter(Boolean)) {
      const style = document.createElement("link")
      style.rel = "stylesheet"
      style.href = href
      document.head.append(style)
    }
    const script = document.createElement("script")
    script.type = "module"
    script.src = shelf.dataset.module
    document.head.append(script)
  }
  // Signed in on this tab (sessionStorage): elsewhere the pencil starts a new post, so the header
  // shows that the login took.
  let signedIn = false
  try {
    signedIn = sessionStorage.getItem("onsite:session") !== null
  } catch (error) {
    if (!(error instanceof DOMException)) throw error
  }
  if (signedIn) {
    for (const link of document.querySelectorAll(".tr-editor-link:not([data-editor-entry])")) {
      link.setAttribute("href", "/editor-new/")
      const tip = document.getElementById(link.getAttribute("aria-labelledby") ?? "")
      if (tip) tip.textContent = "새 글 쓰기"
    }
  }
  // Returning editors on a post: the header pencil opens this post in the editor.
  for (const link of document.querySelectorAll("[data-editor-entry]")) {
    link.setAttribute("href", link.getAttribute("data-editor-entry"))
    const tip = document.getElementById(link.getAttribute("aria-labelledby") ?? "")
    if (tip) tip.textContent = "이 글 편집"
  }
})()
