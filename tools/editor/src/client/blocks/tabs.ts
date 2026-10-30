import { Node } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import type { NodeView, ViewMutationRecord } from "@tiptap/pm/view"
import {
  getParam,
  type ShortcodeParam,
  serializeContainerBlock,
  serializeShortcodeTag,
} from "../shortcode"
import { attrJson, parseJsonAttribute, toDelimiter, toParams } from "./attrs"
import { attrNullableString, el } from "./dom"
import { blockContent } from "./steps"
import { TabsView } from "./tabs-view"
import { SHORTCODE_TOKEN, shortcodeBlockKind, type TabToken } from "./tokenizers"

export const TABS_NODE = "tabs"
export const TAB_NODE = "tab"

export function tabName(params: readonly ShortcodeParam[], index: number): string {
  return getParam(params, "name") ?? `Tab ${index + 1}`
}

export function tabParams(name: string): ShortcodeParam[] {
  return [{ name: "name", value: name, quote: '"' }]
}

class TabView implements NodeView {
  readonly dom: HTMLElement
  readonly contentDOM: HTMLElement
  private readonly title: HTMLElement
  private node: PMNode

  constructor(node: PMNode) {
    this.node = node
    this.title = el("h4", { className: "tabs-panel-title", contenteditable: "false" })
    this.contentDOM = el("div", { className: "tabs-panel-body" })
    this.dom = el("div", { className: "tabs-panel", role: "tabpanel", "data-onsite-tab": true }, [
      this.title,
      this.contentDOM,
    ])
    this.render()
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) {
      return false
    }
    this.node = node
    this.render()
    return true
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.type !== "selection" && !this.contentDOM.contains(mutation.target)
  }

  private render(): void {
    this.title.textContent = tabName(toParams(attrJson(this.node.attrs, "params")), 0)
  }
}

export function createTabNode() {
  return Node.create({
    name: TAB_NODE,
    content: "block+",
    defining: true,
    isolating: true,

    addAttributes() {
      return {
        params: { default: tabParams("Tab 1"), rendered: false },
        delimiter: { default: "<", rendered: false },
      }
    },

    parseHTML() {
      return [
        {
          tag: "div[data-onsite-tab]",
          getAttrs: (element) => ({
            params: toParams(parseJsonAttribute(element, "data-onsite-tab")),
          }),
        },
      ]
    },

    renderHTML({ node }) {
      const params = toParams(attrJson(node.attrs, "params"))
      return [
        "div",
        { class: "tabs-panel", role: "tabpanel", "data-onsite-tab": JSON.stringify(params) },
        ["h4", { class: "tabs-panel-title" }, tabName(params, 0)],
        ["div", { class: "tabs-panel-body" }, 0],
      ]
    },

    renderMarkdown: (node, helpers) => {
      const attrs = node.attrs ?? {}
      return serializeContainerBlock(
        TAB_NODE,
        toParams(attrJson(attrs, "params")),
        helpers.renderChildren(node.content ?? [], "\n\n"),
        toDelimiter(attrJson(attrs, "delimiter")),
      )
    },

    addNodeView() {
      return ({ node }) => new TabView(node)
    },
  })
}

export function createTabsNode() {
  return Node.create({
    name: TABS_NODE,
    group: "block",
    content: `${TAB_NODE}+`,
    defining: true,
    isolating: true,
    markdownTokenName: SHORTCODE_TOKEN,

    addAttributes() {
      return {
        delimiter: { default: "<", rendered: false },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [{ tag: "div[data-onsite-tabs]" }]
    },

    renderHTML() {
      return ["div", { class: "tabs", "data-onsite-tabs": "" }, 0]
    },

    parseMarkdown: (token, helpers) => {
      if (shortcodeBlockKind(token) !== TABS_NODE) {
        return []
      }
      const tabs: unknown = token["tabs"]
      const entries = Array.isArray(tabs) ? (tabs as TabToken[]) : []
      return {
        type: TABS_NODE,
        attrs: {
          delimiter: toDelimiter(token["delimiter"]),
          raw: typeof token.raw === "string" ? token.raw : null,
        },
        content: entries.map((tab) => ({
          type: TAB_NODE,
          attrs: { params: toParams(tab.params), delimiter: toDelimiter(tab.delimiter) },
          content: blockContent(helpers.parseChildren(tab.tokens ?? [])),
        })),
      }
    },

    renderMarkdown: (node, helpers) => {
      const attrs = node.attrs ?? {}
      const raw = attrNullableString(attrs, "raw")
      if (raw !== null) {
        return raw
      }
      const delimiter = toDelimiter(attrJson(attrs, "delimiter"))
      const children = (node.content ?? []).map((child, index) =>
        helpers.renderChild ? helpers.renderChild(child, index) : helpers.renderChildren([child]),
      )
      return [
        serializeShortcodeTag({ name: TABS_NODE, delimiter }),
        ...children,
        serializeShortcodeTag({ name: TABS_NODE, closing: true, delimiter }),
      ].join("\n")
    },

    addNodeView() {
      return ({ node, editor, getPos }) => new TabsView(node, editor, getPos)
    },
  })
}
