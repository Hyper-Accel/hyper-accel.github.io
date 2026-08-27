export class ContentError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "ContentError"
    this.status = status
  }
}

export class RevisionConflictError extends ContentError {
  constructor() {
    super("다른 작업에서 글이 변경되었습니다. 새로고침한 뒤 다시 편집해 주세요.", 409)
    this.name = "RevisionConflictError"
  }
}

export class HugoBuildError extends ContentError {
  constructor(message: string) {
    super(`Hugo 렌더링에 실패해 저장을 되돌렸습니다.\n${message}`, 422)
    this.name = "HugoBuildError"
  }
}
