import { expect, test } from "bun:test"
import { EDITOR_SHORTCUTS, shortcutLabel } from "./shortcuts"

test("keeps every action chord unique when the shortcut map is built", () => {
  // Given the complete editor dispatch map.
  const chords = EDITOR_SHORTCUTS.map((entry) => entry.keys)
  // When it is indexed by chord.
  const indexed = new Set(chords)
  // Then no action silently replaces another.
  expect(indexed.size).toBe(chords.length)
})

test("preserves comments and browser commands when Naver actions are mapped", () => {
  // Given shortcut IDs used by the command dispatcher.
  const map = new Map(EDITOR_SHORTCUTS.map((entry) => [String(entry.id), String(entry.keys)]))
  // When comment, video, save and strike bindings are read.
  // Then existing comments stay intact and conflicting Naver bindings are separated.
  expect(map.get("comment")).toBe("Mod-Alt-m")
  expect(map.get("youtube")).toBe("Mod-Alt-v")
  expect(map.get("save-shift")).toBe("Mod-Shift-s")
  expect(map.get("strike")).toBe("Mod-Alt-s")
  for (const browserKey of ["Mod-l", "Mod-r", "Mod-w", "Mod-t", "Mod-n", "Mod-Shift-t"])
    expect([...map.values()]).not.toContain(browserKey)
})

test("uses native modifier names when formatting each platform's shortcut map", () => {
  // Given a platform-neutral key chord.
  const keys = "Mod-Alt-v"
  // When it is formatted for both platforms.
  const labels = [shortcutLabel(keys, true), shortcutLabel(keys, false)]
  // Then macOS sees Cmd/Option and Windows/Linux sees Ctrl/Alt.
  expect(labels).toEqual(["⌘⌥V", "Ctrl+Alt+V"])
})
