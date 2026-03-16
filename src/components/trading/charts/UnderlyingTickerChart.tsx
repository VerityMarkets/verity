import { useEffect, useRef, useCallback } from 'react'
import { useMainnetMidRef, fetchMainnetCandles } from '@/hooks/useMainnetMid'

interface UnderlyingTickerChartProps {
  underlying: string
  targetPrice: number
}

type PricePoint = { ts: number; value: number }

const WINDOW_MS = 60_000 // 60 seconds visible
const SAMPLE_MS = 500 // add a data point every 500ms
const FPS_INTERVAL = 1000 / 30 // cap at ~30fps
const EDGE_PAD = 14 // breathing space (px) between ball and right axis
const PING_PERIOD = 2000 // ping every 2s
const PING_DURATION = 1000 // ping animation lasts 1s
const ARROW_PULSE_PERIOD = 1500 // pulsating arrow cycle

/** Ease-out cubic: starts fast, decelerates to stop */
function easeOut(t: number): number {
  const t1 = 1 - t
  return 1 - t1 * t1 * t1
}

// ─── Drawing helpers ───────────────────────────────────────────────────────────

/** Calculate decimal places needed to show 0.01% moves for a given price */
function getPrecision(price: number): number {
  if (price <= 0) return 2
  // 0.01% of price = price * 0.0001
  const minMove = price * 0.0001
  // Need enough decimals to represent that move
  const dp = Math.max(2, Math.ceil(-Math.log10(minMove)) + 1)
  return Math.min(dp, 6) // cap at 6
}

function getTickSize(range: number): number {
  if (range <= 0.01) return 0.001
  if (range <= 0.05) return 0.005
  if (range <= 0.1) return 0.01
  if (range <= 0.5) return 0.05
  if (range <= 1) return 0.1
  if (range <= 5) return 0.5
  if (range <= 10) return 1
  if (range <= 50) return 5
  if (range <= 100) return 10
  if (range <= 1000) return 100
  if (range <= 2000) return 200
  if (range <= 10000) return 1000
  return 5000
}

function roundToMultiple(min: number, max: number, multiple: number) {
  return {
    min: Math.floor(min / multiple) * multiple,
    max: Math.ceil(max / multiple) * multiple,
  }
}

/** Catmull-Rom control points, x-clamped to prevent reversals on time-series */
function getControlPoints(points: { x: number; y: number }[]) {
  const cps: number[] = []
  const t = 0.25
  for (let i = 0; i < points.length - 2; i++) {
    const p0 = points[i], p1 = points[i + 1], p2 = points[i + 2]
    const d1 = Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2)
    const d2 = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
    const d = d1 + d2
    if (d < 1e-6) {
      cps.push(p1.x, p1.y, p1.x, p1.y)
      continue
    }
    const vx = p2.x - p0.x
    const vy = p2.y - p0.y
    // Raw control points
    let cpInX = p1.x - (vx * t * d1) / d
    let cpInY = p1.y - (vy * t * d1) / d
    let cpOutX = p1.x + (vx * t * d2) / d
    let cpOutY = p1.y + (vy * t * d2) / d
    // Clamp so control points stay within adjacent segment bounds
    cpInX = Math.max(cpInX, p0.x)
    cpOutX = Math.min(cpOutX, p2.x)
    // Clamp Y to prevent vertical overshoot spikes
    const minY01 = Math.min(p0.y, p1.y)
    const maxY01 = Math.max(p0.y, p1.y)
    cpInY = Math.max(minY01, Math.min(maxY01, cpInY))
    const minY12 = Math.min(p1.y, p2.y)
    const maxY12 = Math.max(p1.y, p2.y)
    cpOutY = Math.max(minY12, Math.min(maxY12, cpOutY))
    cps.push(cpInX, cpInY, cpOutX, cpOutY)
  }
  return cps
}

function padTime(n: number) {
  return String(n).padStart(2, '0')
}

/** Draw a price tag with arrow pointer (like Polymarket) */
function drawPriceTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  bgColor: string,
  textColor: string,
) {
  ctx.save()
  ctx.fillStyle = bgColor
  const tw = ctx.measureText(text).width + 8
  ctx.beginPath()
  ctx.moveTo(x - 6, y)
  ctx.lineTo(x, y - 9)
  ctx.lineTo(x + tw, y - 9)
  ctx.lineTo(x + tw, y + 9)
  ctx.lineTo(x, y + 9)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = textColor
  ctx.fillText(text, x + 3, y + 3)
  ctx.restore()
}

