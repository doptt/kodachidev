import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'
import { GlassSurface, type GlassRadius, type GlassSurfaceProps } from './GlassSurface'
import { supportsLiquidGlass } from './liquidGlassSupport'

const radii: Record<GlassRadius, string> = {
  none: '',
  sm: 'rounded-glass-sm',
  md: 'rounded-glass',
  lg: 'rounded-glass-lg',
  pill: 'rounded-pill',
}
const radiusPx: Record<GlassRadius, number> = { none: 0, sm: 14, md: 24, lg: 32, pill: 9999 }

type OwnProps<T extends ElementType> = {
  as?: T
  radius?: GlassRadius
  className?: string
  contentClassName?: string
  /** Refraction strength in px at the rim (default 28). */
  strength?: number
  /** Width of the refracting rim as a fraction of the shorter side (0–1, default 0.55). */
  rim?: number
  /** Slight RGB split along the rim. */
  chromatic?: boolean
  children?: ReactNode
}

export type LiquidGlassProps<T extends ElementType = 'div'> = OwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof OwnProps<T>>

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Builds a displacement map (R = x offset, G = y offset, 128 = none) that is
 * neutral in the middle and pushes outward toward the rounded edge, which the
 * filter turns into a convex "lens" refracting the backdrop.
 */
function buildDisplacementMap(w: number, h: number, radius: number, rim: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(w, h)
  const data = img.data
  const r = Math.min(radius, Math.min(w, h) / 2)
  const hw = w / 2
  const hh = h / 2
  const edge = Math.max(4, Math.min(w, h) * 0.5 * rim)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Rounded-rect signed distance (negative inside)
      const px = x + 0.5 - hw
      const py = y + 0.5 - hh
      const qx = Math.abs(px) - (hw - r)
      const qy = Math.abs(py) - (hh - r)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const outside = Math.hypot(ox, oy)
      const inside = Math.min(Math.max(qx, qy), 0)
      const d = outside + inside - r

      // Outward normal from the gradient of the SDF
      let nx: number
      let ny: number
      if (outside > 0) {
        nx = ox / outside
        ny = oy / outside
      } else {
        nx = qx > qy ? 1 : 0
        ny = qx > qy ? 0 : 1
      }
      nx *= Math.sign(px) || 1
      ny *= Math.sign(py) || 1

      // 0 in the flat center, 1 at the rim, eased
      const t0 = Math.min(Math.max(1 + d / edge, 0), 1)
      const t = t0 * t0 * (3 - 2 * t0)
      const i = (y * w + x) * 4
      data[i] = Math.round(128 + nx * t * 127)
      data[i + 1] = Math.round(128 + ny * t * 127)
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * Liquid-glass refraction: an SVG displacement filter applied through
 * `backdrop-filter: url(#id)`. Chromium only — everywhere else it renders the
 * blur-only `GlassSurface` with identical markup and classes.
 */
export function LiquidGlass<T extends ElementType = 'div'>({
  as,
  radius = 'pill',
  className,
  contentClassName,
  strength = 28,
  rim = 0.55,
  chromatic = true,
  children,
  ...rest
}: LiquidGlassProps<T>) {
  const [supported, setSupported] = useState(false)
  useEffect(() => setSupported(supportsLiquidGlass()), [])

  // Generic prop forwarding: TS cannot relate Omit<..., keyof OwnProps<T>> back to T.
  const shared = { as, radius, className, contentClassName, ...rest } as GlassSurfaceProps<"div">
  if (!supported) {
    return <GlassSurface {...shared}>{children}</GlassSurface>
  }
  return (
    <Refracting {...(shared as LiquidGlassProps<"div">)} strength={strength} rim={rim} chromatic={chromatic}>
      {children}
    </Refracting>
  )
}

function Refracting<T extends ElementType>({
  as,
  radius = 'pill',
  className,
  contentClassName,
  strength = 28,
  rim = 0.55,
  chromatic = true,
  children,
  ...rest
}: LiquidGlassProps<T>) {
  const Tag = (as ?? 'div') as ElementType
  const ref = useRef<HTMLElement | null>(null)
  const rawId = useId()
  const id = `lg-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [map, setMap] = useState('')

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const w = Math.round(width)
      const h = Math.round(height)
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!size.w || !size.h) return
    setMap(buildDisplacementMap(size.w, size.h, radiusPx[radius], rim))
  }, [size, radius, rim])

  const ready = !!map
  const filter = ready ? `url(#${id}) blur(1.2px) saturate(1.8)` : 'blur(22px) saturate(1.85)'

  return (
    <Tag
      ref={ref}
      className={cn('glass', radii[radius], className)}
      style={{ WebkitBackdropFilter: filter, backdropFilter: filter }}
      {...rest}
    >
      {ready && (
        <svg aria-hidden="true" width="0" height="0" className="absolute" style={{ position: 'absolute' }}>
          <defs>
            <filter
              id={id}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={size.w}
              height={size.h}
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={map}
                x="0"
                y="0"
                width={size.w}
                height={size.h}
                preserveAspectRatio="none"
                result="map"
              />
              {chromatic ? (
                <>
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={strength * 0.9}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="dr"
                  />
                  <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={strength}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="dg"
                  />
                  <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
                  <feDisplacementMap
                    in="SourceGraphic"
                    in2="map"
                    scale={strength * 1.1}
                    xChannelSelector="R"
                    yChannelSelector="G"
                    result="db"
                  />
                  <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
                  <feBlend in="r" in2="g" mode="screen" result="rg" />
                  <feBlend in="rg" in2="b" mode="screen" />
                </>
              ) : (
                <feDisplacementMap
                  in="SourceGraphic"
                  in2="map"
                  scale={strength}
                  xChannelSelector="R"
                  yChannelSelector="G"
                />
              )}
            </filter>
          </defs>
        </svg>
      )}
      <div className={cn('glass-content', contentClassName)}>{children}</div>
    </Tag>
  )
}
