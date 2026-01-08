import { cn } from "@/lib/utils"
import { NavLink, useLocation } from "react-router-dom"

type PrimaryNavItem = {
  label: string
  to: string
  end?: boolean
}

const primaryNav: PrimaryNavItem[] = [
  { label: "Map", to: "/", end: true },
  { label: "Management plans", to: "/management-plans" },
  { label: "Simulations", to: "/simulations" },
]

export function TopNav() {
  const location = useLocation()

  return (
    <header className="fixed inset-x-0 top-0 z-50 pointer-events-none p-pane">
      <div className="relative flex h-14 items-center justify-center border border-white/40 bg-white/80 px-6 shadow-xl backdrop-blur-md pointer-events-auto rounded-pane">
        <div className="absolute left-6 text-lg font-bold tracking-wide text-[#1f2937]">
          ECOTWIN
        </div>

        <nav className="flex items-center gap-2 text-sm font-medium">
          {primaryNav.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-4 py-2 transition-all",
                  isActive || (item.label === "Map" && location.pathname.startsWith("/tile"))
                    ? "bg-[#3f5a50] text-white shadow-md scale-105"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  )
}
