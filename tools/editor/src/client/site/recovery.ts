import "./recovery.css"
import type { UnpairedBundle } from "../../document/repair"
import type { PostBundle } from "../../shared/onsite/document"
import type { DraftSnapshot } from "../../shared/onsite/drafts"
import type { SiteServices } from "./contracts"
import type { RepairSnapshot } from "./repair-store"
import { diffLines } from "./text-diff"

export type RecoverySnapshot = DraftSnapshot | RepairSnapshot
export type RecoveryChoice = "keep-local" | "use-remote"

export function recoveryContent(snapshot: RecoverySnapshot): PostBundle | UnpairedBundle {
  return "type" in snapshot ? snapshot.unpaired : snapshot.bundle
}

type Content = PostBundle | UnpairedBundle
type Language = "ko" | "en"

const LANGUAGE_NAME: Record<Language, string> = { ko: "한국어", en: "영어" }
const FIELD_NAME: Record<string, string> = {
  title: "제목",
  description: "설명",
  authors: "작성자",
  editors: "편집 허용",
  categories: "카테고리",
  tags: "태그",
  series: "시리즈",
  series_idx: "시리즈 순서",
  cover: "커버",
  date: "작성일",
  draft: "사이트에 숨김",
}

interface BlockChange {
  readonly where: string
  readonly kind: "changed" | "local-only" | "remote-only"
  readonly remote: string
  readonly local: string
}

/**
 * The blocks of one language, matched by block id (legacy blocks without ids, by position). Blank
 * lines at a block's end are not a difference.
 */
function blockChanges(local: Content, remote: Content, language: Language): BlockChange[] {
  const entries = (content: Content): { key: string; markdown: string }[] =>
    content[language].blocks.map((block, index) =>
      typeof block === "string"
        ? { key: `#${index}`, markdown: block.trimEnd() }
        : { key: block.id, markdown: block.markdown.trimEnd() },
    )
  const mine = entries(local)
  const theirs = new Map(entries(remote).map((entry, index) => [entry.key, { ...entry, index }]))
  const changes: BlockChange[] = []
  mine.forEach((entry, index) => {
    const where = `${LANGUAGE_NAME[language]} · ${index + 1}번째 블록`
    const other = theirs.get(entry.key)
    theirs.delete(entry.key)
    if (!other) changes.push({ where, kind: "local-only", remote: "", local: entry.markdown })
    else if (other.markdown !== entry.markdown)
      changes.push({ where, kind: "changed", remote: other.markdown, local: entry.markdown })
  })
  for (const other of theirs.values())
    changes.push({
      where: `${LANGUAGE_NAME[language]} · 원격 ${other.index + 1}번째 블록`,
      kind: "remote-only",
      remote: other.markdown,
      local: "",
    })
  return changes
}

/** Front-matter fields whose values differ, per language. */
function fieldChanges(local: Content, remote: Content, language: Language): BlockChange[] {
  const mine = local[language].frontMatter as Record<string, unknown>
  const theirs = remote[language].frontMatter as Record<string, unknown>
  const show = (value: unknown): string =>
    value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value)
  return [...new Set([...Object.keys(theirs), ...Object.keys(mine)])]
    .filter((key) => show(mine[key]) !== show(theirs[key]))
    .map((key) => ({
      where: `${LANGUAGE_NAME[language]} · 글 정보 · ${FIELD_NAME[key] ?? key}`,
      kind: "changed" as const,
      remote: show(theirs[key]),
      local: show(mine[key]),
    }))
}

function diffView(change: BlockChange): HTMLElement {
  const view = document.createElement("div")
  view.className = "recovery-diff"
  for (const line of diffLines(change.remote, change.local)) {
    if (change.kind === "local-only" && line.type === "del") continue
    if (change.kind === "remote-only" && line.type === "add") continue
    const row = document.createElement("div")
    row.className = `recovery-diff__line is-${line.type}`
    const sign = document.createElement("span")
    sign.className = "recovery-diff__sign"
    sign.textContent = line.type === "add" ? "+" : line.type === "del" ? "−" : " "
    const text = document.createElement("span")
    text.className = "recovery-diff__text"
    for (const part of line.parts) {
      if (part.type === "same") text.append(part.value)
      else {
        const mark = document.createElement("mark")
        mark.textContent = part.value
        text.append(mark)
      }
    }
    if (text.textContent === "") text.append("\u00a0")
    row.append(sign, text)
    view.append(row)
  }
  return view
}

/**
 * The draft on this device and the post on GitHub differ: like a GitHub diff, only what differs is
 * shown (blocks, post details, pictures), the remote as − and this device as +, then the choice.
 */
