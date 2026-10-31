import type { GridtermApi } from '../../shared/api'

declare global {
  interface Window {
    gridterm: GridtermApi
  }
}
