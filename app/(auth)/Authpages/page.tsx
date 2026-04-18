"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/app/actions/authActions";

type AuthMode = "login" | "signup";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

function MeetULogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" stroke="#7F77DD" strokeWidth="2" />
      <path d="M9 14a5 5 0 0110 0" stroke="#7F77DD" strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="10" r="2.5" fill="#7F77DD" />
      <path d="M7 19c0-3.87 3.134-7 7-7s7 3.13 7 7" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const STATS = [
  { num: "12K+", label: "Events" },
  { num: "48K+", label: "Members" },
  { num: "120+", label: "Cities" },
];

const CATEGORIES = [
  { label: "🎵 Music",  color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  { label: "💻 Tech",   color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { label: "⚽ Sports", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { label: "🍜 Food",   color: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  { label: "🎨 Art",    color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  { label: "✈️ Travel", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
];

const FEATURES = [
  { icon: "📍", text: "Events near you, every day" },
  { icon: "🔔", text: "Smart alerts for your interests" },
  { icon: "🤝", text: "Connect with local communities" },
];

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode]       = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const switchMode = (m: AuthMode) => { setMode(m); setError(""); };

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    const result = await signInWithGoogle();
    setLoading(false);
    if (result.success) {
      "isLoggedIn=true; path=/; expires=Fri, 31 Dec 2035 23:59:59 GMT";
      router.push("/dashboard");
    } else {
      setError(result.error ?? "Google sign-in failed. Please try again.");
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .pjs { font-family: 'Plus Jakarta Sans', sans-serif; }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatA   { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-13px) rotate(2deg)} }
        @keyframes floatB   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
        @keyframes spin     { to { transform: rotate(360deg); } }
        @keyframes pulseRing {
          0%   { transform: scale(1);    opacity: 0.5; }
          100% { transform: scale(1.45); opacity: 0; }
        }
        .anim-1 { animation: fadeUp .45s ease both; }
        .anim-2 { animation: fadeUp .45s .08s ease both; }
        .anim-3 { animation: fadeUp .45s .16s ease both; }
        .float-a { animation: floatA 6s ease-in-out infinite; }
        .float-b { animation: floatB 8s 2s ease-in-out infinite; }
        .spinner { animation: spin .75s linear infinite; }
        .pulse-wrap { position: relative; display: inline-flex; }
        .pulse-wrap::after {
          content: '';
          position: absolute;
          inset: -5px;
          border-radius: 20px;
          border: 2px solid rgba(127,119,221,0.45);
          animation: pulseRing 2.2s ease-out infinite;
          pointer-events: none;
        }
        .google-btn {
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .google-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.10);
        }
        .google-btn:active:not(:disabled) {
          transform: scale(0.975);
          box-shadow: none;
        }
      `}</style>

      <div className="pjs flex flex-col md:flex-row min-h-screen" style={{ minHeight: "100dvh" }}>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            LEFT PANEL  ·  desktop only
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div
          className="hidden md:flex md:w-[44%] lg:w-[42%] relative overflow-hidden flex-shrink-0 flex-col justify-between px-10 lg:px-14 py-12"
          style={{ background: "#0A0A18" }}
        >
          {/* Glow blobs */}
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(127,119,221,0.18) 0%, transparent 70%)" }} />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(29,158,117,0.13) 0%, transparent 70%)" }} />

          {/* Brand */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(127,119,221,0.15)", border: "1px solid rgba(127,119,221,0.3)" }}>
              <MeetULogo size={24} />
            </div>
            <span className="text-white text-lg font-extrabold tracking-tight">MeetU</span>
          </div>

          {/* Hero */}
          <div className="relative z-10 flex flex-col gap-7">
            {/* Live badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full self-start"
              style={{ background: "rgba(127,119,221,0.12)", border: "1px solid rgba(127,119,221,0.28)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "#AFA9EC" }}>
                Live in 120+ cities
              </span>
            </div>

            <div>
              <h1 className="font-extrabold text-white leading-[1.08] tracking-tight mb-4"
                style={{ fontSize: "clamp(32px,3.2vw,48px)" }}>
                Find your<br />
                <span style={{ background: "linear-gradient(135deg,#a78bfa,#7F77DD)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  people &amp;
                </span>
                <br />your events.
              </h1>
              <p className="text-sm leading-relaxed max-w-[270px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                Discover local meetups, concerts, workshops, and more — curated for you, every day.
              </p>
            </div>

            {/* Stats */}
            <div className="flex gap-7">
              {STATS.map((s) => (
                <div key={s.label}>
                  <span className="block text-2xl font-extrabold text-white tracking-tight">{s.num}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest mt-0.5 block" style={{ color: "rgba(255,255,255,0.28)" }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Pills */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <span key={c.label}
                  className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border ${c.color}`}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          {/* Floating event cards */}
          <div className="relative z-10 flex gap-3">
            {[
              { icon: "🎧", name: "Electronic Night", meta: "Chennai · Tonight", dot: ["bg-violet-400","bg-pink-400","bg-amber-400"], going: "+48 going", float: "float-a" },
              { icon: "💻", name: "Tech Meetup",      meta: "Bangalore · Sat",   dot: ["bg-emerald-400","bg-sky-400","bg-rose-400"], going: "+120 going", float: "float-b" },
            ].map((card) => (
              <div key={card.name} className={`${card.float} flex-1 rounded-2xl p-4`}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
                    style={{ background: "rgba(255,255,255,0.08)" }}>
                    {card.icon}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{card.name}</p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.38)" }}>{card.meta}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex -space-x-1.5">
                    {card.dot.map((c, i) => (
                      <div key={i} className={`w-5 h-5 rounded-full ${c} border-2`} style={{ borderColor: "#0A0A18" }} />
                    ))}
                  </div>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.38)" }}>{card.going}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            RIGHT PANEL  ·  full on mobile
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex-1 flex flex-col relative overflow-hidden" style={{ background: "#F2F1FF", minHeight: "100dvh" }}>

          {/* Subtle bg blobs */}
          <div className="absolute top-0 right-0 w-72 h-72 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(167,139,250,0.18) 0%, transparent 65%)" }} />
          <div className="absolute bottom-0 left-0 w-56 h-56 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(29,158,117,0.12) 0%, transparent 65%)" }} />

          {/* ── Mobile top bar ── */}
          <div className="md:hidden flex items-center justify-between px-5 pt-8 pb-0 relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "#0A0A18", border: "1px solid rgba(127,119,221,0.4)" }}>
                <MeetULogo size={22} />
              </div>
              <span className="text-gray-900 text-base font-extrabold tracking-tight">MeetU</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-700">120+ cities</span>
            </div>
          </div>

          {/* ── Mobile hero ── */}
          <div className="md:hidden px-5 pt-6 pb-2 relative z-10">
            <h2 className="text-[28px] font-extrabold text-gray-900 leading-tight tracking-tight">
              Find your people<br />
              <span style={{ background: "linear-gradient(135deg,#7c3aed,#7F77DD)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                &amp; your events.
              </span>
            </h2>
            <div className="flex gap-5 mt-3">
              {STATS.map((s) => (
                <div key={s.label}>
                  <span className="block text-lg font-extrabold text-gray-900">{s.num}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Auth card ── */}
          <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-6 relative z-10">
            <div className="w-full max-w-[400px]">

              <div className="anim-1 bg-white rounded-3xl px-7 py-8 sm:px-8 sm:py-9"
                style={{ boxShadow: "0 20px 60px rgba(127,119,221,0.12), 0 4px 16px rgba(0,0,0,0.06)", border: "1px solid rgba(127,119,221,0.15)" }}>

                {/* Desktop header */}
                <div className="hidden md:block text-center mb-7">
                  <div className="pulse-wrap mb-5 mx-auto">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg,rgba(127,119,221,0.15),rgba(127,119,221,0.06))", border: "1.5px solid rgba(127,119,221,0.3)" }}>
                      <MeetULogo size={38} />
                    </div>
                  </div>
                  <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-1.5">
                    {mode === "login" ? "Welcome back 👋" : "Join MeetU 🎉"}
                  </h2>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {mode === "login" ? "Sign in to explore events near you" : "Create your free account in seconds"}
                  </p>
                </div>

                {/* Mobile header */}
                <div className="md:hidden mb-6">
                  <p className="text-xl font-extrabold text-gray-900 tracking-tight">
                    {mode === "login" ? "Welcome back 👋" : "Create account 🎉"}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {mode === "login" ? "Sign in to continue" : "Join thousands of event-goers"}
                  </p>
                </div>

                {/* Mode toggle */}
                <div className="anim-2 flex rounded-2xl p-1 mb-5 gap-1" style={{ background: "#F1F0FF" }}>
                  {(["login","signup"] as AuthMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                        mode === m
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {m === "login" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl mb-4"
                    style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0 mt-px" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span className="text-xs font-medium leading-relaxed" style={{ color: "#B91C1C" }}>{error}</span>
                  </div>
                )}

                {/* Google button */}
                <div className="anim-3">
                  <button
                    onClick={handleGoogle}
                    disabled={loading}
                    className="google-btn w-full flex items-center justify-center gap-3 rounded-2xl text-sm font-bold text-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      minHeight: "54px",
                      background: "#fff",
                      border: "2px solid #E5E7EB",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    }}
                  >
                    {loading ? (
                      <span className="spinner w-5 h-5 rounded-full"
                        style={{ border: "2px solid #E5E7EB", borderTopColor: "#7F77DD" }} />
                    ) : (
                      <>
                        <GoogleIcon />
                        {mode === "login" ? "Sign in with Google" : "Continue with Google"}
                      </>
                    )}
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px" style={{ background: "#F1F0FF" }} />
                  <span className="text-[11px] font-semibold" style={{ color: "#C4C2E8" }}>everything you get</span>
                  <div className="flex-1 h-px" style={{ background: "#F1F0FF" }} />
                </div>

                {/* Feature pills */}
                <div className="flex flex-col gap-2">
                  {FEATURES.map((f) => (
                    <div key={f.text} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
                      style={{ background: "#F8F7FF" }}>
                      <span className="text-base leading-none">{f.icon}</span>
                      <span className="text-xs font-semibold text-gray-600">{f.text}</span>
                    </div>
                  ))}
                </div>

                {/* Terms */}
                <p className="text-[11px] text-center leading-relaxed mt-5" style={{ color: "#C4C2E8" }}>
                  By continuing you agree to our{" "}
                  <a href="/terms" className="font-bold hover:underline" style={{ color: "#7F77DD" }}>Terms</a>
                  {" "}&amp;{" "}
                  <a href="/privacy" className="font-bold hover:underline" style={{ color: "#7F77DD" }}>Privacy Policy</a>.
                </p>
              </div>

              {/* Below card */}
              <p className="text-sm text-gray-400 text-center mt-5">
                {mode === "login" ? "New to MeetU? " : "Already have an account? "}
                <button
                  onClick={() => switchMode(mode === "login" ? "signup" : "login")}
                  className="font-extrabold hover:underline underline-offset-2"
                  style={{ color: "#7F77DD" }}
                >
                  {mode === "login" ? "Sign up free →" : "Sign in →"}
                </button>
              </p>

              {/* Secure tag */}
              <div className="flex items-center justify-center gap-1.5 mt-3">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span className="text-[11px] font-medium text-gray-300">Secured by Google OAuth 2.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}