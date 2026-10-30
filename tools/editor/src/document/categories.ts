export const ALLOWED_CATEGORIES = [
  "AI Hardware",
  "Memory and Storage",
  "Compilers and Kernels",
  "LLM and Models",
  "Infra and DevOps",
  "Engineering Culture",
  "Conference Reports",
] as const

export type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number]

export function isAllowedCategory(value: string): value is AllowedCategory {
  return (ALLOWED_CATEGORIES as readonly string[]).includes(value)
}
