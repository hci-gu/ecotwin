import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import { NavLink, useMatch } from "react-router-dom"

type PrimaryNavItem = {
  label: string
  to: string
  end?: boolean
}
type SecondaryNavItem = {
  label: string
}

const primaryNav: PrimaryNavItem[] = [
  { label: "Map", to: "/", end: true },
  { label: "Management plans", to: "/management-plans" },
  { label: "Simulations", to: "/simulations" },
]

const secondaryNav: SecondaryNavItem[] = [
  { label: "(menu item)" },
  { label: "(menu item)" },
  { label: "(menu item)" },
  { label: "(menu item)" },
]

export function TopNav() {
  const tileRouteMatch = useMatch("/tile/:tileId/*")
  const shouldShowSubmenu = Boolean(tileRouteMatch)
  const [submenuMounted, setSubmenuMounted] = useState(shouldShowSubmenu)
  const [submenuVisible, setSubmenuVisible] = useState(shouldShowSubmenu)
  const hideTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }

    if (shouldShowSubmenu) {
      setSubmenuMounted(true)
      const raf = window.requestAnimationFrame(() => setSubmenuVisible(true))
      return () => window.cancelAnimationFrame(raf)
    }

    setSubmenuVisible(false)
    hideTimerRef.current = window.setTimeout(() => {
      setSubmenuMounted(false)
      hideTimerRef.current = null
    }, 200)

    return () => {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [shouldShowSubmenu])

  return (
    <header className="w-full">
      <div className="flex h-14 items-stretch gap-8 bg-zinc-300 px-4">
        <div className="flex h-9 items-center self-center bg-zinc-900 px-3 text-sm font-semibold tracking-wide text-primary">
          ECOTWIN
        </div>

        <nav className="flex items-stretch gap-8 text-sm text-zinc-700">
          {primaryNav.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex cursor-pointer items-center px-1 hover:text-zinc-900",
                  isActive &&
                    "text-zinc-900 underline decoration-current decoration-2 underline-offset-8"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {submenuMounted ? (
        <div
          className={cn(
            "overflow-hidden bg-zinc-100 text-xs text-zinc-600 transition-[max-height,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            submenuVisible
              ? "max-h-[36px] opacity-100 translate-y-0"
              : "max-h-0 opacity-0 -translate-y-1"
          )}
        >
          <div className="flex h-9 items-center gap-10 px-4">
            {secondaryNav.map((item) => (
              <a key={item.label} href="#" className="hover:text-zinc-900">
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  )
}
