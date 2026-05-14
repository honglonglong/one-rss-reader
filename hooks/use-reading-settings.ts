'use client'

import useSWR from 'swr'
import { getSettings, saveSettings } from '@/lib/db'
import type { ReadingSettings } from '@/lib/types'
import { DEFAULT_READING_SETTINGS } from '@/lib/types'

export function useReadingSettings() {
  const { data: settings, error, isLoading, mutate } = useSWR<ReadingSettings>(
    'reading-settings',
    () => getSettings(),
    { fallbackData: DEFAULT_READING_SETTINGS }
  )

  const updateSettings = async (updates: Partial<ReadingSettings>) => {
    const current = settings || DEFAULT_READING_SETTINGS
    const newSettings = { ...current, ...updates }
    await saveSettings(newSettings)
    await mutate(newSettings)
  }

  return {
    settings: settings || DEFAULT_READING_SETTINGS,
    isLoading,
    error,
    updateSettings,
  }
}
