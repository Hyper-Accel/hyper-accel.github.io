import { postBundleSchema } from "../document"
import imageLayouts from "./image-layouts/bundle.json"
import interactiveBlocks from "./interactive-blocks/bundle.json"
import mathAndLegacy from "./math-and-legacy/bundle.json"

export const fixtureBundles = [
  postBundleSchema.parse(imageLayouts),
  postBundleSchema.parse(interactiveBlocks),
  postBundleSchema.parse(mathAndLegacy),
]
export const legacyFixtureSlug = "legacy-no-ids"
