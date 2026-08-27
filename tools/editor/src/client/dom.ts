import type { PostSummary } from "../shared/contracts"

export function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`필수 화면 요소를 찾을 수 없습니다: ${selector}`)
  }
  return element
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
}

export function renderPostRows(
  container: HTMLElement,
  posts: readonly PostSummary[],
  selectedPath: string | undefined,
  searchQuery: string,
): number {
  const query = searchQuery.trim().toLocaleLowerCase("ko")
  const filtered = posts.filter(
    (post) =>
      post.title.toLocaleLowerCase("ko").includes(query) ||
      post.slug.toLocaleLowerCase("ko").includes(query),
  )
  container.replaceChildren()
  if (filtered.length === 0) {
    const empty = document.createElement("p")
    empty.className = "empty-list"
    empty.textContent = "일치하는 글이 없습니다."
    container.append(empty)
    return 0
  }
  for (const post of filtered) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "post-row"
    button.dataset["path"] = post.path
    button.dataset["selected"] = String(selectedPath === post.path)
    const heading = document.createElement("strong")
    heading.textContent = post.title
    const detail = document.createElement("span")
    detail.textContent = `${post.language.toUpperCase()} · ${post.slug}${post.draft ? " · 초안" : ""}`
    button.append(heading, detail)
    container.append(button)
  }
  return filtered.length
}
