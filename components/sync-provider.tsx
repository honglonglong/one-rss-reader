'use client'

import { createContext, useContext } from 'react'
import { useSync, type UseSyncReturn } from '@/hooks/use-sync'

const SyncContext = createContext<UseSyncReturn | null>(null)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const sync = useSync()
  return <SyncContext.Provider value={sync}>{children}</SyncContext.Provider>
}

export function useSyncContext(): UseSyncReturn {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider')
  return ctx
}
