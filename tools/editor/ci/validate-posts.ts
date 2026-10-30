import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { z } from "zod"
import type { Check, Finding } from "./post-checks"
import { checkBundle, directories } from "./post-checks"

export function changedSlugs(paths: readonly string[]): Set<string> {
  return new Set(
    paths.flatMap((path) => {
      const match = /^content\/posts\/([^/]+)\//.exec(path)
      return match?.[1] ? [match[1]] : []
    }),
  )
}

export async function gitChanged(root: string, base: string, head: string): Promise<Set<string>> {
  // --no-renames includes both sides of moves, and deletions must validate the surviving bundle.
  const result = Bun.spawn(
    [
      "git",
      "diff",
      "--name-only",
      "-z",
      "--no-renames",
      `${base}...${head}`,
      "--",
      "content/posts/",
    ],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr, status] = await Promise.all([
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
    result.exited,
  ])
  if (status !== 0) throw new GitDiffError(stderr.trim())
  return changedSlugs(stdout.split("\0"))
}

class GitDiffError extends Error {
  constructor(readonly detail: string) {
    super(`Cannot determine changed posts: ${detail}`)
  }
}

export function annotation(finding: Finding, strict: boolean): string {
  const escapeData = (value: string) =>
    value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")
  const file = escapeData(finding.file).replaceAll(",", "%2C").replaceAll(":", "%3A")
  return `::${strict ? "error" : "warning"} file=${file},line=1,title=editor/${finding.check} (${finding.code})::${escapeData(strict ? finding.message : `Legacy report-only: ${finding.message}`)}`
}

export async function main(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      all: { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      root: { type: "string", default: process.cwd() },
      base: { type: "string", default: process.env["BASE_SHA"] ?? "origin/main" },
      head: { type: "string", default: process.env["HEAD_SHA"] ?? "HEAD" },
      check: { type: "string" },
    },
    strict: true,
  })
  const check: Check | undefined =
    values.check === undefined
      ? undefined
      : z.enum(["ko-en", "authors", "category"]).parse(values.check)
  const root = resolve(values.root)
  const changed =
    values.strict && values.all
      ? new Set(await directories(resolve(root, "content/posts")))
      : await gitChanged(root, values.base, values.head)
  const slugs = await directories(resolve(root, "content/posts"))
  let errors = 0
  let warnings = 0
  let checked = 0
  for (const slug of slugs) {
    if (!values.all && !changed.has(slug)) continue
    checked++
    for (const finding of await checkBundle(root, slug)) {
      if (check && finding.check !== check) continue
      const strict = changed.has(slug)
      console.log(annotation(finding, strict))
      if (strict) errors++
      else warnings++
    }
  }
  console.log(
    `Post validation: ${checked} bundles; ${errors} errors; ${warnings} legacy report-only warnings.`,
  )
  return errors === 0 ? 0 : 1
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) {
    if (!(error instanceof Error)) throw error
    console.log(
      annotation(
        {
          check: "ko-en",
          code: "configuration",
          file: "tools/editor/ci/validate-posts.ts",
          message: error.message,
        },
        true,
      ),
    )
    process.exitCode = 1
  }
}
