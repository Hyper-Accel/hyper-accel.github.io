import "./recovery.css"
import type { UnpairedBundle } from "../../document/repair"
import type { PostBundle } from "../../shared/onsite/document"
import type { DraftSnapshot } from "../../shared/onsite/drafts"
import type { SiteServices } from "./contracts"
import type { RepairSnapshot } from "./repair-store"

export type RecoverySnapshot = DraftSnapshot | RepairSnapshot
export type RecoveryChoice = "keep-local" | "use-remote"

export function recoveryContent(snapshot: RecoverySnapshot): PostBundle | UnpairedBundle {
  return "type" in snapshot ? snapshot.unpaired : snapshot.bundle
}

export function compareRecovery(
  root: HTMLElement,
  versions: { readonly local: RecoverySnapshot; readonly remote: PostBundle | UnpairedBundle },
  signal: AbortSignal,
): Promise<RecoveryChoice | null> {
  const panel = document.createElement("section")
  panel.dataset["recoveryConflict"] = ""
  panel.setAttribute("aria-label", "보관된 초안과 원격 글 비교")
  const title = document.createElement("h2")
  title.textContent = "원격 글이 변경되었습니다"
  const description = document.createElement("p")
  description.textContent =
    "두 버전을 비교하고 이어서 편집할 내용을 선택하세요. 선택하기 전에는 보관된 내용을 바꾸지 않습니다."
  const actions = document.createElement("div")
  actions.className = "site-recovery-actions"
  const keep = document.createElement("button")
  keep.type = "button"
  keep.dataset["action"] = "keep-local"
  keep.textContent = "이 기기의 내용으로 계속 편집"
  const remote = document.createElement("button")
  remote.type = "button"
  remote.dataset["action"] = "use-remote"
  remote.textContent = "보관된 초안을 원격 내용으로 교체하고 편집"
  actions.append(keep, remote)
  const columns = document.createElement("div")
  columns.className = "site-recovery-versions"
  for (const [label, content] of [
    ["이 기기에 보관된 초안", recoveryContent(versions.local)],
    ["현재 원격 글", versions.remote],
  ] as const) {
    const column = document.createElement("section")
    const heading = document.createElement("h3")
    heading.textContent = label
    const head = document.createElement("p")
    head.textContent = `기준 커밋: ${content.headSha ?? "아직 저장하지 않음"}`
    column.append(heading, head)
    for (const language of ["ko", "en"] as const) {
      const doc = content[language]
      const heading = document.createElement("h4")
      heading.textContent =
        language === "ko" ? "한국어 본문과 frontmatter" : "English / frontmatter"
      const source = document.createElement("pre")
      source.lang = language
      source.textContent = [
        JSON.stringify(doc.frontMatter, null, 2),
        "--- (원본 YAML)",
        doc.rawFrontMatter,
        "---",
        ...doc.blocks.map((block) =>
          typeof block === "string" ? block : `<!-- b:${block.id} -->\n${block.markdown}`,
        ),
      ].join("\n\n")
      column.append(heading, source)
    }
    const images = document.createElement("h4")
    images.textContent = "이미지 목록 (미저장 이미지 포함)"
    const inventory = document.createElement("pre")
    inventory.textContent =
      content.images
        .map((image) =>
          image.status === "pending"
            ? `${image.path} · pending · ${image.mime} · ${image.blob.size} bytes`
            : `${image.path} · committed · ${image.mime} · ${image.sha}`,
        )
        .join("\n") || "이미지 없음"
    column.append(images, inventory)
    columns.append(column)
  }
  panel.append(title, description, actions, columns)
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
