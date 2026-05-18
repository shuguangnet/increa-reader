import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type GraphNode = { id: string; label: string; type: string }
type GraphEdge = { source: string; target: string }
type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] }

type SimNode = GraphNode & { x: number; y: number; vx: number; vy: number }

export function KnowledgeGraph({ onClose }: { onClose?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const dragRef = useRef<{ nodeId: string | null; offsetX: number; offsetY: number }>({ nodeId: null, offsetX: 0, offsetY: 0 })
  const transformRef = useRef({ scale: 1, ox: 0, oy: 0 })
  const rafRef = useRef(0)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/links/graph')
      .then(r => r.json())
      .then(data => setGraphData(data))
      .catch(() => setGraphData(null))
  }, [])

  const initSim = useCallback((data: GraphData) => {
    const nodes: SimNode[] = data.nodes.map((n, i) => ({
      ...n, x: 300 + Math.cos((2 * Math.PI * i) / data.nodes.length) * 200,
      y: 300 + Math.sin((2 * Math.PI * i) / data.nodes.length) * 200, vx: 0, vy: 0,
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
      // Update
      for (const n of nodes) {
        if (dragRef.current.nodeId === n.id) continue
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
      for (const n of nodes) {
        const r = 16 / scale
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = isDark ? '#374151' : '#e5e7eb'; ctx.fill()
        ctx.strokeStyle = isDark ? '#6b7280' : '#9ca3af'; ctx.lineWidth = 1.5 / scale; ctx.stroke()
        ctx.fillStyle = isDark ? '#f9fafb' : '#111827'
        ctx.font = `${11 / scale}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText(n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label, n.x, n.y - r - 4 / scale)
      }
      ctx.restore()
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
    return () => { running = false; cancelAnimationFrame(rafRef.current) }
  }, [graphData, initSim])

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
    for (const n of nodesRef.current) {
      if (Math.hypot(n.x - wx, n.y - wy) < 20) return n
    }
    return null
  }

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
      // node.id format: "repo:path" or just label — try to navigate
      const parts = node.id.split(':')
      if (parts.length >= 2) navigate(`/views/${parts[0]}/${parts.slice(1).join(':')}`)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h2 className="text-sm font-semibold">Knowledge Graph</h2>
        {onClose && (
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        )}
      </div>
      {!graphData && <div className="p-4 text-sm text-muted-foreground">Loading graph...</div>}
      {graphData && graphData.nodes.length === 0 && <div className="p-4 text-sm text-muted-foreground">No links found</div>}
      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      />
    </div>
  )
}