import type { Extensions } from "@tiptap/core"
import "./blocks.css"
import { ALERT_NODE, createAlertNode } from "./alert"
import { COMPARE_NODE, createCompareNode } from "./compare"
import { DropZones } from "./drop-zones"
import { FootnoteDefinition, FootnoteOrder, FootnoteReference, FootnoteSection } from "./footnotes"
import { createImageNode, IMAGE_NODE } from "./image"
import {
  createMathBlockNode,
  createMathInlineNode,
  MATH_BLOCK_NODE,
  MATH_INLINE_NODE,
} from "./math"
import { type BlockExtensionOptions, type ImageChoice, resolveBlockOptions } from "./options"
import { createPairNode, PAIR_NODE } from "./pair"
import { RAW_TRACKED_NODES, RawTracking } from "./raw-tracking"
import { createSlashMenuExtension, type SlashMenuItem, slashMenuItems } from "./slash-menu"
import { createSlidesNode, SLIDES_NODE } from "./slides"
import { createStepsNode, STEPS_NODE } from "./steps"
import { createTabNode, createTabsNode, TAB_NODE, TABS_NODE } from "./tabs"
import { createUnknownShortcodeNode, UNKNOWN_SHORTCODE_NODE } from "./unknown-shortcode"
import { Youtube } from "./youtube"

export type { BlockExtensionOptions, ImageChoice, SlashMenuItem }
export {
  ALERT_NODE,
  COMPARE_NODE,
  IMAGE_NODE,
  MATH_BLOCK_NODE,
  MATH_INLINE_NODE,
  PAIR_NODE,
  RAW_TRACKED_NODES,
  SLIDES_NODE,
  STEPS_NODE,
  slashMenuItems,
  TAB_NODE,
  TABS_NODE,
  UNKNOWN_SHORTCODE_NODE,
}

export const BLOCK_NODE_NAMES: readonly string[] = [
  "youtube",
  "footnoteReference",
  "footnoteDefinition",
  "footnoteSection",
  IMAGE_NODE,
  PAIR_NODE,
  SLIDES_NODE,
  STEPS_NODE,
  COMPARE_NODE,
  TABS_NODE,
  TAB_NODE,
  ALERT_NODE,
  MATH_BLOCK_NODE,
  MATH_INLINE_NODE,
  UNKNOWN_SHORTCODE_NODE,
]

/**
 * Tiptap extensions for the on-site block syntax. Register them alongside StarterKit and
 * `@tiptap/markdown`; they replace `@tiptap/extension-image` and the old `createHugoShortcode`.
 */
export function createBlockExtensions(options: BlockExtensionOptions = {}): Extensions {
  const resolved = resolveBlockOptions(options)
  const extensions: Extensions = [
    createImageNode(resolved),
    createPairNode(resolved),
    createSlidesNode(resolved),
    createStepsNode(),
    createCompareNode(resolved),
    createTabsNode(),
    createTabNode(),
    createAlertNode(),
    createMathBlockNode(),
    createMathInlineNode(),
    Youtube,
    FootnoteReference,
    FootnoteDefinition,
    FootnoteSection,
    FootnoteOrder,
    createUnknownShortcodeNode(resolved),
    RawTracking,
  ]
  if (resolved.dropZones) {
    extensions.push(DropZones)
  }
  if (resolved.slashMenu) {
    extensions.push(createSlashMenuExtension())
  }
  return extensions
}
