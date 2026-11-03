import { Fragment, type Node as PMNode } from "@tiptap/pm/model"

/** Document-local numbering; definitions never participate in article layout in place. */
export function normalizeFootnotes(doc: PMNode): PMNode {
  const numbers = new Map<string, number>()
  const definitions: PMNode[] = []
  const body: PMNode[] = []
  doc.descendants((node) => {
    if (node.type.name === "footnoteReference") {
      const label: unknown = node.attrs["label"]
      if (typeof label === "string" && !numbers.has(label)) numbers.set(label, numbers.size + 1)
    }
    return node.type.name !== "footnoteSection" && node.type.name !== "footnoteDefinition"
  })
  const visit = (node: PMNode): PMNode => {
    if (node.type.name === "footnoteReference") {
      return node.type.create({ ...node.attrs, number: numbers.get(node.attrs["label"]) ?? 1 })
    }
    if (node.isLeaf) return node
    const children: PMNode[] = []
    node.forEach((child) => {
      children.push(visit(child))
    })
    return node.copy(Fragment.fromArray(children))
  }
  doc.forEach((node) => {
    if (node.type.name === "footnoteSection")
      node.forEach((child) => {
        definitions.push(child)
      })
    else if (node.type.name === "footnoteDefinition") definitions.push(node)
    else body.push(visit(node))
  })
  definitions.sort(
    (a, b) =>
      (numbers.get(a.attrs["label"]) ?? Infinity) - (numbers.get(b.attrs["label"]) ?? Infinity),
  )
  if (definitions.length) {
    const type = doc.type.schema.nodes["footnoteSection"]
    if (type) body.push(type.create(null, definitions))
  }
  return doc.copy(Fragment.fromArray(body))
}
