import type { AgentEvent, AgentProvider } from "../../shared/agent-contracts"

type JsonObject = Record<string, unknown>

function objectValue(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function toolLabel(name: string, input: JsonObject | undefined): string {
  const detail =
    stringValue(input?.["file_path"]) ??
    stringValue(input?.["path"]) ??
    stringValue(input?.["command"])
  return detail ? `${name} · ${detail}` : name
}

function parseCodex(event: JsonObject): AgentEvent | undefined {
  const type = stringValue(event["type"])
  if (type === "thread.started") {
    const sessionId = stringValue(event["thread_id"])
    return sessionId ? { type: "session", sessionId } : undefined
  }
  if (type === "turn.completed") {
    return { type: "status", text: "작업을 완료했습니다." }
  }
  const item = objectValue(event["item"])
  if (type === "item.completed" && item?.["type"] === "agent_message") {
    const text = stringValue(item["text"])
    return text ? { type: "message", text } : undefined
  }
  if (type === "item.started" && item) {
    const command = stringValue(item["command"])
    const itemType = stringValue(item["type"])
    if (command || itemType) {
      return { type: "tool", label: command ?? itemType ?? "도구", status: "running" }
    }
  }
  if (type === "item.completed" && item && item["type"] !== "agent_message") {
    return {
      type: "tool",
      label: stringValue(item["command"]) ?? stringValue(item["type"]) ?? "도구",
      status: item["status"] === "failed" ? "failed" : "completed",
    }
  }
  return undefined
}

function parseOmo(event: JsonObject): AgentEvent | undefined {
  const type = stringValue(event["type"])
  if (type === "session") {
    const sessionId = stringValue(event["id"])
    return sessionId ? { type: "session", sessionId } : undefined
  }
  if (type === "message_update") {
    const update = objectValue(event["assistantMessageEvent"])
    const text = stringValue(update?.["delta"])
    return update?.["type"] === "text_delta" && text ? { type: "delta", text } : undefined
  }
  if (type === "tool_execution_start") {
    return {
      type: "tool",
      label: stringValue(event["toolName"]) ?? "도구",
      status: "running",
    }
  }
  if (type === "tool_execution_end") {
    return {
      type: "tool",
      label: stringValue(event["toolName"]) ?? "도구",
      status: event["isError"] === true ? "failed" : "completed",
    }
  }
  if (type === "turn_end") {
    return { type: "status", text: "작업을 완료했습니다." }
  }
  return undefined
}

function parseClaude(event: JsonObject): AgentEvent | undefined {
  if (event["type"] === "system" && event["subtype"] === "init") {
    const sessionId = stringValue(event["session_id"])
    return sessionId ? { type: "session", sessionId } : undefined
  }
  if (event["type"] === "stream_event") {
    const streamEvent = objectValue(event["event"])
    const delta = objectValue(streamEvent?.["delta"])
    const text = stringValue(delta?.["text"])
    if (
      streamEvent?.["type"] === "content_block_delta" &&
      delta?.["type"] === "text_delta" &&
      text
    ) {
      return { type: "delta", text }
    }
  }
  if (event["type"] === "assistant") {
    const message = objectValue(event["message"])
    const blocks = Array.isArray(message?.["content"]) ? message["content"] : []
    const tool = blocks.map(objectValue).find((block) => block?.["type"] === "tool_use")
    if (tool) {
      return {
        type: "tool",
        label: toolLabel(stringValue(tool["name"]) ?? "도구", objectValue(tool["input"])),
        status: "running",
      }
    }
  }
  if (event["type"] === "result") {
    return {
      type: "status",
      text: event["is_error"] === true ? "작업이 실패했습니다." : "작업을 완료했습니다.",
    }
  }
  return undefined
}

export function parseHarnessEvent(
  provider: AgentProvider,
  event: JsonObject,
): AgentEvent | undefined {
  switch (provider) {
    case "codex":
      return parseCodex(event)
    case "omo":
      return parseOmo(event)
    case "claude":
      return parseClaude(event)
  }
}
