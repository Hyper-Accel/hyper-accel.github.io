import type { ImageChoice } from "../blocks/options"

/**
 * Where picture buttons (사진, 교체, 그림 선택, + 사진) get their pictures. The site sets it to its
 * 라이브러리 (pick from the post's pictures, or add some there first, as in Premiere's project bin);
 * without it they fall back to the file picker.
 */
export const imageChooser: { current: ((multiple: boolean) => Promise<ImageChoice[]>) | null } = {
  current: null,
}
