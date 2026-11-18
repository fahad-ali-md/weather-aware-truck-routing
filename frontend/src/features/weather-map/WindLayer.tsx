import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Map } from 'maplibre-gl'
import type { Route } from '../../lib/api'
import { windSamples } from './wind'

export function WindLayer({ mapRef, ready, route, hour, weatherVisible }: {
  mapRef: RefObject<Map | null>; ready: boolean; route?: Route; hour: number; weatherVisible: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [enabled, setEnabled] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const samples = windSamples(route?.checkpoints ?? [], hour)
  const available = samples.length > 0
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', change)
    return () => preference.removeEventListener('change', change)
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (!map || !element || !ctx || !ready) return
    const data = windSamples(route?.checkpoints ?? [], hour)
    let width = 0, height = 0, frame = 0, last = 0, moving = false
    let projected: { x: number; y: number; east: number; north: number }[] = []
    type Particle = { x: number; y: number; life: number }
    let particles: Particle[] = []
    const active = enabled && weatherVisible && !reducedMotion && data.length > 0
    function clear() { ctx!.clearRect(0, 0, width, height) }
    function seed(): Particle {
      const point = projected[Math.floor(Math.random() * projected.length)]
      return { x: (point?.x ?? 0) + (Math.random() - 0.5) * 140, y: (point?.y ?? 0) + (Math.random() - 0.5) * 140, life: 1 + Math.random() * 3 }
    }
    function project() {
      width = map!.getContainer().clientWidth; height = map!.getContainer().clientHeight
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      element!.width = Math.round(width * ratio); element!.height = Math.round(height * ratio)
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
      projected = data.map(point => ({ ...map!.project([point.lon, point.lat]), east: point.east, north: point.north }))
        .filter(point => point.x >= -100 && point.x <= width + 100 && point.y >= -100 && point.y <= height + 100)
      particles = Array.from({ length: width < 600 ? 100 : 200 }, seed)
      clear()
    }
    function draw(now: number) {
      frame = requestAnimationFrame(draw)
      if (document.hidden || moving || !projected.length || now - last < 33) return
      const dt = Math.min((now - (last || now)) / 1000, 0.06)
      last = now
      ctx!.globalCompositeOperation = 'destination-out'
      ctx!.fillStyle = 'rgba(0,0,0,0.12)'; ctx!.fillRect(0, 0, width, height)
      ctx!.globalCompositeOperation = 'source-over'
      ctx!.strokeStyle = 'rgba(21,78,101,0.85)'; ctx!.lineWidth = 1.5; ctx!.lineCap = 'round'
      const bearing = map!.getBearing() * Math.PI / 180
      ctx!.beginPath()
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i]
        let weight = 0, east = 0, north = 0
        for (const point of projected) {
          const distance = (point.x - particle.x) ** 2 + (point.y - particle.y) ** 2
          if (distance > 110 ** 2) continue
          const w = 1 / Math.max(25, distance)
          weight += w; east += w * point.east; north += w * point.north
        }
        if (!weight || particle.life <= 0 || particle.x < 0 || particle.x > width || particle.y < 0 || particle.y > height) { particles[i] = seed(); continue }
        east /= weight; north /= weight
        const dx = (east * Math.cos(bearing) - north * Math.sin(bearing)) * 2.4 * dt
        const dy = (-east * Math.sin(bearing) - north * Math.cos(bearing)) * 2.4 * dt
        ctx!.moveTo(particle.x, particle.y)
        particle.x += dx; particle.y += dy; particle.life -= dt
        ctx!.lineTo(particle.x, particle.y)
      }
      ctx!.stroke()
    }
    function startMove() { moving = true; clear() }
    function endMove() { moving = false; project(); last = 0 }
    project()
    if (active) frame = requestAnimationFrame(draw)
    map.on('movestart', startMove); map.on('moveend', endMove); map.on('resize', endMove)
    return () => {
      cancelAnimationFrame(frame); clear()
      map.off('movestart', startMove); map.off('moveend', endMove); map.off('resize', endMove)
    }
  }, [mapRef, ready, route, hour, enabled, weatherVisible, reducedMotion])

  return <><canvas ref={canvas} className="wind-canvas" aria-hidden="true" />{route && <div className="wind-control"><button type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>≋ Wind motion <span>{enabled ? 'On' : 'Off'}</span></button><small>{reducedMotion ? 'Paused · reduced motion' : !weatherVisible ? 'Enable weather layer' : !available ? 'Calm or direction unavailable' : `+${hour}h · Flow follows forecast wind`}</small></div>}</>
}
