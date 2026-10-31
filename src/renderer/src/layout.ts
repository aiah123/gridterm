export interface TilePlacement {
  row: number // 1-based CSS grid row
  colStart: number // 1-based CSS grid column line
  colSpan: number
}

export interface GridLayout {
  rows: number
  cols: number
  /** Number of CSS grid column tracks (fine-grained so the last row can stretch). */
  tracks: number
  placements: TilePlacement[]
}

/**
 * Split the window into equal parts for `n` sessions.
 * cols = ceil(sqrt(n)), rows = ceil(n / cols). A short last row stretches its
 * tiles to fill the full width, so there are never empty cells.
 */
export function computeLayout(n: number): GridLayout {
  if (n <= 0) return { rows: 0, cols: 0, tracks: 1, placements: [] }
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const lastCount = n - cols * (rows - 1)
  const tracks = cols * lastCount
  const placements: TilePlacement[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols)
    const isLast = row === rows - 1
    const span = isLast ? tracks / lastCount : tracks / cols
    const indexInRow = i - row * cols
    placements.push({ row: row + 1, colStart: indexInRow * span + 1, colSpan: span })
  }
  return { rows, cols, tracks, placements }
}

export type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * Index of the tile next to `index` in `dir`, or `index` itself at an edge.
 * Left/right move within the row. Up/down go to the tile in the adjacent row
 * that sits under the current tile's horizontal centre, which works even when
 * the last row has wider tiles.
 */
export function neighbor(layout: GridLayout, index: number, dir: Direction): number {
  const { placements } = layout
  const cur = placements[index]
  if (!cur) return index
  if (dir === 'left' || dir === 'right') {
    const target = index + (dir === 'left' ? -1 : 1)
    return placements[target]?.row === cur.row ? target : index
  }
  const row = cur.row + (dir === 'up' ? -1 : 1)
  const centre = cur.colStart + cur.colSpan / 2
  let best = index
  let bestDist = Infinity
  placements.forEach((p, i) => {
    if (p.row !== row) return
    if (centre >= p.colStart && centre < p.colStart + p.colSpan) {
      best = i
      bestDist = -1
    } else if (bestDist !== -1) {
      const d = Math.abs(p.colStart + p.colSpan / 2 - centre)
      if (d < bestDist) {
        best = i
        bestDist = d
      }
    }
  })
  return best
}
