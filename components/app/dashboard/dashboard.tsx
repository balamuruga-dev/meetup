"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  loadDashboardData,
  subscribeToStats,
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  loadRecommendedEvents,
  loadNearbyEvents,
  getGreeting,
  formatTodayDate,
  type DashboardData,
  type DashboardStats,
  type DashboardEvent,
  type DashboardNotification,
} from "@/app/actions/Dashboardactions";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  upcoming:  { label:"Upcoming",  color:"#3C3489", bg:"#EEEDFE" },
  live:      { label:"Live now",  color:"#085041", bg:"#E1F5EE" },
  past:      { label:"Past",      color:"#444441", bg:"#F1EFE8" },
  cancelled: { label:"Cancelled", color:"#791F1F", bg:"#FCEBEB" },
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data,         setData]         = useState<DashboardData | null>(null);
  const [stats,        setStats]        = useState<DashboardStats | null>(null);
  const [notifications,setNotifications]= useState<DashboardNotification[]>([]);
  const [recommended,  setRecommended]  = useState<DashboardEvent[]>([]);
  const [nearby,       setNearby]       = useState<DashboardEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [greeting]                      = useState(getGreeting());
  const [todayDate]                     = useState(formatTodayDate());

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      const result = await loadDashboardData();
      if (!mounted) return;

      if (!result.success || !result.data) {
        setError(result.error ?? "Failed to load dashboard.");
        setLoading(false);
        return;
      }

      const d = result.data;
      setData(d);
      setStats(d.stats);
      setNotifications(d.notifications);

      // Load recommended + nearby in parallel
      const [recResult, nearResult] = await Promise.all([
        loadRecommendedEvents(d.interests, d.userState, 6),
        loadNearbyEvents(d.userState, 6),
      ]);
      if (!mounted) return;
      if (recResult.success  && recResult.data)  setRecommended(recResult.data);
      if (nearResult.success && nearResult.data) setNearby(nearResult.data);

      setLoading(false);
    })();

    return () => { mounted = false; };
  }, []);

  // ── Real-time stats ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToStats(liveStats => setStats(liveStats));
    return () => unsub();
  }, []);

  // ── Real-time notifications ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToNotifications(liveNotifs => setNotifications(liveNotifs));
    return () => unsub();
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await markNotificationRead(id);
  };

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await markAllNotificationsRead();
  };

  if (loading) return <LoadingScreen />;
  if (error)   return <ErrorScreen msg={error} />;
  if (!data)   return null;

  const upcomingCreated = data.createdEvents.filter(e => e.status === "upcoming" || e.status === "live");
  const upcomingJoined  = data.joinedEvents.filter(e => e.status === "upcoming" || e.status === "live");

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F5F5FA", minHeight:"100vh", width:"100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:translateX(0)} }

        .ev-card { transition:transform .18s,box-shadow .18s; }
        .ev-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(26,26,46,.09) !important; }
        .stat-card { transition:border-color .2s,transform .15s; }
        .stat-card:hover { border-color:rgba(127,119,221,.3) !important; transform:translateY(-2px); }
        .notif-item { transition:background .15s; cursor:pointer; }
        .notif-item:hover { background:#F8F8FC !important; }
        .scrollx { scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .scrollx::-webkit-scrollbar { display:none; }
        .create-btn:hover { background:#6B63CC !important; }
        .section-link:hover { color:#3C3489 !important; }
        -webkit-tap-highlight-color: transparent;

        /* Notif backdrop */
        .notif-backdrop { position:fixed; inset:0; z-index:99; }
        .notif-panel {
          position:absolute; top:calc(100% + 10px); right:0;
          width:340px; background:#fff; border-radius:16px;
          border:1px solid #E8E8F0; box-shadow:0 12px 40px rgba(26,26,46,.14);
          z-index:100; animation:fadeUp .2s ease;
          max-height:480px; overflow-y:auto;
        }

        /* Stats grid */
        .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
        @media (max-width:700px) { .stats-grid { grid-template-columns:repeat(2,1fr); } }

        /* Section grid */
        .two-col { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        @media (max-width:720px) { .two-col { grid-template-columns:1fr; } }

        /* Rec grid */
        .rec-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
        @media (max-width:480px) { .rec-grid { grid-template-columns:1fr; } }

        /* Header row */
        .dash-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .header-actions { display:flex; align-items:center; gap:10px; flex-shrink:0; }

        /* Notif panel mobile */
        @media (max-width:480px) {
          .notif-panel { width:calc(100vw - 32px); right:-80px; }
        }

        /* Page padding */
        .page-pad { padding:20px 16px 48px; }
        @media (min-width:640px) { .page-pad { padding:24px 24px 48px; } }
        @media (min-width:1024px){ .page-pad { padding:28px 32px 48px; } }

        /* Stat value */
        .stat-val { font-size:22px; font-weight:700; color:#1A1A2E; letter-spacing:-.03em; margin-bottom:2px; }
        @media (max-width:480px) { .stat-val { font-size:18px; } }

        /* Section header */
        .sec-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }

        /* Interest pills */
        .int-pills { display:flex; flex-wrap:wrap; gap:7px; }
      `}</style>

      <div className="page-pad">

        {/* ── Header ── */}
        <div className="dash-header" style={{ marginBottom:"24px", animation:"fadeUp .4s ease" }}>
          <div>
            <p style={{ fontSize:"12px", color:"#888780", marginBottom:"3px" }}>{todayDate}</p>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(20px,4vw,26px)", fontWeight:700, color:"#1A1A2E", letterSpacing:"-0.02em" }}>
              {greeting}, {data.userName.split(" ")[0]} 👋
            </h1>
            {data.userCity && (
              <p style={{ fontSize:"12px", color:"#888780", marginTop:"3px", display:"flex", alignItems:"center", gap:"4px" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {data.userCity}, {data.userState}
              </p>
            )}
          </div>

          <div className="header-actions">
            {/* Notifications bell */}
            <div style={{ position:"relative" }}>
              <button onClick={() => setNotifOpen(!notifOpen)} style={{ width:"40px", height:"40px", borderRadius:"10px", background:"#fff", border:"1px solid #E8E8F0", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", position:"relative", flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#444441" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
                {unreadCount > 0 && (
                  <span style={{ position:"absolute", top:"-4px", right:"-4px", minWidth:"17px", height:"17px", background:"#E24B4A", borderRadius:"9px", fontSize:"9px", fontWeight:700, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", padding:"0 3px", border:"1.5px solid #F5F5FA" }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification panel */}
              {notifOpen && (
                <>
                  <div className="notif-backdrop" onClick={() => setNotifOpen(false)} />
                  <div className="notif-panel">
                    <div style={{ padding:"14px 16px 10px", borderBottom:"1px solid #F5F5FA", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:"14px", fontWeight:600, color:"#1A1A2E" }}>Notifications</span>
                      {unreadCount > 0 && (
                        <button onClick={handleMarkAllRead} style={{ fontSize:"11px", color:"#7F77DD", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                          Mark all read
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <div style={{ padding:"32px 16px", textAlign:"center" }}>
                        <div style={{ fontSize:"32px", marginBottom:"8px" }}>🔔</div>
                        <p style={{ fontSize:"13px", color:"#888780" }}>No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="notif-item" onClick={() => handleMarkRead(n.id)}
                          style={{ padding:"12px 16px", display:"flex", gap:"11px", alignItems:"flex-start", background: n.read ? "transparent" : "#FAFAFE", borderBottom:"1px solid #F5F5FA" }}>
                          <div style={{ width:"34px", height:"34px", borderRadius:"9px", background:n.iconBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", flexShrink:0 }}>{n.emoji}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:"12px", fontWeight:600, color:"#1A1A2E", marginBottom:"2px" }}>{n.title}</p>
                            <p style={{ fontSize:"11px", color:"#888780", lineHeight:1.5, marginBottom:"3px" }}>{n.body}</p>
                            <p style={{ fontSize:"10px", color:"#B4B2A9" }}>{n.timeAgo}</p>
                          </div>
                          {!n.read && <div style={{ width:"7px", height:"7px", borderRadius:"50%", background:"#7F77DD", flexShrink:0, marginTop:"4px" }}/>}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Create event CTA */}
            <Link href="/create-event" className="create-btn" style={{ display:"flex", alignItems:"center", gap:"7px", padding:"10px 16px", background:"#7F77DD", borderRadius:"10px", fontSize:"13px", fontWeight:600, color:"#fff", textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Create
            </Link>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="stats-grid" style={{ marginBottom:"24px", animation:"fadeUp .4s .05s ease both", opacity:0, animationFillMode:"forwards" }}>
          {[
            { label:"Events created",  value: String(stats?.totalEventsCreated ?? 0),        icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, bg:"#EEEDFE", sub:`${stats?.upcomingCount ?? 0} upcoming` },
            { label:"Total attendees", value: (stats?.totalJoined ?? 0).toLocaleString(),    icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>, bg:"#E1F5EE", sub:"Across all events" },
            { label:"Event views",     value: (stats?.totalViews ?? 0).toLocaleString(),     icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BA7517" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>, bg:"#FAEEDA", sub:"All-time views" },
            { label:"Revenue",         value:`₹${(stats?.totalRevenue ?? 0).toLocaleString()}`, icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4537E" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>, bg:"#FBEAF0", sub:"From paid events" },
          ].map((s, i) => (
            <div key={s.label} className="stat-card" style={{ background:"#fff", border:"1px solid #E8E8F0", borderRadius:"14px", padding:"14px 16px", animation:`fadeUp .4s ${.06*i}s ease both`, opacity:0, animationFillMode:"forwards" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"10px" }}>
                <div style={{ width:"32px", height:"32px", background:s.bg, borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{s.icon}</div>
                <span style={{ fontSize:"10px", color:"#888780", textAlign:"right", lineHeight:1.4, maxWidth:"68px" }}>{s.sub}</span>
              </div>
              <div className="stat-val">{s.value}</div>
              <div style={{ fontSize:"11px", color:"#888780" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── My upcoming events + Joined events ── */}
        <div className="two-col" style={{ marginBottom:"24px", animation:"fadeUp .4s .1s ease both", opacity:0, animationFillMode:"forwards" }}>

          {/* Created upcoming */}
          <div style={{ background:"#fff", borderRadius:"16px", border:"1px solid #E8E8F0", padding:"18px" }}>
            <div className="sec-row">
              <span style={{ fontSize:"13px", fontWeight:600, color:"#1A1A2E" }}>My upcoming events</span>
              <Link href="/my-events" className="section-link" style={{ fontSize:"12px", color:"#7F77DD", textDecoration:"none", fontWeight:500, transition:"color .15s" }}>See all</Link>
            </div>
            {upcomingCreated.length === 0 ? (
              <EmptyMini icon="📅" text="No upcoming events" cta="Create one" href="/create-event"/>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {upcomingCreated.slice(0,3).map(ev => <MiniEventRow key={ev.id} event={ev} showActions/>)}
              </div>
            )}
          </div>

          {/* Joined upcoming */}
          <div style={{ background:"#fff", borderRadius:"16px", border:"1px solid #E8E8F0", padding:"18px" }}>
            <div className="sec-row">
              <span style={{ fontSize:"13px", fontWeight:600, color:"#1A1A2E" }}>Events I'm attending</span>
              <Link href="/my-events?tab=joined" className="section-link" style={{ fontSize:"12px", color:"#7F77DD", textDecoration:"none", fontWeight:500, transition:"color .15s" }}>See all</Link>
            </div>
            {upcomingJoined.length === 0 ? (
              <EmptyMini icon="🎟️" text="No events joined yet" cta="Explore events" href="/explore"/>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
                {upcomingJoined.slice(0,3).map(ev => <MiniEventRow key={ev.id} event={ev}/>)}
              </div>
            )}
          </div>
        </div>

        {/* ── Interests ── */}
        {data.interests.length > 0 && (
          <div style={{ background:"#fff", borderRadius:"16px", border:"1px solid #E8E8F0", padding:"18px", marginBottom:"24px", animation:"fadeUp .4s .15s ease both", opacity:0, animationFillMode:"forwards" }}>
            <div className="sec-row">
              <span style={{ fontSize:"13px", fontWeight:600, color:"#1A1A2E" }}>Your interests</span>
              <Link href="/settings?section=interests" className="section-link" style={{ fontSize:"12px", color:"#7F77DD", textDecoration:"none", fontWeight:500 }}>Edit</Link>
            </div>
            <div className="int-pills">
              {data.interests.map((int, i) => (
                <Link key={int} href={`/explore?category=${int.toLowerCase()}`} style={{ padding:"5px 13px", borderRadius:"20px", fontSize:"12px", fontWeight:500, textDecoration:"none", background: i%3===0?"#EEEDFE":i%3===1?"#E1F5EE":"#FAEEDA", color: i%3===0?"#3C3489":i%3===1?"#085041":"#633806", border: `1px solid ${i%3===0?"rgba(127,119,221,.3)":i%3===1?"rgba(29,158,117,.25)":"rgba(186,117,23,.25)"}` }}>
                  {int}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Recommended events ── */}
        {recommended.length > 0 && (
          <div style={{ marginBottom:"24px", animation:"fadeUp .4s .18s ease both", opacity:0, animationFillMode:"forwards" }}>
            <div className="sec-row">
              <div>
                <h2 style={{ fontSize:"15px", fontWeight:600, color:"#1A1A2E" }}>Recommended for you</h2>
                <p style={{ fontSize:"12px", color:"#888780" }}>Based on your interests</p>
              </div>
              <Link href="/explore" className="section-link" style={{ fontSize:"12px", color:"#7F77DD", textDecoration:"none", fontWeight:500, flexShrink:0 }}>See all</Link>
            </div>
            <div className="rec-grid">
              {recommended.map((ev, i) => <EventCard key={ev.id} event={ev} delay={i*.04}/>)}
            </div>
          </div>
        )}

        {/* ── Nearby events ── */}
        {nearby.length > 0 && (
          <div style={{ animation:"fadeUp .4s .22s ease both", opacity:0, animationFillMode:"forwards" }}>
            <div className="sec-row">
              <div>
                <h2 style={{ fontSize:"15px", fontWeight:600, color:"#1A1A2E" }}>Near you</h2>
                <p style={{ fontSize:"12px", color:"#888780" }}>Events in {data.userState}</p>
              </div>
              <Link href="/explore" className="section-link" style={{ fontSize:"12px", color:"#7F77DD", textDecoration:"none", fontWeight:500, flexShrink:0 }}>Explore</Link>
            </div>
            <div className="scrollx" style={{ display:"flex", gap:"12px", overflowX:"auto", paddingBottom:"4px" }}>
              {nearby.map(ev => <NearbyCard key={ev.id} event={ev}/>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mini event row (used in the two-col section) ─────────────────────────────
function MiniEventRow({ event: e, showActions }: { event: DashboardEvent; showActions?: boolean }) {
  const st = STATUS_CFG[e.status];
  const isLive = e.status === "live";

  return (
    <div style={{ display:"flex", alignItems:"center", gap:"11px", padding:"10px 12px", background:"#F9F9FC", borderRadius:"11px" }}>
      <div style={{ width:"40px", height:"40px", borderRadius:"9px", background:e.categoryBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"20px", flexShrink:0 }}>
        {e.image}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:"12px", fontWeight:600, color:"#1A1A2E", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:"2px" }}>{e.title}</p>
        <div style={{ display:"flex", gap:"8px", alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ fontSize:"10px", fontWeight:600, padding:"1px 6px", borderRadius:"20px", background:st.bg, color:st.color, display:"flex", alignItems:"center", gap:"2px" }}>
            {isLive && <span style={{ width:"5px",height:"5px",borderRadius:"50%",background:"#1D9E75",animation:"pulse 1.5s infinite",display:"inline-block" }}/>}
            {st.label}
          </span>
          <span style={{ fontSize:"10px", color:"#888780" }}>{e.dateDisplay} · {e.time}</span>
        </div>
      </div>
      <div style={{ display:"flex", gap:"5px", flexShrink:0 }}>
        <Link href={`/events/${e.id}`} style={{ padding:"5px 10px", background:"#7F77DD", borderRadius:"7px", fontSize:"11px", fontWeight:600, color:"#fff", textDecoration:"none" }}>View</Link>
        {showActions && e.status !== "past" && (
          <Link href={`/events/${e.id}/edit`} style={{ padding:"5px 10px", background:"#F0F0F8", borderRadius:"7px", fontSize:"11px", fontWeight:500, color:"#444441", textDecoration:"none" }}>Edit</Link>
        )}
      </div>
    </div>
  );
}

// ─── Full event card (recommended grid) ──────────────────────────────────────
function EventCard({ event: e, delay }: { event: DashboardEvent; delay: number }) {
  const pct  = e.max ? Math.round((e.joined / e.max) * 100) : 0;
  const bar  = pct>=90?"#E24B4A":pct>=70?"#BA7517":"#1D9E75";
  const st   = STATUS_CFG[e.status];
  const full = e.max !== null && e.joined >= e.max;
  const isLive = e.status === "live";

  return (
    <div className="ev-card" style={{ background:"#fff", borderRadius:"16px", border:"1px solid #E8E8F0", overflow:"hidden", boxShadow:"0 2px 8px rgba(26,26,46,.04)", animation:`fadeUp .4s ${delay}s ease both`, opacity:0, animationFillMode:"forwards" }}>
      <div style={{ height:"88px", background:e.categoryBg, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px", position:"relative" }}>
        <span style={{ fontSize:"38px" }}>{e.image}</span>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"4px" }}>
          {isLive && (
            <span style={{ fontSize:"10px",fontWeight:700,padding:"2px 7px",background:"#E1F5EE",color:"#085041",borderRadius:"20px",display:"flex",alignItems:"center",gap:"3px" }}>
              <span style={{ width:"5px",height:"5px",borderRadius:"50%",background:"#1D9E75",animation:"pulse 1.5s infinite",display:"inline-block" }}/>Live
            </span>
          )}
          {full && <span style={{ fontSize:"10px",fontWeight:700,padding:"2px 7px",background:"#FCEBEB",color:"#791F1F",borderRadius:"20px" }}>Full</span>}
        </div>
        <span style={{ position:"absolute",bottom:"8px",left:"12px",fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.type==="Free"?"#EAF3DE":"#FAEEDA",color:e.type==="Free"?"#27500A":"#633806" }}>
          {e.type==="Paid"?`₹${e.price}`:"Free"}
        </span>
      </div>
      <div style={{ padding:"12px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"4px" }}>
          <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.categoryBg,color:e.categoryColor }}>{e.category}</span>
          <span style={{ fontSize:"10px",color:"#888780" }}>{e.dateDisplay}</span>
        </div>
        <h3 style={{ fontSize:"13px",fontWeight:600,color:"#1A1A2E",lineHeight:1.35,marginBottom:"6px",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden" }}>{e.title}</h3>
        <p style={{ fontSize:"11px",color:"#888780",marginBottom:"6px",display:"flex",alignItems:"center",gap:"3px" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {e.city}, {e.state}
        </p>
        {e.max ? (
          <div style={{ marginBottom:"10px" }}>
            <div style={{ height:"3px",background:"#F0F0F8",borderRadius:"2px",overflow:"hidden" }}>
              <div style={{ width:`${pct}%`,height:"100%",background:bar,borderRadius:"2px" }}/>
            </div>
            <span style={{ fontSize:"10px",color:"#B4B2A9",marginTop:"2px",display:"block" }}>{e.joined}/{e.max} joined</span>
          </div>
        ) : <p style={{ fontSize:"10px",color:"#B4B2A9",marginBottom:"10px" }}>{e.joined} joined</p>}
        <Link href={`/events/${e.id}`} style={{ display:"block",textAlign:"center",padding:"7px",background:full?"#F5F5FA":"#7F77DD",borderRadius:"8px",fontSize:"12px",fontWeight:600,color:full?"#B4B2A9":"#fff",textDecoration:"none" }}>
          {full?"Event full":"View event →"}
        </Link>
      </div>
    </div>
  );
}

// ─── Nearby card (horizontal scroll) ─────────────────────────────────────────
function NearbyCard({ event: e }: { event: DashboardEvent }) {
  const isLive = e.status === "live";
  return (
    <div className="ev-card" style={{ flexShrink:0, width:"220px", background:"#fff", borderRadius:"14px", border:"1px solid #E8E8F0", overflow:"hidden" }}>
      <div style={{ height:"70px", background:e.categoryBg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"32px", position:"relative" }}>
        {e.image}
        {isLive && (
          <span style={{ position:"absolute",top:"7px",right:"8px",fontSize:"9px",fontWeight:700,padding:"2px 6px",background:"#E1F5EE",color:"#085041",borderRadius:"20px",display:"flex",alignItems:"center",gap:"2px" }}>
            <span style={{ width:"4px",height:"4px",borderRadius:"50%",background:"#1D9E75",animation:"pulse 1.5s infinite",display:"inline-block" }}/>Live
          </span>
        )}
      </div>
      <div style={{ padding:"10px 12px" }}>
        <p style={{ fontSize:"11px",fontWeight:600,color:"#1A1A2E",marginBottom:"3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{e.title}</p>
        <p style={{ fontSize:"10px",color:"#888780",marginBottom:"2px" }}>{e.dateDisplay} · {e.time}</p>
        <p style={{ fontSize:"10px",color:"#888780",marginBottom:"8px" }}>📍 {e.city}</p>
        <Link href={`/events/${e.id}`} style={{ display:"block",textAlign:"center",padding:"6px",background:"#EEEDFE",borderRadius:"7px",fontSize:"11px",fontWeight:600,color:"#3C3489",textDecoration:"none" }}>
          View →
        </Link>
      </div>
    </div>
  );
}

// ─── Empty mini state ─────────────────────────────────────────────────────────
function EmptyMini({ icon, text, cta, href }: { icon:string; text:string; cta:string; href:string }) {
  return (
    <div style={{ padding:"24px 16px", textAlign:"center", background:"#F9F9FC", borderRadius:"12px" }}>
      <div style={{ fontSize:"28px", marginBottom:"8px" }}>{icon}</div>
      <p style={{ fontSize:"12px", color:"#888780", marginBottom:"10px" }}>{text}</p>
      <Link href={href} style={{ fontSize:"12px", fontWeight:600, color:"#7F77DD", textDecoration:"none" }}>{cta} →</Link>
    </div>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:"14px", fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:"36px", height:"36px", border:"3px solid #EEEDFE", borderTopColor:"#7F77DD", borderRadius:"50%", animation:"spin .8s linear infinite" }}/>
      <p style={{ fontSize:"13px", color:"#888780" }}>Loading your dashboard…</p>
    </div>
  );
}

// ─── Error screen ─────────────────────────────────────────────────────────────
function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:"12px", padding:"32px", fontFamily:"'DM Sans',sans-serif", textAlign:"center" }}>
      <div style={{ fontSize:"40px" }}>⚠️</div>
      <p style={{ fontSize:"16px", fontWeight:600, color:"#1A1A2E" }}>Something went wrong</p>
      <p style={{ fontSize:"13px", color:"#888780", maxWidth:"300px", lineHeight:1.6 }}>{msg}</p>
      <button onClick={() => window.location.reload()} style={{ padding:"10px 20px", background:"#7F77DD", border:"none", borderRadius:"10px", fontSize:"13px", fontWeight:600, color:"#fff", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
        Try again
      </button>
    </div>
  );
}