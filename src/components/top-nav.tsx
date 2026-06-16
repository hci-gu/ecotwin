import { cn } from "@/lib/utils"
import {
  availableLocales,
  setLocale,
  t,
  useLocale,
} from "@/lib/translations"
import { NavLink, useLocation } from "react-router-dom"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, LanguageCircleIcon } from "@hugeicons/core-free-icons"

export function TopNav() {
  const location = useLocation()
  const locale = useLocale()
  const primaryNav = [
    { label: t("nav.map"), to: "/", end: true, id: "map" },
    { label: t("nav.demo"), to: "/demo", id: "demo" },
    { label: t("nav.managementPlans"), to: "/management-plans", id: "managementPlans" },
    { label: t("nav.simulations"), to: "/simulations", id: "simulations" },
  ]

  return (
    <header className="fixed inset-x-0 top-0 z-50 pointer-events-none p-pane">
      <div className="relative flex h-14 items-center justify-center border border-white/40 bg-white/80 px-6 shadow-xl backdrop-blur-md pointer-events-auto rounded-pane">
        <div className="absolute left-6 text-lg font-bold tracking-wide text-[#1f2937]">
          {t("nav.brand")}
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
                  isActive || (item.label === t("nav.map") && location.pathname.startsWith("/tile"))
                    ? "bg-[#3f5a50] text-white shadow-md scale-105"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute right-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-zinc-200/80 bg-white/70 px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-white hover:text-zinc-950"
                aria-label={t("nav.language")}
                title={t("nav.language")}
              >
                <HugeiconsIcon icon={LanguageCircleIcon} size={16} />
                <span className="uppercase">{locale}</span>
                <HugeiconsIcon icon={ArrowDown01Icon} size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 bg-white text-zinc-900">
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={(value) => setLocale(value as typeof locale)}
              >
                {availableLocales.map((option) => (
                  <DropdownMenuRadioItem key={option.locale} value={option.locale}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
