/**
 * map-providers/script-loader.ts
 *
 * Loads an external <script> or <link rel="stylesheet"> exactly once per
 * URL and caches the in-flight/settled promise, so re-opening the map
 * picker (which re-mounts the provider's canvas component) never injects
 * duplicate tags or re-downloads the SDK.
 *
 * NOTE: for the Google Maps JS API, resolving this promise only means the
 * bootstrap stub arrived — it does NOT mean google.maps.Map exists. Always
 * go through ./google-loader, which awaits importLibrary() afterwards.
 */

const scriptPromises = new Map<string, Promise<void>>()
const stylesInjected = new Set<string>()

export function loadExternalScript(src: string): Promise<void> {
  const cached = scriptPromises.get(src)
  if (cached) return cached

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      // A tag from a previous mount whose promise we no longer hold (e.g.
      // after a Fast Refresh). If it already finished, resolve straight
      // away — attaching a "load" listener to a settled script would hang
      // forever.
      if (existing.dataset.loaded === "true") {
        resolve()
        return
      }
      if (existing.dataset.failed === "true") {
        reject(new Error(`Failed to load script: ${src}`))
        return
      }
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error(`Failed to load script: ${src}`)))
      return
    }

    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.dataset.loaded = "false"
    script.onload = () => {
      script.dataset.loaded = "true"
      resolve()
    }
    script.onerror = () => {
      script.dataset.failed = "true"
      // Drop the dead tag so a later retry can inject a fresh one.
      script.remove()
      reject(new Error(`Failed to load script: ${src}`))
    }
    document.head.appendChild(script)
  })

  scriptPromises.set(src, promise)
  // A failed load shouldn't be cached forever — let the next attempt retry.
  promise.catch(() => scriptPromises.delete(src))
  return promise
}

export function loadExternalStyle(href: string): void {
  if (stylesInjected.has(href)) return
  if (document.querySelector(`link[href="${href}"]`)) {
    stylesInjected.add(href)
    return
  }
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = href
  document.head.appendChild(link)
  stylesInjected.add(href)
}