/** Draw a price tag with stacked chevron arrows for out-of-range target */
function drawTargetTagWithChevrons(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: 'up' | 'down',
  bgColor: string,
  textColor: string,
) {
  ctx.save()
  const label = 'Target'
  const labelW = ctx.measureText(label).width
  const chevronW = 14 // space for stacked chevrons
  const totalW = labelW + chevronW + 10
  // Tag background (arrow-pointer shape)
  ctx.fillStyle = bgColor
  ctx.beginPath()
  ctx.moveTo(x - 6, y)
  ctx.lineTo(x, y - 9)
  ctx.lineTo(x + totalW, y - 9)
  ctx.lineTo(x + totalW, y + 9)
  ctx.lineTo(x, y + 9)
  ctx.closePath()
  ctx.fill()

  // "Target" text
  ctx.fillStyle = textColor
  ctx.fillText(label, x + 3, y + 3)

  // Stacked chevrons — pointing in the direction of the target
  // 'up' = target above chart → chevrons point ↑ (^ ^)
  // 'down' = target below chart → chevrons point ↓ (v v)
  const chevronX = x + labelW + 9
  ctx.strokeStyle = textColor
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // For 'up': chevrons are ^ shape (arms go down from tip)
  // For 'down': chevrons are v shape (arms go up from tip)
  const armDir = direction === 'up' ? 1 : -1 // +1 = arms go down (^), -1 = arms go up (v)

  // First chevron (inner, closer to label center)
  const y1 = y - armDir * 2
  ctx.beginPath()
  ctx.moveTo(chevronX - 3, y1 + armDir * 3)
  ctx.lineTo(chevronX, y1)
  ctx.lineTo(chevronX + 3, y1 + armDir * 3)
  ctx.stroke()

  // Second chevron (outer, further from center)
  const y2 = y - armDir * 6
  ctx.beginPath()
  ctx.moveTo(chevronX - 3, y2 + armDir * 3)
  ctx.lineTo(chevronX, y2)
  ctx.lineTo(chevronX + 3, y2 + armDir * 3)
  ctx.stroke()

  ctx.restore()
}

// ─── Main draw function ────────────────────────────────────────────────────────

