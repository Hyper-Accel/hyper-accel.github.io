// Site/PaperMod variables; consumers reference names, not copied palette values.
export const SITE_THEME_TOKENS = {
  background: "--theme",
  surface: "--entry",
  text: "--primary",
  muted: "--secondary",
  content: "--content",
  border: "--border",
  codeBackground: "--code-bg",
  codeBlockBackground: "--code-block-bg",
  contentWidth: "--main-width",
  gap: "--gap",
  radius: "--radius",
} as const
export const EDITOR_THEME_TOKENS = {
  accent: "--editor-accent",
  focus: "--editor-focus",
  danger: "--editor-danger",
  selection: "--editor-selection",
  sidebarWidth: "--editor-sidebar-width",
} as const
