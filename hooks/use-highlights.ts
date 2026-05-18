'use client'

import useSWR, { mutate as globalMutate } from 'swr'
import {
  getHighlightsByArticle,
  getAllHighlights,
  addHighlight,
  updateHighlight,
  deleteHighlight,
  getDeletedHighlights,
  restoreHighlight,
  permanentlyDeleteHighlight,
  emptyTrash,
  generateId,
  getArticle,
} from '@/lib/db'
import type { Highlight, HighlightColor, Article } from '@/lib/types'

export function useHighlights(articleId: string | null) {
  const { data: highlights, error, isLoading, mutate } = useSWR<Highlight[]>(
    articleId ? `highlights-${articleId}` : null,
    () => (articleId ? getHighlightsByArticle(articleId) : []),
    { fallbackData: [] }
  )

  const createHighlight = async (
    text: string,
    color: HighlightColor,
    startOffset: number,
    endOffset: number,
    containerSelector: string,
    note?: string
  ) => {
    if (!articleId) return

    const highlight: Highlight = {
      id: generateId(),
      articleId,
      text,
      color,
      note,
      startOffset,
      endOffset,
      containerSelector,
      createdAt: Date.now(),
    }

    await addHighlight(highlight)
    await mutate()
    return highlight
  }

  const editHighlight = async (id: string, updates: Partial<Pick<Highlight, 'color' | 'note'>>) => {
    const existing = highlights?.find(h => h.id === id)
    if (!existing) return

    const updated = { ...existing, ...updates }
    await updateHighlight(updated)
    await mutate()
  }

  const removeHighlight = async (id: string) => {
    await deleteHighlight(id)
    await mutate()
  }

  return {
    highlights: highlights || [],
    isLoading,
    error,
    createHighlight,
    editHighlight,
    removeHighlight,
    mutate,
  }
}

export function useAllHighlights() {
  const { data: highlights, error, isLoading, mutate } = useSWR<Highlight[]>(
    'highlights-all',
    () => getAllHighlights(),
    { fallbackData: [] }
  )

  return {
    highlights: highlights || [],
    isLoading,
    error,
    mutate,
  }
}

export type HighlightWithArticle = Highlight & { article?: Article }

export function useAllHighlightsWithArticles() {
  const { data, error, isLoading, mutate } = useSWR<HighlightWithArticle[]>(
    'highlights-all-with-articles',
    async () => {
      const highlights = await getAllHighlights()
      const articleIds = [...new Set(highlights.map((h) => h.articleId))]
      const articles = await Promise.all(articleIds.map((id) => getArticle(id)))
      const articleMap = new Map(articles.filter(Boolean).map((a) => [a!.id, a!]))
      return highlights.map((h) => ({ ...h, article: articleMap.get(h.articleId) }))
    },
    { fallbackData: [] }
  )

  const editHighlight = async (id: string, updates: Partial<Pick<Highlight, 'color' | 'note'>>) => {
    const existing = data?.find((h) => h.id === id)
    if (!existing) return
    const updated = { ...existing, ...updates }
    await updateHighlight(updated)
    await mutate()
  }

  const removeHighlight = async (id: string) => {
    await deleteHighlight(id)
    await mutate()
  }

  return {
    highlightsWithArticles: data || [],
    isLoading,
    error,
    mutate,
    editHighlight,
    removeHighlight,
  }
}

export function useTrashHighlights() {
  const { data, error, isLoading, mutate } = useSWR<HighlightWithArticle[]>(
    'highlights-trash',
    async () => {
      const highlights = await getDeletedHighlights()
      const articleIds = [...new Set(highlights.map((h) => h.articleId))]
      const articles = await Promise.all(articleIds.map((id) => getArticle(id)))
      const articleMap = new Map(articles.filter(Boolean).map((a) => [a!.id, a!]))
      return highlights.map((h) => ({ ...h, article: articleMap.get(h.articleId) }))
    },
    { fallbackData: [] }
  )

  const restore = async (id: string) => {
    await restoreHighlight(id)
    await mutate()
    await globalMutate('highlights-all-with-articles')
  }

  const permanentlyDelete = async (id: string) => {
    await permanentlyDeleteHighlight(id)
    await mutate()
  }

  const emptyAllTrash = async () => {
    await emptyTrash()
    await mutate()
  }

  return {
    trashItems: data || [],
    isLoading,
    error,
    restore,
    permanentlyDelete,
    emptyAllTrash,
  }
}
