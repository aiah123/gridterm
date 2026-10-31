import { describe, expect, it } from 'vitest'
import { computeLayout } from './layout'

describe('computeLayout', () => {
  it('handles 0 and 1 sessions', () => {
    expect(computeLayout(0).placements).toEqual([])
    const one = computeLayout(1)
    expect(one).toMatchObject({ rows: 1, cols: 1 })
    expect(one.placements[0]).toEqual({ row: 1, colStart: 1, colSpan: 1 })
  })

  it('uses a square-ish grid', () => {
    expect(computeLayout(4)).toMatchObject({ rows: 2, cols: 2 })
    expect(computeLayout(6)).toMatchObject({ rows: 2, cols: 3 })
    expect(computeLayout(9)).toMatchObject({ rows: 3, cols: 3 })
  })

  it('stretches a short last row to the full width', () => {
    for (let n = 1; n <= 20; n++) {
      const { rows, tracks, placements } = computeLayout(n)
      for (let r = 1; r <= rows; r++) {
        const inRow = placements.filter((p) => p.row === r)
        const width = inRow.reduce((sum, p) => sum + p.colSpan, 0)
        expect(width).toBe(tracks)
        // tiles in a row are equal width and contiguous
        expect(new Set(inRow.map((p) => p.colSpan)).size).toBe(1)
        inRow.forEach((p, i) => expect(p.colStart).toBe(1 + i * p.colSpan))
      }
    }
  })

  it('places 3 sessions as 2 on top, 1 full-width below', () => {
    const { placements } = computeLayout(3)
    expect(placements[2].row).toBe(2)
    expect(placements[2].colSpan).toBe(placements[0].colSpan * 2)
  })
})
