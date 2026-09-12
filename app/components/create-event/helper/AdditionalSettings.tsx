import React from "react"
import { Settings } from "lucide-react"

interface AdditionalSettingsProps {
  enabledCollaboration: boolean
  setEnabledCollaboration: (value: boolean) => void
  allowAgents: boolean
  setAllowAgents: (value: boolean) => void
}

// NOTE: "Stop Date for Ticket Sales" used to live here — it's been moved to
// the Pricing tab (item 6 of the Sep 2026 UI renovation) so organizers set
// when to stop selling right alongside the tickets themselves, next to the
// new per-ticket-type sale start/stop windows. See add-pricing.tsx.
export function AdditionalSettings({
  enabledCollaboration,
  setEnabledCollaboration,
  allowAgents,
  setAllowAgents,
}: AdditionalSettingsProps) {
  return (
    <div className="space-y-6 rounded-xl border-2 border-slate-200 bg-white p-5 sm:p-6 lg:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 bg-[#6b2fa5]/10 rounded-lg">
          <Settings className="w-5 h-5 text-[#6b2fa5]" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Additional Settings</h2>
      </div>

      <div className="space-y-6">
        {/* Collaboration Toggle */}
        <div className="p-5 rounded-lg border-2 border-slate-200 hover:border-[#6b2fa5]/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <label className="text-sm font-semibold text-slate-900 block mb-1">
                Enable Collaboration
              </label>
              <p className="text-xs text-slate-600">
                Allow team members to help manage this event
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabledCollaboration}
                onChange={(e) => setEnabledCollaboration(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b2fa5]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6b2fa5]"></div>
            </label>
          </div>

          {enabledCollaboration && (
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex-1">
                <label className="text-sm font-semibold text-slate-900 block mb-1">
                  Allow Agents
                </label>
                <p className="text-xs text-slate-600">
                  Enable agents to sell tickets for this event
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowAgents}
                  onChange={(e) => setAllowAgents(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#6b2fa5]/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#6b2fa5]"></div>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
