import { z } from "zod"

// Test-only additions to H's fake: real HTTP is still the source of repository state.
export interface ObservedRequest {
  readonly method: string
  readonly path: string
  readonly body: unknown
  readonly headers: Headers
}

export function extendFetch(
  before?: (request: ObservedRequest) => Promise<void> | void,
  after?: (request: ObservedRequest, response: Response) => Promise<Response> | Response,
): typeof fetch {
  const wrapped = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    const request = new Request(input, init)
    const observed: ObservedRequest = {
      method: request.method,
      path: new URL(request.url).pathname,
      headers: request.headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    await before?.(observed)
    const response = await fetch(input, init)
    return after ? after(observed, response) : response
  }
  return Object.assign(wrapped, { preconnect: fetch.preconnect })
}

export function rendezvous(count: number): () => Promise<void> {
  let arrived = 0
  const ready = Promise.withResolvers<void>()
  return async () => {
    arrived += 1
    if (arrived === count) ready.resolve()
    await ready.promise
  }
}

export function withEtags(observed: ObservedRequest[]): typeof fetch {
  return extendFetch(
    (request) => {
      observed.push(request)
    },
    async (request, response) => {
      if (request.method !== "GET" || !response.ok) return response
      const content = await response.text()
      const etag = `"${new Bun.CryptoHasher("sha256").update(content).digest("hex")}"`
      const headers = new Headers(response.headers)
      headers.set("etag", etag)
      return request.headers.get("if-none-match") === etag
        ? new Response(null, { status: 304, headers })
        : new Response(content, { status: response.status, headers })
    },
  )
}

export function loseMergeResponses(): typeof fetch {
  // H's fake omits merge_commit_sha from GET pull responses. Supply the SHA
  // actually returned by its merge endpoint, never a predicted or seeded result.
  const receipts = new Map<number, string>()
  return extendFetch(undefined, async (request, response) => {
    const pull = /\/pulls\/(\d+)(\/merge)?$/.exec(request.path)
    if (!pull || !response.ok) return response
    const number = Number(pull[1])
    if (request.method === "PUT" && pull[2] === "/merge") {
      const receipt = z.object({ sha: z.string() }).parse(await response.clone().json())
      receipts.set(number, receipt.sha)
      throw new TypeError("Merge response lost")
    }
    const sha = receipts.get(number)
    if (request.method === "GET" && !pull[2] && sha) {
      const body = z.record(z.string(), z.unknown()).parse(await response.json())
      return Response.json({ ...body, merge_commit_sha: sha }, { headers: response.headers })
    }
    return response
  })
}
