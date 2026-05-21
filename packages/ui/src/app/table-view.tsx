import { ArrowDown, ArrowUp, Filter } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'

type ColumnType = 'text' | 'number' | 'date'

type SortState = {
  colIndex: number
  direction: 'asc' | 'desc'
}

type TableViewProps = {
  data: string[][]
  headers: string[]
  onSave?: (data: string[][]) => void
}

function detectColumnType(values: string[]): ColumnType {
  let numCount = 0
  let dateCount = 0
  const total = values.length
  if (total === 0) return 'text'

  for (const v of values) {
    const trimmed = v.trim()
    if (!trimmed) continue
    // Check number
    if (!Number.isNaN(Number(trimmed))) {
      numCount++
      continue
    }
    // Check date (YYYY-MM-DD or YYYY/MM/DD)
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
      dateCount++
    }
  }

  if (numCount / total > 0.7) return 'number'
  if (dateCount / total > 0.7) return 'date'
  return 'text'
}

export function TableView({ data, headers, onSave }: TableViewProps) {
  const [sort, setSort] = useState<SortState | null>(null)
  const [filter, setFilter] = useState('')
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [localData, setLocalData] = useState<string[][]>(data)
  const [columnTypes, setColumnTypes] = useState<ColumnType[]>([])

  // Detect column types on data change
  useEffect(() => {
    const types: ColumnType[] = headers.map((_, i) =>
      detectColumnType(localData.map(row => row[i] ?? '')),
    )
    setColumnTypes(types)
  }, [headers, localData])

  const handleSort = useCallback((colIndex: number) => {
    setSort(prev =>
      prev && prev.colIndex === colIndex
        ? { colIndex, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { colIndex, direction: 'asc' },
    )
  }, [])

  const filteredData = useMemo(() => {
    if (!filter.trim()) return localData
    const lower = filter.toLowerCase()
    return localData.filter(row => row.some(cell => (cell ?? '').toLowerCase().includes(lower)))
  }, [localData, filter])

  const sortedData = useMemo(() => {
    if (!sort) return filteredData
    const { colIndex, direction } = sort
    const sorted = [...filteredData].sort((a, b) => {
      const va = (a[colIndex] ?? '').trim()
      const vb = (b[colIndex] ?? '').trim()
      const colType = columnTypes[colIndex] ?? 'text'

      if (colType === 'number') {
        const na = Number(va) || 0
        const nb = Number(vb) || 0
        return direction === 'asc' ? na - nb : nb - na
      }

      if (colType === 'date') {
        const da = new Date(va).getTime() || 0
        const db = new Date(vb).getTime() || 0
        return direction === 'asc' ? da - db : db - da
      }

      return direction === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
    return sorted
  }, [filteredData, sort, columnTypes])

  const handleDoubleClick = useCallback(
    (rowIndex: number, colIndex: number) => {
      // Find actual index in localData from the sorted/filtered result
      const actualRow = localData.indexOf(sortedData[rowIndex])
      setEditingCell({ row: actualRow, col: colIndex })
      setEditValue(localData[actualRow]?.[colIndex] ?? '')
    },
    [localData, sortedData],
  )

  const handleEditCommit = useCallback(() => {
    if (!editingCell) return
    const { row, col } = editingCell
    const newData = localData.map((r, ri) =>
      ri === row ? r.map((c, ci) => (ci === col ? editValue : c)) : r,
    )
    setLocalData(newData)
    setEditingCell(null)
    onSave?.(newData)
  }, [editingCell, editValue, localData, onSave])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditCommit()
      }
      if (e.key === 'Escape') {
        setEditingCell(null)
      }
    },
    [handleEditCommit],
  )

  // Get actual row index in localData from sortedData index
  const getActualIndex = (sortedIndex: number): number => {
    return localData.indexOf(sortedData[sortedIndex])
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
        <Filter className="size-4 text-muted-foreground shrink-0" />
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="筛选表格..."
          className="h-7 text-xs"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="border-b">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:bg-accent transition-colors"
                  onClick={() => handleSort(i)}
                >
                  <div className="flex items-center gap-1">
                    <span>{h}</span>
                    {sort?.colIndex === i &&
                      (sort.direction === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, ri) => (
              <tr key={ri} className="border-b hover:bg-accent/50 transition-colors">
                {headers.map((_, ci) => {
                  const actualRow = getActualIndex(ri)
                  const isEditing = editingCell?.row === actualRow && editingCell?.col === ci
                  const cellValue = row[ci] ?? ''
                  return (
                    <td
                      key={ci}
                      className={`px-3 py-1.5 ${isEditing ? 'p-0' : ''}`}
                      onDoubleClick={() => handleDoubleClick(ri, ci)}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          className="w-full h-full px-3 py-1.5 text-sm bg-background border border-primary outline-none"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          onBlur={handleEditCommit}
                          autoFocus
                        />
                      ) : (
                        <span className={cellValue ? '' : 'text-muted-foreground'}>
                          {cellValue || '\u00A0'}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {sortedData.length === 0 && (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {filter ? '没有匹配的行' : '空表格'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * Parse CSV string into headers and rows.
 * Handles quoted fields (with commas inside) and escaped quotes.
 */
export function parseCSV(content: string): { headers: string[]; data: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { headers: [], data: [] }

  const parseLine = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          cells.push(current)
          current = ''
        } else {
          current += ch
        }
      }
    }
    cells.push(current)
    return cells
  }

  const headers = parseLine(lines[0])
  const data = lines.slice(1).map(parseLine)
  return { headers, data }
}

/**
 * Parse a Markdown table string into headers and rows.
 */
export function parseMarkdownTable(
  content: string,
): { headers: string[]; data: string[][] } | null {
  const lines = content.trim().split(/\r?\n/)
  if (lines.length < 2) return null

  const parseMDLine = (line: string): string[] => {
    return line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim())
  }

  // First line: headers
  const headers = parseMDLine(lines[0])

  // Second line: separator (skip)
  if (!lines[1].match(/^\|?\s*[-:]+(\s*[-:]+)*\s*\|?$/)) return null

  const data = lines
    .slice(2)
    .filter(l => l.trim())
    .map(parseMDLine)
  return { headers, data }
}
