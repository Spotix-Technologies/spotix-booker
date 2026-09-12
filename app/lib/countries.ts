/**
 * app/lib/countries.ts
 *
 * Free, no-API-key countries+states data for the event-location step —
 * lets an organizer pick a country and state so events/{id}.country and
 * .state can be queried per-state later (see search_events in the MCP).
 *
 * Uses CountriesNow (https://countriesnow.space) — a free, keyless REST
 * API commonly used for exactly this (country -> states) lookup. A
 * single POST to /countries/states returns every country's states in
 * one payload, cached in-memory for the life of the tab so the create
 * form and the edit tab don't each re-fetch it.
 */

export interface CountryStates {
  name: string
  iso2: string
  states: { name: string; state_code: string }[]
}

const COUNTRIES_STATES_URL = "https://countriesnow.space/api/v0.1/countries/states"

let cachedPromise: Promise<CountryStates[]> | null = null

/** Fetches (once) and caches the full country -> states dataset. */
export function fetchCountriesWithStates(): Promise<CountryStates[]> {
  if (cachedPromise) return cachedPromise

  cachedPromise = fetch(COUNTRIES_STATES_URL, { method: "GET" })
    .then((res) => {
      if (!res.ok) throw new Error(`CountriesNow request failed (${res.status})`)
      return res.json()
    })
    .then((json) => {
      if (json?.error || !Array.isArray(json?.data)) throw new Error("Unexpected CountriesNow response shape")
      return json.data as CountryStates[]
    })
    .catch((err) => {
      cachedPromise = null // allow a retry on the next call instead of caching a failure
      throw err
    })

  return cachedPromise
}

/** States for a single country name — convenience wrapper for a <select>'s onChange. */
export async function getStatesForCountry(countryName: string): Promise<string[]> {
  if (!countryName) return []
  const countries = await fetchCountriesWithStates()
  const match = countries.find((c) => c.name === countryName)
  return match ? match.states.map((s) => s.name) : []
}
