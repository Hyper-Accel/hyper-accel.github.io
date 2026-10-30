import { z } from "zod"
import type { MemoryTokenProvider } from "../../shared/onsite/auth"
import type { GitHubError, GitHubResult } from "../../shared/onsite/github"

export interface HttpOptions {
  readonly owner: string
  readonly repository: string
  readonly tokenProvider: Pick<MemoryTokenProvider, "getAccessToken">
  readonly baseUrl?: string
  readonly fetch?: typeof fetch
  readonly now?: () => number
}

export class GitHubFailure extends Error {
  constructor(
    readonly detail: GitHubError,
    readonly status = 0,
    readonly payload: unknown = undefined,
  ) {
    super(detail.message)
  }
}

export function invalid(message: string, fields: string[] = []): never {
  throw new GitHubFailure({ kind: "validation", message, fields })
}

export function conflict(expectedHeadSha: string, actualHeadSha: string | null): never {
  throw new GitHubFailure({
    kind: "conflict",
    message: "The remote head changed. Reload before saving or reviewing.",
    expectedHeadSha,
    actualHeadSha,
  })
}

export function unknownOutcome(): never {
  throw new GitHubFailure({
    kind: "network",
    message: "The write could not be confirmed. Read back its state before retrying.",
    outcomeUnknown: true,
  })
}

export async function result<T>(operation: () => Promise<T>): Promise<GitHubResult<T>> {
  try {
    return { ok: true, value: await operation() }
  } catch (error: unknown) {
    if (error instanceof GitHubFailure) return { ok: false, error: error.detail }
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          kind: "validation",
          message: "Invalid GitHub data or editor input.",
          fields: error.issues.map((issue) => issue.path.join(".")),
        },
      }
    }
    // The public adapter boundary never leaks transport errors (which may include credentials).
    return {
      ok: false,
      error: { kind: "network", message: "GitHub request failed.", outcomeUnknown: false },
    }
  }
}

const errorBody = z.object({
  message: z.string().optional(),
  errors: z.array(z.union([z.string(), z.object({ field: z.string().optional() })])).optional(),
})
const graphEnvelope = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ type: z.string().optional(), message: z.string() })).optional(),
})

export class GitHubHttp {
  readonly repo: string
  private readonly origin: string
  private readonly fetcher: typeof fetch
  private readonly now: () => number
  private readonly cache = new Map<string, { readonly etag: string; readonly value: unknown }>()
  private token: string | null = null
  // Pending writes are only read back on another invocation, never blindly replayed.
  private readonly pending = new Set<string>()

