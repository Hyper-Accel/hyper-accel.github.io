type Child = Node | string | null | undefined | false
type AttributeValue = string | number | boolean | undefined | ((event: Event) => void)

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, AttributeValue>> = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue
    if (typeof value === "function") {
      element.addEventListener(key.replace(/^on/, ""), value)
    } else if (value === true) {
      element.setAttribute(key, "")
    } else {
      element.setAttribute(key, String(value))
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    element.append(child)
  }
  return element
}

export function replaceChildren(parent: HTMLElement, ...children: readonly Child[]): void {
  parent.replaceChildren(
    ...children.filter((child): child is Node | string => Boolean(child) || child === ""),
  )
}
