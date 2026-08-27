import ky, { HTTPError } from "ky"
import {
  apiErrorSchema,
  type ImageUploadResponse,
  imageUploadResponseSchema,
  type PostDocument,
  type PostSummary,
  postDocumentSchema,
  postListSchema,
  type SavePostRequest,
  savePostResponseSchema,
} from "../shared/contracts"

const client = ky.create({
  timeout: 30_000,
  retry: 0,
})

async function messageFrom(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    const payload: unknown = await error.response.json()
    const parsed = apiErrorSchema.safeParse(payload)
    if (parsed.success) {
      return parsed.data.error
    }
  }
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
}

export async function fetchPosts(): Promise<readonly PostSummary[]> {
  const payload: unknown = await client.get("api/posts").json()
  return postListSchema.parse(payload).posts
}

export async function fetchPost(path: string): Promise<PostDocument> {
  const payload: unknown = await client.get("api/post", { searchParams: { path } }).json()
  return postDocumentSchema.parse(payload)
}

export async function persistPost(
  request: SavePostRequest,
): Promise<{ readonly revision: string; readonly renderedUrl: string }> {
  try {
    const payload: unknown = await client.put("api/post", { json: request }).json()
    return savePostResponseSchema.parse(payload)
  } catch (error: unknown) {
    throw new Error(await messageFrom(error), { cause: error })
  }
}

export async function uploadImage(path: string, image: File): Promise<ImageUploadResponse> {
  const body = new FormData()
  body.set("path", path)
  body.set("image", image)
  try {
    const payload: unknown = await client.post("api/image", { body }).json()
    return imageUploadResponseSchema.parse(payload)
  } catch (error: unknown) {
    throw new Error(await messageFrom(error), { cause: error })
  }
}
