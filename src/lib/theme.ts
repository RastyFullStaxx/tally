// Light and dark: the `light` / `dark` class on <html> picks the colour tokens in index.css. index.html applies the
// saved theme before the first paint (so a light phone never flashes navy); this switches it while the app runs.

export type Theme = "dark" | "light"

// The browser chrome around the app (the status bar on Android, the tab strip on desktop) matches the background.
const CHROME = { dark: "#0b1426", light: "#f6f3ec" }

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle("light", theme === "light")
  root.classList.toggle("dark", theme === "dark")
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CHROME[theme])
}

/**
 * Switches with the new theme growing as a circle from `from` (where it was tapped), using the View Transitions
 * API: no animation library, and a plain instant switch where it isn't supported or motion is reduced.
 */
export function switchTheme(theme: Theme, from = { x: innerWidth / 2, y: innerHeight / 2 }) {
  const doc = document as Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } }
  if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return applyTheme(theme)
  const { x, y } = from
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  doc
    .startViewTransition(() => applyTheme(theme))
    .ready.then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 450, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" }
      )
    )
    .catch(() => {})
}
