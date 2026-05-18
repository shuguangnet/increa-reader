import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ZoomIn, ZoomOut, Maximize } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'

type GraphNode = { id: string; label: string; type: string }
type GraphEdge = { source: string; target: string }
type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }

type SimNode = GraphNode & { x: number; y: number; vx: number; vy: number }

type TouchDragState = {
  nodeId: string | null
  lastX: number
  lastY: number
  moved: boolean
}

type PinchState = {
  active: boolean
  startDist: number
  startScale: number
  startOx: number
  startOy: number
  startCenterX: number
  startCenterY: number
}

export function KnowledgeGraph({ onClose }: { onClose?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 })
  const transformRef = useRef({ scale: 1, ox: 0, oy: 0 })
  const rafRef = useRef(0)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // Touch-related refs
  const touchDragRef = useRef<TouchDragState>({ nodeId: null, lastX: 0, lastY: 0, moved: false })
  const pinchRef = useRef<PinchState>({ active: false, startDist: 0, startScale: 1, startOx: 0, startOy: 0, startCenterX: 0, startCenterY: 0 })
  const panRef = useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 })

  useEffect(() => {
    fetch('/api/links/graph')
      .then(r => r.json())
      .then(data => setGraphData(data))
      .catch(() => setGraphData(null))
  }, [])

  const initSim = useCallback((data: GraphData) => {
    const canvas = canvasRef.current
    const cx = canvas ? canvas.clientWidth / 2 : 300
    const cy = canvas ? canvas.clientHeight / 2 : 300
    const radius = Math.min(cx, cy) * 0.6
    const nodes: SimNode[] = data.nodes.map((n, i) => ({
      ...n, x: cx + Math.cos((2 * Math.PI * i) / data.nodes.length) * radius,
      y: cy + Math.sin((2 * Math.PI * i) / data.nodes.length) * radius, vx: 0, vy: 0,
    }))
    nodesRef.current = nodes
    edgesRef.current = data.edges
  }, [])

  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return
    initSim(graphData)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    let running = true

    const tick = () => {
      if (!running) return
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const nodeMap = new Map(nodes.map(n => [n.id, n]))
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = 5000 / (d * d)
          const fx = (dx / d) * f, fy = (dy / d) * f
          nodes[i].vx += fx; nodes[i].vy += fy
          nodes[j].vx -= fx; nodes[j].vy -= fy
        }
      }
      // Attraction (edges)
      for (const e of edges) {
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target)
        if (!a || !b) continue
        let dx = b.x - a.x, dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 150) * 0.05
        const fx = (dx / d) * f, fy = (dy / d) * f
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy
      }
      // Centering
      for (const n of nodes) { n.vx += (W / 2 - n.x) * 0.01; n.vy += (H / 2 - n.y) * 0.01 }
      // Update — skip dragged nodes (both mouse and touch)
      const touchDragNodeId = touchDragRef.current.nodeId
      for (const n of nodes) {
        if (dragRef.current.nodeId === n.id || touchDragNodeId === n.id) continue
        n.vx *= 0.9; n.vy *= 0.9; n.x += n.vx; n.y += n.vy
      }
      // Draw
      const { scale, ox, oy } = transformRef.current
      ctx.clearRect(0, 0, W, H)
      ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale)
      // Edges
      ctx.strokeStyle = getComputedStyle(document.documentElement).color === 'rgb(255, 255, 255)'
        ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
      ctx.lineWidth = 1 / scale
      for (const e of edges) {
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target)
        if (!a || !b) continue
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
      // Nodes
      const isDark = getComputedStyle(document.documentElement).color === 'rgb(255, 255, 255)'
      const nodeRadius = isMobile ? 20 : 16
      for (const n of nodes) {
        const r = nodeRadius / scale
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = isDark ? '#374151' : '#e5e7eb'; ctx.fill()
        ctx.strokeStyle = isDark ? '#6b7280' : '#9ca3af'; ctx.lineWidth = 1.5 / scale; ctx.stroke()
        ctx.fillStyle = isDark ? '#f9fafb' : '#111827'
        const fontSize = (isMobile ? 13 : 11) / scale
        ctx.font = `${fontSize}px sans-serif`; ctx.textAlign = 'center'
        const maxLen = isMobile ? 14 : 18
        ctx.fillText(n.label.length > maxLen ? n.label.slice(0, maxLen - 2) + '…' : n.label, n.x, n.y - r - 4 / scale)
      }
      ctx.restore()
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [graphData, initSim, isMobile])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight }
    resize(); window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const screenToWorld = (sx: number, sy: number) => {
    const { scale, ox, oy } = transformRef.current
    return { x: (sx - ox) / scale, y: (sy - oy) / scale }
  }

  const findNode = (wx: number, wy: number) => {
    const hitRadius = isMobile ? 30 : 20
    for (const n of nodesRef.current) {
      if (Math.hypot(n.x - wx, n.y - wy) < hitRadius) return n
    }
    return null
  }

  // --- Mouse handlers (desktop) ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const t = transformRef.current
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    t.ox = mx - (mx - t.ox) * factor; t.oy = my - (my - t.oy) * factor
    t.scale *= factor
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const node = findNode(x, y)
    if (node) {
      dragRef.current = { nodeId: node.id, offsetX: 0, offsetY: 0 }
      node.vx = 0; node.vy = 0
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current.nodeId) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const node = nodesRef.current.find(n => n.id === dragRef.current.nodeId)
    if (node) { node.x = x; node.y = y }
  }

  const handleMouseUp = () => { dragRef.current.nodeId = null }

  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    const node = findNode(x, y)
    if (node) {
      const parts = node.id.split(':')
      if (parts.length >= 2) navigate(`/views/${parts[0]}/${parts.slice(1).join(':')}`)
    }
  }

  // --- Touch handlers (mobile) ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()

    if (e.touches.length === 2) {
      // Pinch-to-zoom start
      e.preventDefault()
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.hypot(dx, dy)
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      const t = transformRef.current
      pinchRef.current = {
        active: true,
        startDist: dist,
        startScale: t.scale,
        startOx: t.ox,
        startOy: t.oy,
        startCenterX: cx,
        startCenterY: cy,
      }
    } else if (e.touches.length === 1) {
      // Single touch: check if on a node
      const touch = e.touches[0]
      const { x, y } = screenToWorld(touch.clientX - rect.left, touch.clientY - rect.top)
      const node = findNode(x, y)
      if (node) {
        e.preventDefault()
        node.vx = 0; node.vy = 0
        touchDragRef.current = { nodeId: node.id, lastX: touch.clientX, lastY: touch.clientY, moved: false }
      } else {
        // Pan start
        panRef.current = { active: true, lastX: touch.clientX, lastY: touch.clientY }
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()

    if (e.touches.length === 2 && pinchRef.current.active) {
      e.preventDefault()
      const dx = e.touches[1].clientX - e.touches[0].clientX
      const dy = e.touches[1].clientY - e.touches[0].clientY
      const dist = Math.hypot(dx, dy)
      const t = transformRef.current
      const scaleFactor = dist / pinchRef.current.startDist
      const newScale = pinchRef.current.startScale * scaleFactor
      // Clamp scale
      const clampedScale = Math.max(0.2, Math.min(5, newScale))
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      t.scale = clampedScale
      t.ox = cx - (pinchRef.current.startCenterX - pinchRef.current.startOx) * scaleFactor
      t.oy = cy - (pinchRef.current.startCenterY - pinchRef.current.startOy) * scaleFactor
    } else if (e.touches.length === 1) {
      const touch = e.touches[0]
      const td = touchDragRef.current
      if (td.nodeId) {
        // Dragging a node
        e.preventDefault()
        const { x, y } = screenToWorld(touch.clientX - rect.left, touch.clientY - rect.top)
        const node = nodesRef.current.find(n => n.id === td.nodeId)
        if (node) {
          node.x = x; node.y = y
        }
        td.moved = true
        td.lastX = touch.clientX
        td.lastY = touch.clientY
      } else if (panRef.current.active) {
        // Panning the canvas
        e.preventDefault()
        const dx = touch.clientX - panRef.current.lastX
        const dy = touch.clientY - panRef.current.lastY
        const t = transformRef.current
        t.ox += dx
        t.oy += dy
        panRef.current.lastX = touch.clientX
        panRef.current.lastY = touch.clientY
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // Check if it was a tap (not a drag) on a node
      const td = touchDragRef.current
      if (td.nodeId && !td.moved) {
        // Tap on node — navigate
        const node = nodesRef.current.find(n => n.id === td.nodeId)
        if (node) {
          const parts = node.id.split(':')
          if (parts.length >= 2) navigate(`/views/${parts[0]}/${parts.slice(1).join(':')}`)
        }
      }
      touchDragRef.current = { nodeId: null, lastX: 0, lastY: 0, moved: false }
      panRef.current = { active: false, lastX: 0, lastY: 0 }
      pinchRef.current = { active: false, startDist: 0, startScale: 1, startOx: 0, startOy: 0, startCenterX: 0, startCenterY: 0 }
    }
  }

  // Zoom controls
  const handleZoomIn = () => {
    if (!canvasRef.current) return
    const t = transformRef.current
    const newScale = Math.min(5, t.scale * 1.3)
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    t.ox = cx - (cx - t.ox) * (newScale / t.scale)
    t.oy = cy - (cy - t.oy) * (newScale / t.scale)
    t.scale = newScale
  }

  const handleZoomOut = () => {
    if (!canvasRef.current) return
    const t = transformRef.current
    const newScale = Math.max(0.2, t.scale / 1.3)
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    t.ox = cx - (cx - t.ox) * (newScale / t.scale)
    t.oy = cy - (cy - t.oy) * (newScale / t.scale)
    t.scale = newScale
  }

  const handleFitToView = () => {
    const nodes = nodesRef.current
    if (nodes.length === 0 || !canvasRef.current) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y)
    }
    const padding = 80
    const rect = canvasRef.current.getBoundingClientRect()
    const t = transformRef.current
    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2
    const scaleX = rect.width / contentW
    const scaleY = rect.height / contentH
    t.scale = Math.min(scaleX, scaleY, 2)
    t.ox = rect.width / 2 - ((minX + maxX) / 2) * t.scale
    t.oy = rect.height / 2 - ((minY + maxY) / 2) * t.scale
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-emerald-500" />
          知识图谱
          {graphData && (
            <span className="text-xs font-normal text-muted-foreground">
              {graphData.nodes.length} 节点 · {graphData.edges.length} 连接
            </span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {graphData && graphData.nodes.length > 0 && (
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="放大"
              >
                <ZoomIn size={16} />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="缩小"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={handleFitToView}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="适应画布"
              >
                <Maximize size={16} />
              </button>
            </div>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="关闭"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      {!graphData && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">加载图谱中...</div>
        </div>
      )}
      {graphData && graphData.nodes.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">未发现链接关系</div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-grab active:cursor-grabbing touch-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
    </div>
  )
}