const COLORS = ['#d4af37', '#f5e6a8', '#ffffff', '#b8942a', '#e34948', '#2a78d6']
const DURATION_MS = 4500

/** Full-screen confetti burst from both bottom corners. Skipped for reduced-motion users. */
export function fireConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100'
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }

  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)

  const particles = Array.from({ length: 220 }, (_, i) => {
    const fromLeft = i % 2 === 0
    // Aim up and inwards, roughly 55–80° from horizontal.
    const angle = ((55 + Math.random() * 25) * Math.PI) / 180
    const speed = 11 + Math.random() * 9
    return {
      x: fromLeft ? 0 : width,
      y: height,
      vx: Math.cos(angle) * speed * (fromLeft ? 1 : -1),
      vy: -Math.sin(angle) * speed * (height / 800),
      size: 6 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }
  })

  const start = performance.now()

  function frame(time: number) {
    const elapsed = time - start
    ctx!.clearRect(0, 0, width, height)
    ctx!.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION_MS * 0.7) / (DURATION_MS * 0.3))

    for (const p of particles) {
      p.vx *= 0.99
      p.vy = p.vy * 0.99 + 0.25
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.spin
      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.rotation)
      ctx!.fillStyle = p.color
      ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx!.restore()
    }

    if (elapsed < DURATION_MS) requestAnimationFrame(frame)
    else canvas.remove()
  }

  requestAnimationFrame(frame)
}