  constructor(private readonly options: HttpOptions) {
    this.repo = `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repository)}`
    this.origin = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "")
    this.fetcher = options.fetch ?? fetch
    this.now = options.now ?? Date.now
  }

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: {
      readonly method?: "GET" | "POST" | "PATCH" | "PUT"
      readonly body?: unknown
      readonly fresh?: boolean
      readonly mutation?: boolean
    } = {},
  ): Promise<T> {
    const token = this.options.tokenProvider.getAccessToken()
    if (token !== this.token) {
      this.cache.clear()
      this.token = token
    }
    if (!token) {
      throw new GitHubFailure({ kind: "unauthorized", message: "Sign in to GitHub." }, 401)
    }
    const method = options.method ?? "GET"
    const mutation = options.mutation ?? method !== "GET"
    const cached = method === "GET" && !options.fresh ? this.cache.get(path) : undefined
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    }
    if (cached) headers["If-None-Match"] = cached.etag
    if (mutation) this.cache.clear()
    let response: Response
    let payload: unknown
    try {
      response = await this.fetcher(`${this.origin}${path}`, {
        method,
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      })
      if (response.status === 304 && cached) return schema.parse(cached.value)
      const text = await response.text()
      payload = text ? JSON.parse(text) : null
    } catch (error: unknown) {
      if (error instanceof z.ZodError) throw error
      throw new GitHubFailure({
        kind: "network",
        message: "GitHub could not be reached or its response was incomplete.",
        outcomeUnknown: mutation,
      })
    }
    if (!response.ok) {
      const parsed = errorBody.safeParse(payload)
      const message = parsed.success
        ? (parsed.data.message ?? "GitHub rejected the request.")
        : "GitHub rejected the request."
      const retry = response.headers.get("retry-after")
      const reset = response.headers.get("x-ratelimit-reset")
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (retry !== null ||
            response.headers.get("x-ratelimit-remaining") === "0" ||
            /secondary rate limit|abuse detection/i.test(message)))
      ) {
        const retryAt = retry
          ? Number.isFinite(Number(retry))
            ? this.now() + Number(retry) * 1000
            : Date.parse(retry)
          : reset
            ? Number(reset) * 1000
            : this.now() + 60_000
        throw new GitHubFailure(
          {
            kind: "rateLimited",
            message,
            retryAt: Math.max(
              this.now(),
              Number.isFinite(retryAt) ? Math.ceil(retryAt) : this.now() + 60_000,
            ),
          },
          response.status,
          payload,
        )
      }
      if (response.status === 401 || response.status === 403) {
        throw new GitHubFailure(
          { kind: response.status === 401 ? "unauthorized" : "forbidden", message },
          response.status,
          payload,
        )
      }
      if (response.status >= 500) {
        throw new GitHubFailure(
          { kind: "network", message, outcomeUnknown: mutation },
          response.status,
          payload,
        )
      }
      throw new GitHubFailure(
        {
          kind: "validation",
          message,
          fields: parsed.success
            ? (parsed.data.errors?.flatMap((e) =>
                typeof e !== "string" && e.field ? [e.field] : [],
              ) ?? [])
            : [],
        },
        response.status,
        payload,
      )
    }
    let value: T
    try {
      value = schema.parse(payload)
    } catch (error: unknown) {
      if (mutation && error instanceof z.ZodError) unknownOutcome()
      throw error
    }
    const etag = response.headers.get("etag")
    if (method === "GET" && etag && token === this.token)
      this.cache.set(path, { etag, value: payload })
    return value
  }

  async list<T>(path: string, schema: z.ZodType<T>, fresh = false): Promise<T[]> {
    const values: T[] = []
    for (let page = 1; ; page += 1) {
      const batch = await this.request(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
        z.array(schema),
        { fresh },
      )
      values.push(...batch)
      if (batch.length < 100) return values
    }
  }

  async graph<T>(
    query: string,
    variables: Readonly<Record<string, unknown>>,
    schema: z.ZodType<T>,
    mutation = false,
  ): Promise<T> {
    const envelope = await this.request("/graphql", graphEnvelope, {
      method: "POST",
      body: { query, variables },
      mutation,
    })
    if (envelope.errors?.length) {
      const types = envelope.errors.map((error) => error.type)
      if (types.includes("RATE_LIMITED")) {
        throw new GitHubFailure({
          kind: "rateLimited",
          message: "GitHub GraphQL rate limit exceeded.",
          retryAt: this.now() + 60_000,
        })
      }
      if (types.includes("FORBIDDEN") || types.includes("UNAUTHORIZED")) {
        throw new GitHubFailure({
          kind: types.includes("UNAUTHORIZED") ? "unauthorized" : "forbidden",
          message: "GitHub denied this operation.",
        })
      }
      if (mutation) unknownOutcome()
      invalid("GitHub GraphQL query failed.")
    }
    try {
      return schema.parse(envelope.data)
    } catch (error: unknown) {
      if (mutation && error instanceof z.ZodError) unknownOutcome()
      throw error
    }
  }

  async reconcile<T>(
    key: string,
    write: () => Promise<T>,
    readBack: () => Promise<T | undefined>,
  ): Promise<T> {
    if (this.pending.has(key)) {
      let value: T | undefined
      try {
        value = await readBack()
      } catch (error: unknown) {
        if (error instanceof GitHubFailure && error.detail.kind === "network") unknownOutcome()
        throw error
      }
      if (value === undefined) unknownOutcome()
      this.pending.delete(key)
      return value
    }
    try {
      return await write()
    } catch (error: unknown) {
      if (!(error instanceof GitHubFailure)) throw error
      if (error.detail.kind === "unauthorized" || error.detail.kind === "forbidden") throw error
      const ambiguous = error.detail.kind === "network" && error.detail.outcomeUnknown
      if (ambiguous) this.pending.add(key)
      let value: T | undefined
      try {
        value = await readBack()
      } catch (readError: unknown) {
        if (!(readError instanceof GitHubFailure) && !(readError instanceof z.ZodError))
          throw readError
        if (readError instanceof GitHubFailure && readError.detail.kind === "conflict")
          throw readError
        if (ambiguous) unknownOutcome()
        throw error
      }
      if (value !== undefined) {
        this.pending.delete(key)
        return value
      }
      throw error
    }
  }
}
