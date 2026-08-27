function iconButton(command: string, icon: string, label: string): string {
  return `<button class="tool-button" type="button" data-command="${command}" aria-label="${label}" title="${label}" aria-pressed="false"><i class="ph ph-${icon}" aria-hidden="true"></i></button>`
}

export function applicationMarkup(): string {
  return `
    <div class="app-shell">
      <aside class="post-rail" id="post-rail" data-open="false" aria-label="글 목록">
        <div class="rail-header">
          <div class="brand">
            <span class="brand-mark">H</span>
            <div><strong>Blog Editor</strong><span>Local Hugo workspace</span></div>
          </div>
          <button class="icon-button rail-close" id="rail-close" type="button" aria-label="글 목록 닫기"><i class="ph ph-x"></i></button>
        </div>
        <label class="search-field">
          <i class="ph ph-magnifying-glass" aria-hidden="true"></i>
          <span class="sr-only">글 검색</span>
          <input id="post-search" type="search" placeholder="제목이나 경로 검색" autocomplete="off" />
        </label>
        <p class="sr-only" id="post-result-status" role="status"></p>
        <div class="post-list" id="post-list"></div>
      </aside>

      <main class="workspace">
        <header class="command-bar">
          <div class="command-primary">
            <button class="icon-button rail-open" id="rail-open" type="button" aria-label="글 목록 열기" aria-controls="post-rail" aria-expanded="false"><i class="ph ph-list"></i></button>
            <div class="toolbar" id="toolbar" role="group" aria-label="본문 서식">
              ${iconButton("undo", "arrow-u-up-left", "실행 취소")}
              ${iconButton("redo", "arrow-u-up-right", "다시 실행")}
              <span class="toolbar-divider"></span>
              ${iconButton("paragraph", "paragraph", "본문")}
              ${iconButton("heading2", "text-h-two", "제목 2")}
              ${iconButton("heading3", "text-h-three", "제목 3")}
              <span class="toolbar-divider"></span>
              ${iconButton("bold", "text-b", "굵게")}
              ${iconButton("italic", "text-italic", "기울임")}
              ${iconButton("strike", "text-strikethrough", "취소선")}
              ${iconButton("code", "code", "인라인 코드")}
              ${iconButton("blockquote", "quotes", "인용문")}
              ${iconButton("bulletList", "list-bullets", "글머리 목록")}
              ${iconButton("orderedList", "list-numbers", "번호 목록")}
              <button class="tool-button" id="link-button" type="button" aria-label="링크 추가" title="링크 추가"><i class="ph ph-link"></i></button>
              <button class="tool-button" id="image-button" type="button" aria-label="이미지 추가" title="이미지 추가"><i class="ph ph-image"></i></button>
              <button class="tool-button" id="alt-button" type="button" aria-label="이미지 대체 텍스트 편집" title="이미지 대체 텍스트 편집"><i class="ph ph-text-aa"></i></button>
              <input id="image-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden />
            </div>
          </div>
          <div class="document-actions">
            <span class="save-state" id="save-state" role="status">글을 선택하세요</span>
            <button class="secondary-button" id="preview-button" type="button" disabled><i class="ph ph-arrow-square-out"></i><span>실제 화면</span></button>
            <button class="save-button" id="save-button" type="button" disabled><i class="ph ph-floppy-disk"></i><span>저장</span></button>
          </div>
        </header>

        <section class="editor-scroll" id="editor-scroll">
          <div class="welcome" id="welcome">
            <div class="welcome-icon"><i class="ph ph-note-pencil"></i></div>
            <h1>편집할 글을 선택하세요</h1>
            <p>왼쪽 목록에서 글을 열면 발행 화면과 같은 폭과 서체로 바로 편집할 수 있습니다.</p>
          </div>
          <article class="article-canvas" id="article-canvas" hidden>
            <header class="post-header editor-post-header">
              <div class="document-kicker" id="document-kicker"></div>
              <textarea class="post-title-input" id="post-title" rows="1" aria-label="글 제목"></textarea>
              <div class="post-meta editor-meta" id="post-meta"></div>
            </header>
            <div id="editor"></div>
          </article>
        </section>
      </main>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
  `
}
