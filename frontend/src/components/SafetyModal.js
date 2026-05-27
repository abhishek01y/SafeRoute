import { useEffect, useRef, useState } from 'react'

export default function SafetyModal({ open, onConfirm, emergencyContact }) {
  const timerRef = useRef(null)
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    if (!open) { setCountdown(60); return }
    timerRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1))
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="glass rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border-red-500/20 animate-fadeInUp">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl animate-markerPulse">🛡️</span>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white text-center mb-2">Security Verification</h2>
        <p className="text-slate-400 text-sm text-center mb-6">
          Are you safe? Please confirm within <span className="text-amber-400 font-semibold">{countdown}s</span>.
        </p>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-700 rounded-full mb-6 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${countdown > 20 ? 'bg-green-500' : countdown > 10 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${(countdown / 60) * 100}%` }}
          ></div>
        </div>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold text-sm hover:from-green-500 hover:to-green-600 transition-all btn-press shadow-lg shadow-green-500/20"
        >
          ✅ I am Safe
        </button>

        {/* Info */}
        <p className="text-[11px] text-slate-600 text-center mt-4">
          If unresponsive, emergency alert will be sent to {emergencyContact}
        </p>
      </div>
    </div>
  )
}
