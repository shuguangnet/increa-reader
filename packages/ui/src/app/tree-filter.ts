import type { TreeNode } from './api'

export type TreeFilterResult = {
  nodes: TreeNode[]
  forcedOpenPaths: Set<string>
  matchCount: number
}

type IndexedTreeNode = {
  source: TreeNode
  searchText: string
  subtreeDirPaths: string[]
  children: IndexedTreeNode[]
}

const normalizeQuery = (query: string) => query.trim().toLowerCase()

type FilterContext = {
  query: string
  forcedOpenPaths: Set<string>
}

type FilterNodeResult = {
  node: TreeNode | null
  matchCount: number
}

const indexNode = (node: TreeNode, repoName: string): IndexedTreeNode => {
  const children =
    node.type === 'dir' ? (node.children ?? []).map(child => indexNode(child, repoName)) : []

  const childDirectoryPaths: string[] = []
  for (const child of children) {
    childDirectoryPaths.push(...child.subtreeDirPaths)
  }

  const subtreeDirPaths = node.type === 'dir' ? [node.path, ...childDirectoryPaths] : []

  return {
    source: node,
    searchText: `${repoName}/${node.path}`.toLowerCase(),
    subtreeDirPaths,
    children,
  }
}

const filterIndexedNode = (
  indexedNode: IndexedTreeNode,
  context: FilterContext,
): FilterNodeResult => {
  const { query, forcedOpenPaths } = context
  const selfMatches = indexedNode.searchText.includes(query)
  const node = indexedNode.source

  if (node.type === 'file') {
    return {
      node: selfMatches ? node : null,
      matchCount: selfMatches ? 1 : 0,
    }
  }

  if (selfMatches) {
    for (const path of indexedNode.subtreeDirPaths) {
      forcedOpenPaths.add(path)
    }
    return {
      node,
      matchCount: 1,
    }
  }

  const visibleChildren: TreeNode[] = []
  let matchCount = 0

  for (const child of indexedNode.children) {
    const result = filterIndexedNode(child, context)
    matchCount += result.matchCount
    if (result.node) {
      visibleChildren.push(result.node)
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

export const createTreeFilter = (nodes: TreeNode[], repoName: string) => {
  const indexedNodes = nodes.map(node => indexNode(node, repoName))
  const resultCache = new Map<string, TreeFilterResult>()

  return (query: string): TreeFilterResult => {
    const normalizedQuery = normalizeQuery(query)
    if (!normalizedQuery) {
      return {
        nodes,
        forcedOpenPaths: new Set<string>(),
        matchCount: 0,
      }
    }

    const cached = resultCache.get(normalizedQuery)
    if (cached) {
      return cached
    }

    const forcedOpenPaths = new Set<string>()
    const context: FilterContext = {
      query: normalizedQuery,
      forcedOpenPaths,
    }

    const filteredNodes: TreeNode[] = []
    let matchCount = 0

    for (const indexedNode of indexedNodes) {
      const result = filterIndexedNode(indexedNode, context)
      matchCount += result.matchCount
      if (result.node) {
        filteredNodes.push(result.node)
      }
    }

    const result = {
      nodes: filteredNodes,
      forcedOpenPaths,
      matchCount,
    }

    resultCache.set(normalizedQuery, result)
    return result
  }
}

export const filterTree = (nodes: TreeNode[], query: string, repoName: string): TreeFilterResult =>
  createTreeFilter(nodes, repoName)(query)
