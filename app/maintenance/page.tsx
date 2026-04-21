import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Maintenance | Spotix Booker",
  description: "Spotix Booker is currently undergoing scheduled maintenance.",
  robots: { index: false, follow: false },
}

export default function MaintenancePage() {
  return (
    <main className="maintenance-root">
      {/* Ambient background blobs */}
      <span className="blob blob-1" aria-hidden />
      <span className="blob blob-2" aria-hidden />
      <span className="blob blob-3" aria-hidden />

      <div className="maintenance-card">
        {/* Illustration */}
        <div className="illustration-wrap">
          <Image
            src="/maintenance.svg"
            alt="Maintenance illustration"
            width={320}
            height={260}
            priority
            className="illustration"
          />
        </div>

        {/* Badge */}
        <span className="badge">
          <span className="badge-dot" />
          System Status
        </span>

        {/* Heading */}
        <h1 className="heading">
          System&#8209;Wide Maintenance<br />
          <span className="heading-accent">In Progress</span>
        </h1>

        {/* Body copy */}
        <p className="body-text">
          Oh, you caught us at a wrong time — but that&rsquo;s actually a good sign.
          We&rsquo;re currently fine-tuning parts of our platform so we can serve
          you faster, smarter, and more reliably than ever. Some services may be
          temporarily unavailable or behave unexpectedly while we work.
        </p>
        <p className="body-text secondary">
          We appreciate your patience and promise to be back before you know it.
          Follow our status page for live updates and an estimated return time.
        </p>

        {/* CTA */}
        <Link
          href="https://status.spotix.com.ng"
          target="_blank"
          rel="noopener noreferrer"
          className="status-btn"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Check Status Page
        </Link>

        <p className="footnote">
          Spotix Booker &mdash; we&rsquo;ll be right back.
        </p>
      </div>

      <style>{`
        /* ── Reset / base ── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .maintenance-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.25rem;
          background: #0d0914;
          position: relative;
          overflow: hidden;
          font-family: 'Geist', var(--font-geist-sans), sans-serif;
        }

        /* ── Ambient blobs ── */
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
          opacity: 0.35;
          animation: drift 18s ease-in-out infinite alternate;
        }
        .blob-1 {
          width: 520px; height: 520px;
          background: #6b2fa5;
          top: -160px; left: -140px;
          animation-delay: 0s;
        }
        .blob-2 {
          width: 380px; height: 380px;
          background: #9b59d0;
          bottom: -100px; right: -80px;
          animation-delay: -6s;
        }
        .blob-3 {
          width: 260px; height: 260px;
          background: #3d1260;
          top: 40%; left: 55%;
          animation-delay: -12s;
        }
        @keyframes drift {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(30px, 20px) scale(1.06); }
        }

        /* ── Card ── */
        .maintenance-card {
          position: relative;
          z-index: 1;
          max-width: 560px;
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(107,47,165,0.35);
          border-radius: 24px;
          padding: 3rem 2.5rem 2.5rem;
          backdrop-filter: blur(20px);
          text-align: center;
          box-shadow:
            0 0 0 1px rgba(107,47,165,0.1),
            0 32px 64px rgba(0,0,0,0.5);
          animation: cardIn 0.6s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Illustration ── */
        .illustration-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 1.75rem;
          animation: floatImg 5s ease-in-out infinite alternate;
        }
        .illustration {
          width: min(280px, 80vw);
          height: auto;
          drop-shadow: 0 8px 32px rgba(107,47,165,0.4);
        }
        @keyframes floatImg {
          from { transform: translateY(0); }
          to   { transform: translateY(-10px); }
        }

        /* ── Badge ── */
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          background: rgba(107,47,165,0.18);
          border: 1px solid rgba(107,47,165,0.45);
          border-radius: 99px;
          padding: 0.3rem 0.85rem;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #c084f5;
          margin-bottom: 1.25rem;
        }
        .badge-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #f59e0b;
          box-shadow: 0 0 6px #f59e0b;
          animation: pulse-dot 1.6s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.75); }
        }

        /* ── Heading ── */
        .heading {
          font-size: clamp(1.6rem, 5vw, 2.15rem);
          font-weight: 800;
          line-height: 1.2;
          color: #f3eeff;
          margin-bottom: 1.25rem;
          letter-spacing: -0.02em;
        }
        .heading-accent {
          color: #6b2fa5;
          -webkit-text-stroke: 1px #9b59d0;
          text-shadow: 0 0 32px rgba(107,47,165,0.7);
        }

        /* ── Body text ── */
        .body-text {
          font-size: 0.96rem;
          line-height: 1.75;
          color: #c4b5d8;
          margin-bottom: 0.85rem;
        }
        .body-text.secondary {
          color: #9680b0;
          font-size: 0.88rem;
          margin-bottom: 1.75rem;
        }

        /* ── CTA button ── */
        .status-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          background: #6b2fa5;
          color: #fff;
          font-size: 0.95rem;
          font-weight: 700;
          padding: 0.75rem 1.75rem;
          border-radius: 12px;
          text-decoration: none;
          letter-spacing: 0.01em;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 24px rgba(107,47,165,0.45);
          margin-bottom: 1.75rem;
        }
        .status-btn:hover {
          background: #7d38c0;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(107,47,165,0.6);
        }
        .status-btn:active {
          transform: translateY(0);
        }

        /* ── Footnote ── */
        .footnote {
          font-size: 0.75rem;
          color: #5a4470;
          letter-spacing: 0.03em;
        }

        /* ── Mobile ── */
        @media (max-width: 480px) {
          .maintenance-card {
            padding: 2rem 1.5rem 2rem;
          }
        }
      `}</style>
    </main>
  )
}