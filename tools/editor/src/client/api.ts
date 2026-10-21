import ky, { HTTPError } from "ky"
import {
  apiErrorSchema,
  authorListSchema,
  type CreatePostRequest,
  createPostResponseSchema,
  type ImageUploadResponse,
  imageUploadResponseSchema,
  type PostDocument,
  type PostSummary,
  postDocumentSchema,
  postListSchema,
  type RegisterAuthorRequest,
  registerAuthorResponseSchema,
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

export async function fetchAuthors(): Promise<readonly string[]> {
  try {
    const payload: unknown = await client.get("api/authors").json()
    return authorListSchema.parse(payload).authors
  } catch (error: unknown) {
    throw new Error(await messageFrom(error), { cause: error })
  }
}

export async function registerAuthor(request: RegisterAuthorRequest): Promise<string> {
  try {
    const payload: unknown = await client.post("api/authors", { json: request }).json()
    return registerAuthorResponseSchema.parse(payload).author
  } catch (error: unknown) {
    throw new Error(await messageFrom(error), { cause: error })
  }
}

export async function createPost(request: CreatePostRequest): Promise<string> {
  try {
    const payload: unknown = await client.post("api/posts", { json: request }).json()
    return createPostResponseSchema.parse(payload).path
  } catch (error: unknown) {
    throw new Error(await messageFrom(error), { cause: error })
  }
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
