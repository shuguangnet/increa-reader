import type { TreeNode } from './api'

export type TreeFilterResult = {
  nodes: TreeNode[]
  forcedOpenPaths: Set<string>
  matchCount: number
}

const normalizeQuery = (query: string) => query.trim().toLowerCase()

const matchesNode = (repoName: string, nodePath: string, query: string) =>
  `${repoName}/${nodePath}`.toLowerCase().includes(query)

type FilterContext = {
  repoName: string
  query: string
  forcedOpenPaths: Set<string>
}

type FilterNodeResult = {
  node: TreeNode | null
  matchCount: number
}

const collectSubtreeDirectoryPaths = (node: TreeNode, paths: Set<string>) => {
  if (node.type !== 'dir') return

  const stack: TreeNode[] = [node]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || current.type !== 'dir') continue

    paths.add(current.path)

    if (!current.children) continue
    for (let i = current.children.length - 1; i >= 0; i -= 1) {
      const child = current.children[i]
      if (child?.type === 'dir') {
        stack.push(child)
      }
    }
  }
}

const filterNode = (node: TreeNode, context: FilterContext): FilterNodeResult => {
  const { repoName, query, forcedOpenPaths } = context
  const selfMatches = matchesNode(repoName, node.path, query)

  if (node.type === 'file') {
    return {
      node: selfMatches ? node : null,
      matchCount: selfMatches ? 1 : 0,
    }
  }

  if (selfMatches) {
    collectSubtreeDirectoryPaths(node, forcedOpenPaths)
    return {
      node,
      matchCount: 1,
    }
  }

  const visibleChildren: TreeNode[] = []
  let matchCount = 0

  if (node.children) {
    for (const child of node.children) {
      const result = filterNode(child, context)
      matchCount += result.matchCount
      if (result.node) {
        visibleChildren.push(result.node)
      }
    }
  }

  if (visibleChildren.length === 0) {
    return { node: null, matchCount }
  }

  forcedOpenPaths.add(node.path)
  return {
    node: { ...node, children: visibleChildren },
    matchCount,
  }
}

export const filterTree = (
  nodes: TreeNode[],
  query: string,
  repoName: string,
): TreeFilterResult => {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    return {
      nodes,
      forcedOpenPaths: new Set<string>(),
      matchCount: 0,
    }
  }

  const forcedOpenPaths = new Set<string>()
  const context: FilterContext = {
    repoName,
    query: normalizedQuery,
    forcedOpenPaths,
  }

  const filteredNodes: TreeNode[] = []
  let matchCount = 0

  for (const node of nodes) {
    const result = filterNode(node, context)
    matchCount += result.matchCount
    if (result.node) {
      filteredNodes.push(result.node)
    }
  }

  return {
    nodes: filteredNodes,
    forcedOpenPaths,
    matchCount,
  }
}
