import { PluginKey } from "@tiptap/pm/state"
export interface SlashState {
  readonly from: number
}
export const slashMenuKey = new PluginKey<SlashState | null>("onsiteSlashMenu")
