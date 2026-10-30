/** Vertical chrome affects heading jumps and caret scrolling only in bar mode. */
export function observeEditorOcclusion(toolbox: HTMLElement): ResizeObserver {
  const header = document.querySelector<HTMLElement>(".tr-header")
  const observer = new ResizeObserver(() => {
    const sticky = header && getComputedStyle(header).position === "sticky"
    const barHeight = toolbox.hidden ? 0 : toolbox.offsetHeight + 40
    document.documentElement.style.setProperty(
      "--composer-sticky-top",
      `${sticky ? header.offsetHeight : 0}px`,
    )
    document.documentElement.style.setProperty("--composer-toolbox-height", `${barHeight}px`)
    document.body.style.setProperty(
      "--reading-offset",
      `${(header?.offsetHeight ?? 0) + barHeight + 24}px`,
    )
  })
  if (header) observer.observe(header)
  observer.observe(toolbox)
  return observer
}

export function editorTopInset(): number {
  const header = document.querySelector(".tr-header")?.getBoundingClientRect().bottom ?? 0
  const toolbox = document.querySelector<HTMLElement>(".composer-toolbox")
  const bottom = toolbox && !toolbox.hidden ? toolbox.getBoundingClientRect().bottom + 40 : header
  return Math.max(0, header, bottom) + 12
}
