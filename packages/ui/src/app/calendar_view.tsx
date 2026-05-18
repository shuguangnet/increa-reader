import { Calendar, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { fetchCalendar, type CalendarData } from './api'

type CalendarViewProps = {
  repoName: string
  onFileClick: (path: string) => void
  onCreateFile: (date: string) => void
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function CalendarView({ repoName, onFileClick, onCreateFile }: CalendarViewProps) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1) // 1-indexed
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCalendar(repoName, year, month)
      .then(data => {
        if (!cancelled) setCalendarData(data)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load calendar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [repoName, year, month])

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Calculate the calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const startWeekday = firstDay.getDay() // 0=Sun
    const daysInMonth = lastDay.getDate()

    const cells: { day: number | null; dateStr: string; hasFiles: boolean; files: string[] }[] = []

    // Empty cells before start
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ day: null, dateStr: '', hasFiles: false, files: [] })
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayData = calendarData?.days[String(d)]
      const files = dayData?.files.map(f => f.path) ?? []
      cells.push({ day: d, dateStr, hasFiles: files.length > 0, files })
    }

    // Pad to complete the last week row
    const totalCells = cells.length
    const remainder = totalCells % 7
    if (remainder > 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        cells.push({ day: null, dateStr: '', hasFiles: false, files: [] })
      }
    }

    return cells
  }, [year, month, calendarData])

  const handlePrevMonth = useCallback(() => {
    if (month === 1) {
      setMonth(12)
      setYear(y => y - 1)
    } else {
      setMonth(m => m - 1)
    }
  }, [month])

  const handleNextMonth = useCallback(() => {
    if (month === 12) {
      setMonth(1)
      setYear(y => y + 1)
    } else {
      setMonth(m => m + 1)
    }
  }, [month])

  const handleToday = useCallback(() => {
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
  }, [today])

  const monthNames = [
    '一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月',
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-5" />
          <h2 className="text-lg font-semibold">日历</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleToday}>
            今天
          </Button>
          <Button size="icon" variant="outline" className="size-8" onClick={handlePrevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[120px] text-center font-medium">
            {year} 年 {monthNames[month - 1]}
          </span>
          <Button size="icon" variant="outline" className="size-8" onClick={handleNextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((wd, i) => (
            <div
              key={i}
              className={`py-1 text-center text-xs font-medium ${
                i === 0 || i === 6
                  ? 'text-red-400 dark:text-red-300'
                  : 'text-muted-foreground'
              }`}
            >
              {wd}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px rounded-lg border bg-border overflow-hidden">
          {calendarGrid.map((cell, i) => {
            if (cell.day === null) {
              return (
                <div
                  key={i}
                  className="min-h-[80px] bg-muted/30 p-1"
                />
              )
            }

            const isToday = cell.dateStr === todayStr
            return (
              <div
                key={i}
                className={`min-h-[80px] p-1 transition-colors ${
                  isToday
                    ? 'bg-blue-50 dark:bg-blue-950/30'
                    : 'bg-background hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center size-6 rounded-full text-xs ${
                      isToday
                        ? 'bg-blue-500 text-white font-bold'
                        : cell.day !== null && (WEEKDAYS.indexOf('日') === 0 && (i % 7 === 0 || i % 7 === 6))
                          ? 'text-red-400 dark:text-red-300'
                          : ''
                    }`}
                  >
                    {cell.day}
                  </span>
                  {cell.hasFiles && (
                    <div className="flex gap-0.5">
                      {cell.files.slice(0, 3).map((_, fi) => (
                        <span
                          key={fi}
                          className="size-1.5 rounded-full bg-blue-500"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* File indicators */}
                {cell.hasFiles && (
                  <div className="mt-1 space-y-0.5">
                    {cell.files.slice(0, 2).map(path => {
                      const name = path.split('/').pop() || path
                      return (
                        <button
                          key={path}
                          type="button"
                          className="w-full text-left text-[10px] truncate px-1 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800 transition-colors"
                          onClick={() => onFileClick(path)}
                          title={path}
                        >
                          {name}
                        </button>
                      )
                    })}
                    {cell.files.length > 2 && (
                      <span className="text-[10px] text-muted-foreground px-1">
                        +{cell.files.length - 2} 更多
                      </span>
                    )}
                  </div>
                )}

                {!cell.hasFiles && cell.day !== null && (
                  <button
                    type="button"
                    className="mt-2 flex items-center justify-center size-5 rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors mx-auto opacity-0 group-hover:opacity-100"
                    style={{ opacity: 0 }}
                    onClick={(e) => {
                      e.currentTarget.style.opacity = '1'
                      onCreateFile(cell.dateStr)
                    }}
                    title={`创建 ${cell.dateStr}.md`}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}
                  >
                    <Plus className="size-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {loading && (
          <div className="mt-4 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        )}
      </div>
    </div>
  )
}