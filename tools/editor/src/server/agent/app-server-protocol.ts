export type JsonObject = Record<string, unknown>
export type RequestId = number | string

export type PendingRequest = {
  readonly resolve: (value: JsonObject) => void
  readonly reject: (error: Error) => void
  readonly timeout: ReturnType<typeof setTimeout>
}

export type TurnWaiter = {
  readonly resolve: () => void
  readonly reject: (error: Error) => void
}

export function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
