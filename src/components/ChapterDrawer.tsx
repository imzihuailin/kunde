import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChapterItem } from '../utils/bookStorage'

function normalizeHref(href?: string) {
  return href?.trim() ?? ''
}

function getBaseHref(href?: string) {
  return normalizeHref(href).split('#')[0]
}

interface ChapterTreeNode extends ChapterItem {
  parentId: string | null
  children: ChapterTreeNode[]
}

interface ChapterDrawerProps {
  open: boolean
  chapters: ChapterItem[]
  currentHref?: string
  textColor: string
  borderColor: string
  surfaceOverlay: string
  onClose: () => void
  onSelect: (href: string) => void
}

function buildChapterTree(chapters: ChapterItem[]) {
  const roots: ChapterTreeNode[] = []
  const stack: ChapterTreeNode[] = []
  const nodesById = new Map<string, ChapterTreeNode>()

  chapters.forEach((chapter) => {
    while (stack.length > chapter.level) {
      stack.pop()
    }

    const parent = stack.at(-1) ?? null
    const node: ChapterTreeNode = {
      ...chapter,
      parentId: parent?.id ?? null,
      children: [],
    }

    nodesById.set(node.id, node)

    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }

    stack.push(node)
  })

  return { roots, nodesById }
}

function collectAncestorIds(node: ChapterTreeNode | null, nodesById: Map<string, ChapterTreeNode>) {
  const ids = new Set<string>()
  let current = node

  while (current) {
    ids.add(current.id)
    current = current.parentId ? (nodesById.get(current.parentId) ?? null) : null
  }

  return ids
}

export function ChapterDrawer({
  open,
  chapters,
  currentHref,
  textColor,
  borderColor,
  surfaceOverlay,
  onClose,
  onSelect,
}: ChapterDrawerProps) {
  const activeItemRef = useRef<HTMLButtonElement | null>(null)
  const { roots, nodesById } = useMemo(() => buildChapterTree(chapters), [chapters])

  const activeNode = useMemo(() => {
    const normalizedCurrentHref = normalizeHref(currentHref)
    if (!normalizedCurrentHref) return null

    const exactMatch = chapters.find((chapter) => normalizeHref(chapter.href) === normalizedCurrentHref)
    if (exactMatch) return nodesById.get(exactMatch.id) ?? null

    const currentBaseHref = getBaseHref(normalizedCurrentHref)
    const baseMatch = chapters.find((chapter) => getBaseHref(chapter.href) === currentBaseHref)
    return baseMatch ? (nodesById.get(baseMatch.id) ?? null) : null
  }, [chapters, currentHref, nodesById])

  const defaultExpandedIds = useMemo(
    () => collectAncestorIds(activeNode, nodesById),
    [activeNode, nodesById],
  )
  const defaultExpandedKey = useMemo(
    () => Array.from(defaultExpandedIds).sort().join('|'),
    [defaultExpandedIds],
  )
  const [expandedIds, setExpandedIds] = useState<Set<string>>(defaultExpandedIds)

  useEffect(() => {
    if (!open) return
    setExpandedIds(new Set(defaultExpandedIds))
  }, [defaultExpandedKey, defaultExpandedIds, open])

  useEffect(() => {
    if (!open || !activeItemRef.current) return

    window.setTimeout(() => {
      activeItemRef.current?.scrollIntoView({
        block: 'center',
        behavior: 'instant',
      })
    }, 0)
  }, [open, defaultExpandedKey])

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  const renderNode = (node: ChapterTreeNode) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.has(node.id)
    const isActive = activeNode?.id === node.id

    return (
      <li key={node.id}>
        <div className="flex items-center gap-2" style={{ paddingLeft: `${16 + node.level * 18}px` }}>
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? '收起章节' : '展开章节'}
              onClick={() => toggleExpanded(node.id)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm opacity-70 transition hover:bg-black/10 hover:opacity-100"
            >
              <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▸</span>
            </button>
          ) : (
            <span className="h-10 w-10 shrink-0" />
          )}
          <button
            ref={isActive ? activeItemRef : null}
            type="button"
            onClick={() => onSelect(node.href)}
            className={`flex-1 rounded-2xl px-4 py-3 text-left text-sm transition ${
              isActive ? 'bg-blue-500/15 font-semibold text-blue-500' : 'hover:bg-white/10'
            }`}
          >
            {node.label}
          </button>
        </div>
        {hasChildren && isExpanded ? <ul className="mt-1 space-y-1">{node.children.map(renderNode)}</ul> : null}
      </li>
    )
  }

  return (
    <div className={`fixed inset-0 z-[70] transition ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/35 transition ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 left-0 w-[28rem] max-w-[90vw] transform transition duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          backgroundColor: surfaceOverlay,
          borderRight: `1px solid ${borderColor}`,
          color: textColor,
        }}
      >
        <div className="flex h-full flex-col backdrop-blur-xl">
          <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor }}>
            <h2 className="text-lg font-semibold">章节目录</h2>
            <button type="button" onClick={onClose} className="text-sm opacity-70 transition hover:opacity-100">
              关闭
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {chapters.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-5 py-8 text-sm opacity-75" style={{ borderColor }}>
                本书暂无目录
              </div>
            ) : (
              <ul className="space-y-1">{roots.map(renderNode)}</ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
