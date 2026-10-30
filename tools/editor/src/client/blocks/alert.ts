import { Node } from "@tiptap/core"
import { ALERT_LABELS, isAlertType, serializeAlert } from "../shortcode"
import { AlertView } from "./alert-view"
import { alertIcon, alertType } from "./alert-visual"
import { attrNullableString } from "./dom"
import { blockContent } from "./steps"
import { type AlertToken, alertTokenizer } from "./tokenizers"

export const ALERT_NODE = "alert"

export function createAlertNode() {
  return Node.create({
    name: ALERT_NODE,
    group: "block",
    content: "block+",
    defining: true,

    addAttributes() {
      return {
        type: {
          default: "NOTE",
          parseHTML: (element) => {
            const value = element.getAttribute("data-type")
            return isAlertType(value) ? value : "NOTE"
          },
          renderHTML: (attributes) => ({ "data-type": alertType(attributes) }),
        },
        title: {
          default: null,
          parseHTML: (element) => element.getAttribute("data-title") || null,
          renderHTML: (attributes) => {
            const title = attrNullableString(attributes, "title")
            return title ? { "data-title": title } : {}
          },
        },
        raw: { default: null, rendered: false },
      }
    },

    parseHTML() {
      return [{ tag: "blockquote[data-onsite-alert]" }]
    },

    renderHTML({ node, HTMLAttributes }) {
      const type = alertType(node.attrs)
      const title = attrNullableString(node.attrs, "title")
      const head = title
        ? [
            "p",
            { class: "alert-title" },
            alertIcon(type),
            ["span", { class: "alert-type" }, ALERT_LABELS[type]],
            ["span", { class: "alert-heading" }, title],
          ]
        : [
            "p",
            { class: "alert-title" },
            alertIcon(type),
            ["span", { class: "alert-type" }, ALERT_LABELS[type]],
          ]
      return [
        "blockquote",
        {
          ...HTMLAttributes,
          class: `alert alert-${type.toLowerCase()}`,
          role: "note",
          "data-onsite-alert": "",
        },
        head,
        ["div", { class: "alert-body" }, 0],
      ]
    },

    markdownTokenizer: alertTokenizer,

    parseMarkdown: (token, helpers) => {
      const alert = token as AlertToken
      return {
        type: ALERT_NODE,
        attrs: {
          type: isAlertType(alert.alertType) ? alert.alertType : "NOTE",
          title: typeof alert.title === "string" && alert.title !== "" ? alert.title : null,
          raw: typeof token.raw === "string" ? token.raw : null,
        },
        content: blockContent(helpers.parseChildren(token.tokens ?? [])),
      }
    },

    renderMarkdown: (node, helpers) => {
      const attrs = node.attrs ?? {}
      return (
        attrNullableString(attrs, "raw") ??
        serializeAlert(
          { type: alertType(attrs), title: attrNullableString(attrs, "title") },
          helpers.renderChildren(node.content ?? [], "\n\n"),
        )
      )
    },

    addNodeView() {
      return ({ node, editor, getPos }) => new AlertView(node, editor, getPos)
    },
  })
}
