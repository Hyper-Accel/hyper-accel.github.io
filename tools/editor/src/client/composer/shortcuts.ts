export const EDITOR_SHORTCUTS = [
  { id: "bold", label: "굵게", keys: "Mod-b" },
  { id: "italic", label: "기울임", keys: "Mod-i" },
  { id: "underline", label: "밑줄", keys: "Mod-u" },
  { id: "strike", label: "취소선", keys: "Mod-Alt-s" },
  { id: "subscript", label: "아래첨자", keys: "Mod-Shift-y" },
  { id: "superscript", label: "위첨자", keys: "Mod-Shift-u" },
  { id: "highlight", label: "형광펜", keys: "Mod-Shift-h" },
  { id: "code", label: "인라인 코드", keys: "Mod-e" },
  { id: "link", label: "링크", keys: "Mod-k" },
  { id: "paragraph", label: "본문", keys: "Mod-Alt-0" },
  { id: "heading-1", label: "제목 1", keys: "Mod-Alt-1" },
  { id: "heading-2", label: "제목 2", keys: "Mod-Alt-2" },
  { id: "heading-3", label: "제목 3", keys: "Mod-Alt-3" },
  { id: "lead", label: "리드 문단", keys: "Mod-Alt-Shift-0" },
  { id: "bullet-list", label: "글머리 목록", keys: "Mod-Shift-8" },
  { id: "ordered-list", label: "번호 목록", keys: "Mod-Shift-7" },
  { id: "quote", label: "인용", keys: "Mod-Alt-q" },
  { id: "image", label: "사진", keys: "Mod-Alt-Shift-i" },
  { id: "divider", label: "구분선", keys: "Mod-Alt-Shift-h" },
  // Naver's video chord collides with the existing comment chord.
  { id: "youtube", label: "동영상", keys: "Mod-Alt-v" },
  { id: "footnote", label: "각주", keys: "Mod-Alt-Shift-f" },
  { id: "undo", label: "실행 취소", keys: "Mod-z" },
  { id: "redo", label: "다시 실행", keys: "Mod-y" },
  { id: "redo-shift", label: "다시 실행", keys: "Mod-Shift-z" },
  { id: "save", label: "저장", keys: "Mod-s" },
  { id: "save-shift", label: "저장", keys: "Mod-Shift-s" },
  { id: "clear", label: "서식 지우기", keys: "Mod-\\" },
  { id: "help", label: "단축키 안내", keys: "Mod-/" },
  { id: "comment", label: "댓글", keys: "Mod-Alt-m" },
] as const

export function isMacOS(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

export function shortcutLabel(keys: string, mac: boolean): string {
  return keys
    .split("-")
    .map((key) => {
      if (key === "Mod") return mac ? "⌘" : "Ctrl"
      if (key === "Alt") return mac ? "⌥" : "Alt"
      if (key === "Shift") return mac ? "⇧" : "Shift"
      if (key === "Backslash") return "\\"
      return key.toUpperCase()
    })
    .join(mac ? "" : "+")
}

export function shortcutHint(id: string): string {
  const entry = EDITOR_SHORTCUTS.find((shortcut) => shortcut.id === id)
  return entry ? shortcutLabel(entry.keys, isMacOS()) : ""
}

export const UNMAPPED_SHORTCUTS = [
  "왼쪽·가운데·오른쪽 정렬: Markdown 본문에 정렬 기능이 없어 배정하지 않습니다.",
  "스티커·글감 검색·템플릿 목록: 대응하는 도구가 없습니다.",
  "네이버 동영상 Mod+Alt+M: 기존 댓글 단축키를 보존하고 Mod+Alt+V로 옮겼습니다.",
  "Windows 취소선 Ctrl+Shift+S: 저장과 겹쳐 Mod+Alt+S로 통일했습니다.",
  "macOS 첨부 Ctrl+Option: 요청한 Cmd 모델에 맞춰 Cmd+Option으로 통일했습니다.",
  "사진·구분선: macOS 개발자 도구·다른 앱 가리기와 충돌하지 않도록 Shift를 더했습니다.",
] as const