export function compareRecovery(
  root: HTMLElement,
  versions: { readonly local: RecoverySnapshot; readonly remote: Content },
  signal: AbortSignal,
): Promise<RecoveryChoice | null> {
  const local = recoveryContent(versions.local)
  const remoteContent = versions.remote
  const blocks = (["ko", "en"] as const).map((language) => ({
    language,
    changes: [
      ...fieldChanges(local, remoteContent, language),
      ...blockChanges(local, remoteContent, language),
    ],
  }))
  const localImages = new Set(local.images.map((image) => image.path))
  const remoteImages = new Set(remoteContent.images.map((image) => image.path))
  const imagesAdded = [...localImages].filter((path) => !remoteImages.has(path))
  const imagesRemoved = [...remoteImages].filter((path) => !localImages.has(path))

  const panel = document.createElement("section")
  panel.dataset["recoveryConflict"] = ""
  panel.setAttribute("aria-label", "이 기기의 초안과 원격 글 비교")
  const title = document.createElement("h2")
  title.textContent = "이 기기의 초안과 원격 글이 다릅니다"
  const summary = document.createElement("p")
  summary.className = "recovery-summary"
  const counts = [
    ...blocks.map(({ language, changes }) =>
      changes.length ? `${LANGUAGE_NAME[language]} ${changes.length}곳` : "",
    ),
    imagesAdded.length + imagesRemoved.length
      ? `그림 ${imagesAdded.length + imagesRemoved.length}개`
      : "",
  ].filter(Boolean)
  summary.textContent = counts.length ? counts.join(" · ") : "내용은 같고 기준 커밋만 다릅니다"
  const legend = document.createElement("p")
  legend.className = "recovery-legend"
  legend.innerHTML =
    '<span class="is-del">− 원격 글</span><span class="is-add">+ 이 기기의 초안</span>'

  const list = document.createElement("div")
  list.className = "recovery-changes"
  for (const { changes } of blocks)
    for (const change of changes) {
      const card = document.createElement("section")
      card.className = "recovery-change"
      const head = document.createElement("header")
      const where = document.createElement("span")
      where.textContent = change.where
      const kind = document.createElement("span")
      kind.className = `recovery-change__kind is-${change.kind}`
      kind.textContent =
        change.kind === "changed"
          ? "바뀜"
          : change.kind === "local-only"
            ? "이 기기에만"
            : "원격에만"
      head.append(where, kind)
      card.append(head, diffView(change))
      list.append(card)
    }
  if (imagesAdded.length + imagesRemoved.length) {
    const card = document.createElement("section")
    card.className = "recovery-change"
    const head = document.createElement("header")
    head.textContent = "그림"
    const view = document.createElement("div")
    view.className = "recovery-diff"
    for (const [paths, type] of [
      [imagesRemoved, "del"],
      [imagesAdded, "add"],
    ] as const)
      for (const path of paths) {
        const row = document.createElement("div")
        row.className = `recovery-diff__line is-${type}`
        row.innerHTML =
          '<span class="recovery-diff__sign"></span><span class="recovery-diff__text"></span>'
        const [sign, text] = row.children
        if (sign) sign.textContent = type === "add" ? "+" : "−"
        if (text) text.textContent = path
        view.append(row)
      }
    card.append(head, view)
    list.append(card)
  }

  const actions = document.createElement("div")
  actions.className = "site-recovery-actions"
  const keep = document.createElement("button")
  keep.type = "button"
  keep.className = "is-primary"
  keep.dataset["action"] = "keep-local"
  keep.textContent = "이 기기의 내용으로 계속 편집"
  const remote = document.createElement("button")
  remote.type = "button"
  remote.dataset["action"] = "use-remote"
  remote.textContent = "원격 글로 교체하고 편집"
  actions.append(keep, remote)
  panel.append(title, summary, legend, list, actions)
  root.replaceChildren(panel)
  return new Promise((resolve) => {
    const finish = (choice: RecoveryChoice | null): void => {
      signal.removeEventListener("abort", abort)
      keep.removeEventListener("click", onKeep)
      remote.removeEventListener("click", onRemote)
      keep.disabled = true
      remote.disabled = true
      resolve(choice)
    }
    const onKeep = (): void => finish("keep-local")
    const onRemote = (): void => finish("use-remote")
    const abort = (): void => finish(null)
    keep.addEventListener("click", onKeep)
    remote.addEventListener("click", onRemote)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
  })
}

export async function saveRecoveryChoice(
  services: SiteServices,
  selection: {
    readonly local: RecoverySnapshot
    readonly remote: PostBundle | UnpairedBundle
    readonly choice: RecoveryChoice
  },
): Promise<RecoverySnapshot> {
  const { local, remote, choice } = selection
  const session = services.auth.getSession()
  if (
    !session?.canWrite ||
    session.userId !== local.key.userId ||
    session.repository.owner !== local.key.owner ||
    session.repository.name !== local.key.repository
  ) {
    throw new Error("이 초안을 복구하려면 원래 계정으로 로그인해 주세요.")
  }
  const [draft, repair] = await Promise.all([
    services.drafts.load(local.key),
    services.repairs.load(local.key),
  ])
  const sequence = Math.max(local.sequence, draft?.sequence ?? 0, repair?.sequence ?? 0) + 1
  const content = choice === "keep-local" ? recoveryContent(local) : remote
  if ("snapshotHash" in content) {
    const snapshot: DraftSnapshot = {
      version: 1,
      key: local.key,
      bundle: { ...content, headSha: remote.headSha },
      cursor: choice === "keep-local" && !("type" in local) ? local.cursor : null,
      savedAt: Date.now(),
      sequence,
    }
    await services.drafts.save(snapshot)
    if (repair) await services.repairs.remove(local.key)
    return snapshot
  }
  const snapshot: RepairSnapshot = {
    type: "repair",
    version: 1,
    key: local.key,
    unpaired: { ...content, headSha: remote.headSha },
    language: choice === "keep-local" && "type" in local ? local.language : "ko",
    scrollTop: choice === "keep-local" && "type" in local ? local.scrollTop : 0,
    sequence,
  }
  await services.repairs.save(snapshot)
  if (draft) await services.drafts.remove(local.key)
  return snapshot
}
