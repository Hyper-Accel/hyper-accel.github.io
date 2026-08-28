import type { Editor } from "@tiptap/core"
import type { AgentContext } from "../shared/agent-contracts"
import { captureAgentContext } from "./agent-context"
import { restoreMarkdown } from "./markdown"
import { setupSelectionAttachment } from "./selection-attachment"

export function connectAgentContext(
  editor: Editor,
  getShortcodes: () => ReadonlyMap<string, string>,
  attach: (context: AgentContext) => void,
): void {
  setupSelectionAttachment(editor, {
    capture: () =>
      captureAgentContext(editor, (markdown) => restoreMarkdown(markdown, getShortcodes())),
    onAttach: attach,
  })
}
