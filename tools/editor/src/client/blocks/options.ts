export interface ImageChoice {
  readonly src: string
  readonly alt?: string
}

export interface BlockExtensionOptions {
  /** Resolves a Markdown image source such as `images/a.webp` to a displayable URL. */
  readonly mediaUrl?: (source: string) => string
  /** Lets the host pick an image (file picker, pending image path). Enables "파일 선택" and the slash-menu image item. */
  readonly requestImage?: () => Promise<ImageChoice | null>
  readonly slashMenu?: boolean
  readonly dropZones?: boolean
}

export interface ResolvedBlockOptions {
  readonly mediaUrl: (source: string) => string
  readonly requestImage: (() => Promise<ImageChoice | null>) | null
  readonly slashMenu: boolean
  readonly dropZones: boolean
}

export function resolveBlockOptions(options: BlockExtensionOptions): ResolvedBlockOptions {
  return {
    mediaUrl: options.mediaUrl ?? ((source) => source),
    requestImage: options.requestImage ?? null,
    slashMenu: options.slashMenu ?? true,
    dropZones: options.dropZones ?? true,
  }
}
