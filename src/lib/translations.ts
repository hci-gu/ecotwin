import translations from "@/translations.json"
import { useSyncExternalStore } from "react"

type Locale = keyof typeof translations

const defaultLocale: Locale = "en"
const localeStorageKey = "ecotwin-locale"

const localeNames: Record<Locale, string> = {
  en: "English",
  sv: "Svenska",
}

const listeners = new Set<() => void>()
let currentLocale: Locale = initialLocale()

if (typeof window !== "undefined") {
  window.document.documentElement.lang = currentLocale
}

function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && value in translations)
}

function initialLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale
  const stored = window.localStorage.getItem(localeStorageKey)
  return isLocale(stored) ? stored : defaultLocale
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const availableLocales = Object.keys(translations).map((locale) => ({
  locale: locale as Locale,
  label: localeNames[locale as Locale],
}))

export function getLocale() {
  return currentLocale
}

export function setLocale(locale: Locale) {
  if (locale === currentLocale) return
  currentLocale = locale
  if (typeof window !== "undefined") {
    window.localStorage.setItem(localeStorageKey, locale)
    window.document.documentElement.lang = locale
  }
  listeners.forEach((listener) => listener())
}

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => defaultLocale)
}

function lookup(path: string, locale: Locale = defaultLocale): string | undefined {
  const parts = path.split(".")
  let current: unknown = translations[locale]
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === "string" ? current : undefined
}

export function t(path: string, vars?: Record<string, string | number>) {
  const value = lookup(path, currentLocale) ?? lookup(path, defaultLocale) ?? path
  if (!vars) return value

  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    vars[key] === undefined ? "" : String(vars[key])
  )
}

export function tc(singularPath: string, pluralPath: string, count: number) {
  return t(count === 1 ? singularPath : pluralPath, { count })
}
