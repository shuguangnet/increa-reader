import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface UIState {
  leftPanelVisible: boolean
  rightPanelVisible: boolean
  commandPaletteOpen: boolean
  shortcutsOpen: boolean
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setShortcutsOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      leftPanelVisible: true,
      rightPanelVisible: true,
      commandPaletteOpen: false,
      shortcutsOpen: false,

      toggleLeftPanel: () =>
        set((state) => ({ leftPanelVisible: !state.leftPanelVisible })),

      toggleRightPanel: () =>
        set((state) => ({ rightPanelVisible: !state.rightPanelVisible })),

      setCommandPaletteOpen: (open: boolean) =>
        set({ commandPaletteOpen: open }),

      setShortcutsOpen: (open: boolean) =>
        set({ shortcutsOpen: open }),
    }),
    {
      name: 'increa-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        leftPanelVisible: state.leftPanelVisible,
        rightPanelVisible: state.rightPanelVisible,
      }),
    },
  ),
)