function drawChart(
  ctx: CanvasRenderingContext2D,
  data: ReadonlyArray<PricePoint>,
  targetPrice: number,
  width: number,
  height: number,
  now: number,
  displayValue: number, // animated endpoint value (eased between ticks)
) {
  const FONT = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'
  ctx.font = FONT

  const values = data.map((p) => p.value)

  // Y bounds from DATA + display value — don't include target (may be far away)
  const dataMin = Math.min(...values, displayValue)
  const dataMax = Math.max(...values, displayValue)

  // Calculate precision based on price level
  const avgPrice = (dataMin + dataMax) / 2
  const dp = getPrecision(avgPrice)

  const padding = { graph: { bottom: 24, right: 64 }, label: { y: 4 } }
  const graph = {
    top: 0,
    bottom: height - padding.graph.bottom,
    left: 0,
    right: width - padding.graph.right,
  }

  // Y-axis: scale to data range with some breathing room
  const graphBuffer = graph.bottom * 0.12
  const rawRange = dataMax - dataMin
  // Ensure minimum range so flat lines still look good
  const minRange = avgPrice * 0.001 // 0.1% minimum visible range
  const rangeY = Math.max(rawRange, minRange)
  // Center the range if we expanded it
  const boundsMin = rawRange < minRange ? avgPrice - minRange / 2 : dataMin
  const boundsMax = rawRange < minRange ? avgPrice + minRange / 2 : dataMax

  // Pick tick size, then bump up if it produces too many labels (target 4-6)
  let tickY = getTickSize(rangeY)
  const axisBoundsY = roundToMultiple(boundsMin, boundsMax, tickY)
  if (axisBoundsY.max <= axisBoundsY.min) {
    axisBoundsY.min -= tickY
    axisBoundsY.max += tickY
  }
  let numTicksY = Math.ceil((axisBoundsY.max - axisBoundsY.min) / tickY) + 1
  // If too many ticks, double the tick size until we have ≤ 7
  while (numTicksY > 7) {
    tickY *= 2
    numTicksY = Math.ceil((axisBoundsY.max - axisBoundsY.min) / tickY) + 1
  }

  // X-axis: fixed time window → pixel mapping
  const timeLeft = now - WINDOW_MS
  const graphW = graph.right - graph.left - EDGE_PAD
  const getXPos = (ts: number) => graph.left + ((ts - timeLeft) / WINDOW_MS) * graphW

  // Clear
  ctx.clearRect(0, 0, width, height)

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.moveTo(graph.left, graph.bottom)
  ctx.lineTo(graph.right, graph.bottom)
  ctx.lineTo(graph.right, graph.top)
  ctx.stroke()

  // Y-axis ticks
  const graphHeight = graph.bottom - graph.top - graphBuffer * 2
  const scaleY = graphHeight / (axisBoundsY.max - axisBoundsY.min)
  const getYPos = (y: number) => graph.bottom - graphBuffer - scaleY * (y - axisBoundsY.min)

  const firstTickYPos = getYPos(axisBoundsY.min)
  const tickDistanceY = graphHeight / (numTicksY - 1)
  const tickLen = 4

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.fillStyle = '#6b7280'
  for (let i = 0; i < numTicksY; i++) {
    const ty = firstTickYPos - tickDistanceY * i
    ctx.beginPath()
    ctx.moveTo(graph.right, ty)
    ctx.lineTo(graph.right + tickLen, ty)
    ctx.stroke()
    ctx.fillText(
      (axisBoundsY.min + tickY * i).toFixed(dp),
      graph.right + tickLen + padding.label.y,
      ty + 3,
    )
  }

  // ─── X-axis time labels ──────────────────────────────────────────────
  const xTickInterval = WINDOW_MS <= 60_000 ? 10_000 : 30_000
  const firstXTick = Math.ceil(timeLeft / xTickInterval) * xTickInterval
  ctx.fillStyle = '#6b7280'
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  for (let ts = firstXTick; ts <= now; ts += xTickInterval) {
    const x = getXPos(ts)
    if (x < graph.left + 20 || x > graph.right - 20) continue
    ctx.beginPath()
    ctx.moveTo(x, graph.bottom)
    ctx.lineTo(x, graph.bottom + 4)
    ctx.stroke()
    const d = new Date(ts)
    const label = `${padTime(d.getHours())}:${padTime(d.getMinutes())}:${padTime(d.getSeconds())}`
    const tw = ctx.measureText(label).width
    ctx.fillText(label, x - tw / 2, graph.bottom + 16)
  }

  if (data.length < 2) return

  // The animated endpoint is drawn separately — don't include it in the spline data
  const lastPoint = data[data.length - 1]

  // ─── Target price indicator ──────────────────────────────────────────
  const targetAbove = targetPrice > axisBoundsY.max
  const targetBelow = targetPrice < axisBoundsY.min
  const targetInRange = !targetAbove && !targetBelow

  if (targetPrice > 0) {
    if (targetInRange) {
      // Target is within chart range — draw dashed line + tag
      const targetY = getYPos(targetPrice)
      ctx.save()
      ctx.strokeStyle = 'rgba(146,64,14,0.7)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(graph.left, targetY)
      ctx.lineTo(graph.right, targetY)
      ctx.stroke()
      ctx.restore()

      // Target tag — same arrow-pointer style as current price, but grey
      const estimatedEndY = getYPos(displayValue)
      if (Math.abs(targetY - estimatedEndY) > 22) {
        drawPriceTag(ctx, graph.right, targetY, targetPrice.toFixed(dp), '#52525b', '#fff')
      }
    } else {
      // Target is OUT of range — grey dashed line + tag at edge with chevron arrows
      const edgeY = targetAbove ? graph.top + 12 : graph.bottom - 12

      // Pulsating alpha for the whole indicator
      const phase = (now % ARROW_PULSE_PERIOD) / ARROW_PULSE_PERIOD
      const alpha = 0.5 + 0.5 * Math.abs(Math.sin(phase * Math.PI))

      // Grey dashed line across chart at the edge
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.strokeStyle = '#6b7280'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(graph.left, edgeY)
      ctx.lineTo(graph.right, edgeY)
      ctx.stroke()
      ctx.restore()

      // Grey tag with stacked chevron arrows
      ctx.save()
      ctx.globalAlpha = alpha
      drawTargetTagWithChevrons(ctx, graph.right, edgeY, targetAbove ? 'up' : 'down', '#52525b', '#fff')
      ctx.restore()
    }
  }

  // ─── Draw price curve ──────────────────────────────────────────────
  ctx.save()

  // Clip to graph area (including edge pad) so curves don't bleed into margins
  ctx.beginPath()
  ctx.rect(graph.left, graph.top, graphW + EDGE_PAD, graph.bottom - graph.top)
  ctx.clip()

  ctx.strokeStyle = '#f59e0b'
  ctx.fillStyle = '#f59e0bcc'
  ctx.lineWidth = 3

  // Build spline from all data except the newest tick (which the animation
  // is transitioning to), then append the animated endpoint as the final
  // spline point so the whole curve stays smooth — no straight line segment.
  const settled = data.length >= 3 ? data.slice(0, -1) : data
  const allPoints = settled.map((p) => ({
    x: getXPos(p.ts),
    y: getYPos(p.value),
  }))
  const endX = getXPos(now)
  const endY = getYPos(displayValue)

  const curvePoints: { x: number; y: number }[] = [allPoints[0]]
  const MIN_PX_DIST = 3
  for (let i = 1; i < allPoints.length; i++) {
    const prev = curvePoints[curvePoints.length - 1]
    const pt = allPoints[i]
    const dx = pt.x - prev.x
    const dy = pt.y - prev.y
    if (dx * dx + dy * dy >= MIN_PX_DIST * MIN_PX_DIST) {
      curvePoints.push(pt)
    }
  }
  // Append animated endpoint as the final curve point
  curvePoints.push({ x: endX, y: endY })

  if (curvePoints.length < 2) {
    ctx.restore()
    return
  }

  // Catmull-Rom bezier curve through all points including animated endpoint
  const cps = getControlPoints(curvePoints)
  const len = curvePoints.length

  ctx.beginPath()
  ctx.moveTo(curvePoints[0].x, curvePoints[0].y)

  if (len === 2) {
    ctx.lineTo(curvePoints[1].x, curvePoints[1].y)
  } else {
    // First segment: quadratic
    ctx.quadraticCurveTo(cps[0], cps[1], curvePoints[1].x, curvePoints[1].y)
    // Middle segments: cubic bezier
    for (let i = 1; i < len - 2; i++) {
      const c1 = (i - 1) * 4 + 2 // outgoing cp of point i
      const c2 = i * 4           // incoming cp of point i+1
      ctx.bezierCurveTo(
        cps[c1], cps[c1 + 1],
        cps[c2], cps[c2 + 1],
        curvePoints[i + 1].x, curvePoints[i + 1].y,
      )
    }
    // Last segment: quadratic
    const lastCp = (len - 3) * 4 + 2
    ctx.quadraticCurveTo(
      cps[lastCp], cps[lastCp + 1],
      curvePoints[len - 1].x, curvePoints[len - 1].y,
    )
  }
  ctx.stroke()

  // Fill area under curve — build closed path without stroking the edges
  ctx.lineTo(endX, graph.bottom)
  ctx.lineTo(curvePoints[0].x, graph.bottom)
  ctx.closePath()

  ctx.save()
  ctx.clip()
  const gradient = ctx.createLinearGradient(0, graph.top, 0, graph.bottom)
  gradient.addColorStop(0, 'rgba(245,158,11,0.15)')
  gradient.addColorStop(1, 'rgba(245,158,11,0.01)')
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.restore()

  // ─── Ping animation ────────────────────────────────────────────────
  const pingPhase = (now % PING_PERIOD) / PING_PERIOD
  const pingActive = pingPhase < PING_DURATION / PING_PERIOD
  if (pingActive) {
    const t = pingPhase / (PING_DURATION / PING_PERIOD) // 0→1 over 1s
    const radius = 4 + t * 18
    const alpha = 0.5 * (1 - t * t)
    ctx.beginPath()
    ctx.arc(endX, endY, radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(245,158,11,${alpha})`
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.closePath()
  }

  // Ending ball (solid, on top of ping)
  ctx.beginPath()
  ctx.arc(endX, endY, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#f59e0b'
  ctx.fill()
  ctx.closePath()

  ctx.restore() // undo clip

  // ─── Current price indicator ───────────────────────────────────────
  // Color based on actual tick direction, position based on animated displayValue
  const prevValue = data.length >= 2 ? data[data.length - 2].value : lastPoint.value
  const priceColor = lastPoint.value >= prevValue ? '#22c55e' : '#ef4444'

  // Horizontal dashed line at current price
  ctx.save()
  ctx.strokeStyle = `${priceColor}99`
  ctx.setLineDash([4, 4])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(graph.left, endY)
  ctx.lineTo(graph.right, endY)
  ctx.stroke()
  ctx.restore()

  // Price tag with arrow pointer — shows animated value
  drawPriceTag(ctx, graph.right, endY, displayValue.toFixed(dp), priceColor, '#000')
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function UnderlyingTickerChart({ underlying, targetPrice }: UnderlyingTickerChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<PricePoint[]>([])
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const midRef = useMainnetMidRef(underlying)

  // Animation state: smoothly ease the endpoint between ticks
  const animRef = useRef<{ fromValue: number; toValue: number; startTs: number }>({
    fromValue: 0, toValue: 0, startTs: 0,
  })

  // Draw function — computes interpolated display value each frame
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || dataRef.current.length < 2) return
    const { w, h } = sizeRef.current
    if (w <= 0 || h <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const now = Date.now()
    const anim = animRef.current
    // Interpolate: ease-out over SAMPLE_MS so it arrives before next tick
    // Fall back to last data value if animation not yet initialized
    let displayValue: number
    if (anim.startTs === 0) {
      displayValue = dataRef.current[dataRef.current.length - 1].value
    } else {
      const t = Math.min((now - anim.startTs) / SAMPLE_MS, 1)
      displayValue = anim.fromValue + (anim.toValue - anim.fromValue) * easeOut(t)
    }

    const dpr = window.devicePixelRatio || 1
    ctx.save()
    ctx.scale(dpr, dpr)
    drawChart(ctx, dataRef.current, targetPrice, w, h, now, displayValue)
    ctx.restore()
  }, [targetPrice])

  // Render timer — redraws at ~30fps using setInterval (rAF unreliable in some contexts)
  useEffect(() => {
    const timer = setInterval(drawFrame, FPS_INTERVAL)
    return () => clearInterval(timer)
  }, [drawFrame])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      sizeRef.current = { w: rect.width, h: rect.height }
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()

    return () => observer.disconnect()
  }, [])

  // Pre-fill with 1m candles, then sample live
  useEffect(() => {
    dataRef.current = []

    const now = Date.now()
    // Fetch 1m candles for the last 2 minutes — sparse but covers full window
    fetchMainnetCandles(underlying, '1m', now - 120_000, now)
      .catch(() => [])
      .then((candles) => {
        if (!Array.isArray(candles) || candles.length === 0) return
        const points: PricePoint[] = []
        for (const c of candles) {
          points.push({ ts: c.t, value: parseFloat(c.o) })
          points.push({ ts: c.t + 30_000, value: parseFloat(c.c) })
        }
        points.sort((a, b) => a.ts - b.ts)

        const earliest = dataRef.current.length > 0 ? dataRef.current[0].ts : Infinity
        const historical = points.filter((p) => p.ts < earliest)
        dataRef.current = [...historical, ...dataRef.current]

        // Initialize animation from the last prefilled value
        if (dataRef.current.length > 0) {
          const lastVal = dataRef.current[dataRef.current.length - 1].value
          animRef.current = { fromValue: lastVal, toValue: lastVal, startTs: Date.now() }
        }
      })

    // Live sampling every SAMPLE_MS
    const addPoint = () => {
      const midVal = midRef.current
      if (!midVal) return
      const price = parseFloat(midVal)
      if (isNaN(price)) return

      const ts = Date.now()
      const anim = animRef.current

      // Update animation: current interpolated position becomes "from", new price is "to"
      if (anim.startTs === 0) {
        // First point — snap, no animation
        animRef.current = { fromValue: price, toValue: price, startTs: ts }
      } else {
        const elapsed = Math.min((ts - anim.startTs) / SAMPLE_MS, 1)
        const currentDisplay = anim.fromValue + (anim.toValue - anim.fromValue) * easeOut(elapsed)
        animRef.current = { fromValue: currentDisplay, toValue: price, startTs: ts }
      }

      dataRef.current.push({ ts, value: price })

      const cutoff = ts - WINDOW_MS * 2
      dataRef.current = dataRef.current.filter((d) => d.ts > cutoff)
    }

    addPoint()
    const interval = setInterval(addPoint, SAMPLE_MS)
    return () => clearInterval(interval)
  }, [underlying])

  return (
    <div ref={containerRef} className="h-64 w-full relative">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  )
}
