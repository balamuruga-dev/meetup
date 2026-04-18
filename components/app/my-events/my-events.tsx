"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  loadCreatedEvents,
  loadJoinedEvents,
  loadSavedEvents,
  loadPastEvents,
  loadMyEventsSummary,
  cancelEvent,
  deleteEvent,
  type MyEvent,
  type MyEventsSummary,
} from "@/app/actions/my-events";

type EventTab = "created" | "joined" | "saved" | "past";

const STATUS_CFG: Record<MyEvent["status"],{label:string;color:string;bg:string}> = {
  upcoming:  {label:"Upcoming",  color:"#3C3489", bg:"#EEEDFE"},
  live:      {label:"Live now",  color:"#085041", bg:"#E1F5EE"},
  past:      {label:"Past",      color:"#444441", bg:"#F1EFE8"},
  cancelled: {label:"Cancelled", color:"#791F1F", bg:"#FCEBEB"},
};

const TABS: {id:EventTab; label:string; shortLabel:string; icon:React.ReactNode}[] = [
  { id:"created", label:"Created by me", shortLabel:"Created", icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
  { id:"joined",  label:"Joined",        shortLabel:"Joined",  icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { id:"saved",   label:"Saved",         shortLabel:"Saved",   icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> },
  { id:"past",    label:"Past events",   shortLabel:"Past",    icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
];

export default function MyEventsPage() {
  const [activeTab,  setActiveTab]  = useState<EventTab>("created");
  const [cancelId,   setCancelId]   = useState<string|null>(null);
  const [deleteId,   setDeleteId]   = useState<string|null>(null);

  // ── Per-tab event lists ─────────────────────────────────────────────────
  const [created, setCreated] = useState<MyEvent[]>([]);
  const [joined,  setJoined]  = useState<MyEvent[]>([]);
  const [saved,   setSaved]   = useState<MyEvent[]>([]);
  const [past,    setPast]    = useState<MyEvent[]>([]);

  // ── Summary stats from Firebase ────────────────────────────────────────
  const [summary, setSummary] = useState<MyEventsSummary | null>(null);

  // ── Loading / error per tab ────────────────────────────────────────────
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState("");

  // ── Track which tabs have been fetched (avoid re-fetching) ─────────────
  const [fetched, setFetched] = useState<Set<EventTab>>(new Set());

  // ── Load summary stats once ─────────────────────────────────────────────
  useEffect(() => {
    loadMyEventsSummary().then(res => {
      if (res.success && res.data) setSummary(res.data);
    });
  }, []);

  // ── Load data for active tab ────────────────────────────────────────────
  useEffect(() => {
    if (fetched.has(activeTab)) return;          // already loaded
    setLoading(true); setLoadErr("");

    const loaders: Record<EventTab, () => Promise<any>> = {
      created: loadCreatedEvents,
      joined:  loadJoinedEvents,
      saved:   loadSavedEvents,
      past:    loadPastEvents,
    };

    loaders[activeTab]().then(res => {
      setLoading(false);
      if (!res.success) { setLoadErr(res.error ?? "Failed to load."); return; }
      const data = res.data ?? [];
      if (activeTab === "created") setCreated(data);
      if (activeTab === "joined")  setJoined(data);
      if (activeTab === "saved")   setSaved(data);
      if (activeTab === "past")    setPast(data);
      setFetched(prev => new Set(prev).add(activeTab));
    });
  }, [activeTab]);

  // ── Derived helpers ────────────────────────────────────────────────────
  const tabEvents = activeTab==="created" ? created : activeTab==="joined" ? joined : activeTab==="saved" ? saved : past;

  // Stats — use live Firebase summary when available, fall back to local counts
  const totalViews    = summary?.totalViews   ?? created.reduce((s,e) => s+(e.views||0), 0);
  const totalRevenue  = summary?.totalRevenue ?? created.reduce((s,e) => s+(e.revenue||0), 0);
  const totalAttended = summary?.totalJoined  ?? created.reduce((s,e) => s+e.joined, 0);
  const upcomingOwned = summary?.upcomingCount ?? created.filter(e => e.status==="upcoming"||e.status==="live").length;
  const createdCount  = summary?.totalCreated ?? created.length;

  // ── Cancel handler ─────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!cancelId) return;
    const res = await cancelEvent(cancelId);
    if (res.success) {
      // Optimistic: mark as cancelled in created list
      setCreated(prev => prev.map(e => e.id === cancelId ? { ...e, status:"cancelled" } : e));
    }
    setCancelId(null);
  };

  // ── Delete handler ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await deleteEvent(deleteId);
    if (res.success) {
      setCreated(prev => prev.filter(e => e.id !== deleteId));
      setPast(prev => prev.filter(e => e.id !== deleteId));
    }
    setDeleteId(null);
  };

  // Tab count badges (use loaded data length or summary)
  const tabCount = (tab: EventTab) => {
    if (tab === "created") return createdCount;
    if (tab === "joined")  return joined.length;
    if (tab === "saved")   return saved.length;
    if (tab === "past")    return past.length;
    return 0;
  };

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F5F5FA", minHeight:"100vh", width:"100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(8px)}  to{opacity:1;transform:translateX(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }

        .ev-card { transition:transform .18s,box-shadow .18s; }
        .ev-card:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(26,26,46,.09) !important; }
        .action-btn { transition:opacity .15s; -webkit-tap-highlight-color:transparent; }
        .action-btn:hover { opacity:.85; }
        .stat-card { transition:border-color .2s,transform .15s; }
        .stat-card:hover { border-color:rgba(127,119,221,.3) !important; transform:translateY(-2px); }
        .create-cta:hover { background:#6B63CC !important; }
        .scrollx { scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .scrollx::-webkit-scrollbar { display:none; }

        .modal-overlay { position:fixed; inset:0; background:rgba(26,26,46,.55); z-index:200; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(3px); }
        .modal-box { background:#fff; border-radius:18px; padding:24px; max-width:380px; width:100%; animation:fadeUp .25s ease; }

        /* ── Stats grid ── */
        .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:22px; }
        @media (max-width:680px) { .stats-grid { grid-template-columns:repeat(2,1fr); gap:9px; } }

        /* ── Scrollable tabs ── */
        .tabs-bar { display:flex; gap:6px; margin-bottom:16px; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; padding-bottom:2px; }
        .tabs-bar::-webkit-scrollbar { display:none; }

        /* ── Created card ── */
        .cc-grid { display:grid; grid-template-columns:88px 1fr auto; }
        .cc-emoji { width:88px; min-height:110px; font-size:36px; }
        .cc-actions { padding:14px 14px 14px 0; display:flex; flex-direction:column; gap:7px; align-items:flex-end; min-width:106px; flex-shrink:0; }

        @media (max-width:580px) {
          .cc-grid { grid-template-columns:60px 1fr; }
          .cc-emoji { width:60px !important; font-size:26px !important; min-height:90px !important; }
          .cc-actions {
            grid-column:1/-1;
            flex-direction:row !important;
            flex-wrap:wrap;
            padding:0 12px 12px !important;
            min-width:0;
            gap:7px;
          }
          .cc-actions a, .cc-actions button { flex:1; text-align:center; }
        }

        /* ── Attendee card ── */
        .ac-grid { display:grid; grid-template-columns:76px 1fr auto; }
        .ac-emoji { width:76px; min-height:90px; font-size:30px; }
        .ac-actions { padding:12px 12px 12px 0; display:flex; flex-direction:column; gap:7px; align-items:flex-end; justify-content:center; min-width:96px; flex-shrink:0; }

        @media (max-width:580px) {
          .ac-grid { grid-template-columns:54px 1fr; }
          .ac-emoji { width:54px !important; font-size:24px !important; min-height:80px !important; }
          .ac-actions {
            grid-column:1/-1;
            flex-direction:row !important;
            padding:0 12px 12px !important;
            min-width:0;
            gap:7px;
          }
          .ac-actions a, .ac-actions button { flex:1; text-align:center; }
        }

        .analytics-row { display:flex; gap:14px; flex-wrap:wrap; margin-top:9px; padding-top:9px; border-top:1px solid #F5F5FA; }

        .stat-val { font-size:22px; font-weight:700; color:#1A1A2E; letter-spacing:-.03em; margin-bottom:2px; }
        @media (max-width:480px) { .stat-val { font-size:18px; } }

        .page-title { font-family:'Playfair Display',serif; font-size:clamp(20px,5vw,26px); font-weight:700; color:#1A1A2E; letter-spacing:-.02em; }
      `}</style>

      <div style={{ width:"100%", padding:"20px 16px 40px" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"22px", animation:"fadeUp .4s ease both", gap:"12px", flexWrap:"wrap" }}>
          <div>
            <p style={{ fontSize:"12px", color:"#888780", marginBottom:"4px" }}>Your activity</p>
            <h1 className="page-title">My Events</h1>
          </div>
          <Link href="/create-event" className="create-cta" style={{ display:"flex", alignItems:"center", gap:"7px", padding:"10px 16px", background:"#7F77DD", borderRadius:"10px", fontSize:"13px", fontWeight:600, color:"#fff", textDecoration:"none", whiteSpace:"nowrap", flexShrink:0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create
          </Link>
        </div>

        {/* Stats */}
        <div className="stats-grid" style={{ animation:"fadeUp .4s .05s ease both", opacity:0, animationFillMode:"forwards" }}>
          {[
            { label:"Events created",  value:String(createdCount),                icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, bg:"#EEEDFE", change:`${upcomingOwned} upcoming` },
            { label:"Total attendees", value:totalAttended.toLocaleString(),       icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>, bg:"#E1F5EE", change:"Across events" },
            { label:"Profile views",   value:totalViews.toLocaleString(),          icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BA7517" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>, bg:"#FAEEDA", change:"All events" },
            { label:"Total revenue",   value:`₹${totalRevenue.toLocaleString()}`,  icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4537E" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>, bg:"#FBEAF0", change:"Paid events" },
          ].map((s,i) => (
            <div key={s.label} className="stat-card" style={{ background:"#fff", border:"1px solid #E8E8F0", borderRadius:"13px", padding:"13px 14px", animation:`fadeUp .4s ${.07*i}s ease both`, opacity:0, animationFillMode:"forwards" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"9px" }}>
                <div style={{ width:"32px", height:"32px", background:s.bg, borderRadius:"8px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{s.icon}</div>
                <span style={{ fontSize:"10px", color:"#888780", textAlign:"right", lineHeight:1.4, maxWidth:"64px" }}>{s.change}</span>
              </div>
              <div className="stat-val">{s.value}</div>
              <div style={{ fontSize:"11px", color:"#888780" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="tabs-bar scrollx" style={{ animation:"fadeUp .4s .1s ease both", opacity:0, animationFillMode:"forwards" }}>
          {TABS.map(tab => {
            const count = tabCount(tab.id);
            const isA = activeTab===tab.id;
            return (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"8px 13px", background:isA?"#1A1A2E":"#fff", border:`1px solid ${isA?"#1A1A2E":"#E8E8F0"}`, borderRadius:"10px", fontSize:"13px", fontWeight:isA?500:400, color:isA?"#fff":"#888780", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", flexShrink:0, whiteSpace:"nowrap", WebkitTapHighlightColor:"transparent" }}>
                <span style={{ color:isA?"#AFA9EC":"rgba(0,0,0,.28)", display:"flex" }}>{tab.icon}</span>
                {tab.label}
                <span style={{ fontSize:"10px", padding:"1px 6px", borderRadius:"20px", background:isA?"rgba(255,255,255,.15)":"#F0F0F8", color:isA?"rgba(255,255,255,.7)":"#888780" }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Summary row */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"13px", flexWrap:"wrap", gap:"7px" }}>
          {loading ? (
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <span style={{ width:"14px",height:"14px",border:"2px solid #EEEDFE",borderTopColor:"#7F77DD",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite" }}/>
              <span style={{ fontSize:"13px", color:"#888780" }}>Loading…</span>
            </div>
          ) : loadErr ? (
            <span style={{ fontSize:"13px", color:"#E24B4A" }}>⚠️ {loadErr}</span>
          ) : (
            <p style={{ fontSize:"13px", color:"#888780" }}><strong style={{ color:"#1A1A2E" }}>{tabEvents.length}</strong> event{tabEvents.length!==1?"s":""}</p>
          )}
          {activeTab==="created" && !loading && (
            <div style={{ display:"flex", gap:"7px" }}>
              <span style={{ fontSize:"11px", padding:"3px 9px", borderRadius:"20px", background:"#E1F5EE", color:"#085041", fontWeight:500 }}>{upcomingOwned} upcoming</span>
              <span style={{ fontSize:"11px", padding:"3px 9px", borderRadius:"20px", background:"#F1EFE8", color:"#444441", fontWeight:500 }}>{created.filter(e=>e.status==="past").length} past</span>
            </div>
          )}
        </div>

        {/* Cards */}
        {!loading && !loadErr && tabEvents.length===0 ? <EmptyState tab={activeTab}/> : (
          !loading && <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
            {tabEvents.map((ev,i) =>
              activeTab==="created"
                ? <CreatedCard key={ev.id} event={ev} delay={i*.04} onCancel={()=>setCancelId(ev.id)} onDelete={()=>setDeleteId(ev.id)}/>
                : <AttendeeCard key={ev.id} event={ev} delay={i*.04} tab={activeTab}/>
            )}
          </div>
        )}
      </div>

      {/* Cancel Modal */}
      {cancelId && (
        <div className="modal-overlay" onClick={()=>setCancelId(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div style={{ width:"46px", height:"46px", borderRadius:"12px", background:"#FCEBEB", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:"14px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <h3 style={{ fontSize:"17px", fontWeight:600, color:"#1A1A2E", marginBottom:"8px" }}>Cancel this event?</h3>
            <p style={{ fontSize:"13px", color:"#888780", lineHeight:1.6, marginBottom:"20px" }}>All participants will be notified. This cannot be undone.</p>
            <div style={{ display:"flex", gap:"10px" }}>
              <button onClick={()=>setCancelId(null)} style={{ flex:1, padding:"11px", background:"transparent", border:"1.5px solid #E8E8F0", borderRadius:"9px", fontSize:"13px", fontWeight:500, color:"#888780", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Keep event</button>
              <button onClick={handleCancel} style={{ flex:1, padding:"11px", background:"#E24B4A", border:"none", borderRadius:"9px", fontSize:"13px", fontWeight:600, color:"#fff", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Yes, cancel it</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={()=>setDeleteId(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div style={{ width:"46px",height:"46px",borderRadius:"12px",background:"#FCEBEB",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:"14px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </div>
            <h3 style={{ fontSize:"17px",fontWeight:600,color:"#1A1A2E",marginBottom:"8px" }}>Delete this event?</h3>
            <p style={{ fontSize:"13px",color:"#888780",lineHeight:1.6,marginBottom:"20px" }}>This permanently deletes the event and removes all participants. This action <strong>cannot be undone</strong>.</p>
            <div style={{ display:"flex",gap:"10px" }}>
              <button onClick={()=>setDeleteId(null)} style={{ flex:1,padding:"11px",background:"transparent",border:"1.5px solid #E8E8F0",borderRadius:"9px",fontSize:"13px",fontWeight:500,color:"#888780",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Keep event</button>
              <button onClick={handleDelete} style={{ flex:1,padding:"11px",background:"#E24B4A",border:"none",borderRadius:"9px",fontSize:"13px",fontWeight:600,color:"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Delete forever</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreatedCard({event:e, delay, onCancel, onDelete}:{event:MyEvent;delay:number;onCancel:()=>void;onDelete:()=>void}) {
  const pct = e.max ? Math.round((e.joined/e.max)*100) : 0;
  const bar = pct>=90?"#E24B4A":pct>=70?"#BA7517":"#1D9E75";
  const full = e.max!==null && e.joined>=e.max;
  const st = STATUS_CFG[e.status];
  const isLive = e.status==="live";

  return (
    <div className="ev-card" style={{ background:"#fff", border:"1px solid #E8E8F0", borderRadius:"16px", overflow:"hidden", boxShadow:"0 2px 8px rgba(26,26,46,.04)", animation:`fadeUp .4s ${delay}s ease both`, opacity:0, animationFillMode:"forwards" }}>
      <div className="cc-grid">
        <div className="cc-emoji" style={{ background:e.categoryBg, display:"flex", alignItems:"center", justifyContent:"center" }}>{e.image}</div>

        <div style={{ padding:"13px 14px", minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:"5px", marginBottom:"6px", flexWrap:"wrap" }}>
            <span style={{ fontSize:"10px", fontWeight:600, padding:"2px 7px", borderRadius:"20px", background:st.bg, color:st.color, display:"flex", alignItems:"center", gap:"3px" }}>
              {isLive && <span style={{ width:"5px",height:"5px",borderRadius:"50%",background:"#1D9E75",animation:"pulse 1.5s infinite",display:"inline-block" }}/>}
              {st.label}
            </span>
            <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.categoryBg,color:e.categoryColor }}>{e.category}</span>
            <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.type==="Free"?"#EAF3DE":"#FAEEDA",color:e.type==="Free"?"#27500A":"#633806" }}>{e.type==="Paid"?`₹${e.price}`:"Free"}</span>
            {full && <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:"#FCEBEB",color:"#791F1F" }}>Full</span>}
          </div>
          <h3 style={{ fontSize:"14px",fontWeight:600,color:"#1A1A2E",marginBottom:"5px",lineHeight:1.3 }}>{e.title}</h3>
          <div style={{ display:"flex",gap:"12px",flexWrap:"wrap",marginBottom:"7px" }}>
            <span style={{ fontSize:"11px",color:"#888780",display:"flex",alignItems:"center",gap:"3px" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {e.dateDisplay} · {e.time}
            </span>
            <span style={{ fontSize:"11px",color:"#888780",display:"flex",alignItems:"center",gap:"3px" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {e.city}, {e.state}
            </span>
          </div>
          {e.max ? (
            <div style={{ maxWidth:"280px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:"3px" }}>
                <span style={{ fontSize:"10px",color:"#888780" }}>{e.joined}/{e.max} joined</span>
                <span style={{ fontSize:"10px",fontWeight:600,color:bar }}>{pct}%</span>
              </div>
              <div style={{ height:"4px",background:"#F0F0F8",borderRadius:"3px",overflow:"hidden" }}>
                <div style={{ width:`${pct}%`,height:"100%",background:bar,borderRadius:"3px" }}/>
              </div>
            </div>
          ) : <p style={{ fontSize:"11px",color:"#888780" }}>{e.joined} joined · Unlimited</p>}
          {e.status!=="cancelled" && (
            <div className="analytics-row">
              <span style={{ fontSize:"11px",color:"#888780",display:"flex",alignItems:"center",gap:"4px" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                {(e.views||0).toLocaleString()} views
              </span>
              {(e.revenue||0)>0 && (
                <span style={{ fontSize:"11px",color:"#1D9E75",fontWeight:500,display:"flex",alignItems:"center",gap:"4px" }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  ₹{(e.revenue||0).toLocaleString()} earned
                </span>
              )}
            </div>
          )}
        </div>

        <div className="cc-actions">
          {e.status!=="past" && e.status!=="cancelled" && (<>
            <Link href={`/events/${e.id}`}          className="action-btn" style={{ display:"block",padding:"7px 13px",background:"#7F77DD",borderRadius:"8px",fontSize:"12px",fontWeight:600,color:"#fff",textDecoration:"none",whiteSpace:"nowrap" }}>View</Link>
            <Link href={`/events/${e.id}/edit`}     className="action-btn" style={{ display:"block",padding:"7px 13px",background:"#F5F5FA",border:"1px solid #E8E8F0",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#444441",textDecoration:"none",whiteSpace:"nowrap" }}>Edit</Link>
            <button onClick={onCancel}               className="action-btn" style={{ padding:"7px 13px",background:"transparent",border:"1px solid #F7C1C1",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#E24B4A",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Cancel</button>
          </>)}
          {e.status==="cancelled" && (
            <button onClick={onDelete} className="action-btn" style={{ padding:"7px 13px",background:"#FCEBEB",border:"1px solid #F09595",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#A32D2D",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Delete</button>
          )}
          {e.status==="past" && (<>
            <Link href={`/events/${e.id}`}           className="action-btn" style={{ display:"block",padding:"7px 13px",background:"#F5F5FA",border:"1px solid #E8E8F0",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#444441",textDecoration:"none",whiteSpace:"nowrap" }}>Recap</Link>
            <Link href={`/events/${e.id}/duplicate`} className="action-btn" style={{ display:"block",padding:"7px 13px",background:"#EEEDFE",border:"1px solid rgba(127,119,221,.3)",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#3C3489",textDecoration:"none",whiteSpace:"nowrap" }}>Duplicate</Link>
            <button onClick={onDelete} className="action-btn" style={{ padding:"7px 13px",background:"#FCEBEB",border:"1px solid #F09595",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#A32D2D",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>Delete</button>
          </>)}
        </div>
      </div>
    </div>
  );
}

function AttendeeCard({event:e, delay, tab}:{event:MyEvent;delay:number;tab:EventTab}) {
  const pct = e.max ? Math.round((e.joined/e.max)*100) : 0;
  const bar = pct>=90?"#E24B4A":pct>=70?"#BA7517":"#1D9E75";
  const st  = STATUS_CFG[e.status];
  const isLive = e.status==="live";

  return (
    <div className="ev-card" style={{ background:"#fff",border:"1px solid #E8E8F0",borderRadius:"16px",overflow:"hidden",boxShadow:"0 2px 8px rgba(26,26,46,.04)",animation:`slideIn .4s ${delay}s ease both`,opacity:0,animationFillMode:"forwards" }}>
      <div className="ac-grid">
        <div className="ac-emoji" style={{ background:e.categoryBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>{e.image}</div>

        <div style={{ padding:"12px 14px",minWidth:0 }}>
          <div style={{ display:"flex",alignItems:"center",gap:"5px",marginBottom:"5px",flexWrap:"wrap" }}>
            <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:st.bg,color:st.color,display:"flex",alignItems:"center",gap:"3px" }}>
              {isLive && <span style={{ width:"5px",height:"5px",borderRadius:"50%",background:"#1D9E75",animation:"pulse 1.5s infinite",display:"inline-block" }}/>}
              {st.label}
            </span>
            <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.categoryBg,color:e.categoryColor }}>{e.category}</span>
            <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.type==="Free"?"#EAF3DE":"#FAEEDA",color:e.type==="Free"?"#27500A":"#633806" }}>{e.type==="Paid"?`₹${e.price}`:"Free"}</span>
          </div>
          <h3 style={{ fontSize:"13px",fontWeight:600,color:"#1A1A2E",marginBottom:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{e.title}</h3>
          <div style={{ display:"flex",gap:"10px",flexWrap:"wrap",marginBottom:"6px" }}>
            <span style={{ fontSize:"11px",color:"#888780",display:"flex",alignItems:"center",gap:"3px" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {e.dateDisplay} · {e.time}
            </span>
            <span style={{ fontSize:"11px",color:"#888780" }}>📍 {e.city}</span>
            <span style={{ fontSize:"11px",color:"#B4B2A9" }}>by {e.organizer}</span>
          </div>
          {e.max ? (
            <div style={{ maxWidth:"240px" }}>
              <div style={{ height:"3px",background:"#F0F0F8",borderRadius:"2px",overflow:"hidden" }}>
                <div style={{ width:`${pct}%`,height:"100%",background:bar,borderRadius:"2px" }}/>
              </div>
              <span style={{ fontSize:"10px",color:"#B4B2A9",marginTop:"2px",display:"block" }}>{e.joined}/{e.max}</span>
            </div>
          ) : <p style={{ fontSize:"10px",color:"#B4B2A9" }}>{e.joined} joined</p>}
        </div>

        <div className="ac-actions">
          <Link href={`/events/${e.id}`} className="action-btn" style={{ display:"block",padding:"7px 12px",background:"#7F77DD",borderRadius:"8px",fontSize:"12px",fontWeight:600,color:"#fff",textDecoration:"none",textAlign:"center" }}>View →</Link>
          {tab==="saved" && <button className="action-btn" style={{ padding:"7px 12px",background:"transparent",border:"1px solid #E8E8F0",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#888780",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Unsave</button>}
          {tab==="joined" && e.status!=="past" && <button className="action-btn" style={{ padding:"7px 12px",background:"transparent",border:"1px solid #F7C1C1",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#E24B4A",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Leave</button>}
          {tab==="past" && <button className="action-btn" style={{ padding:"7px 12px",background:"#EEEDFE",border:"1px solid rgba(127,119,221,.3)",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#3C3489",cursor:"pointer",fontFamily:"'DM Sans',sans-serif" }}>Review</button>}
        </div>
      </div>
    </div>
  );
}

function EmptyState({tab}:{tab:EventTab}) {
  const cfg = {
    created:{emoji:"📅",title:"No events created yet",       sub:"Create your first event and start building your community.",cta:"Create event",  href:"/create-event"},
    joined: {emoji:"🎟️",title:"No upcoming events joined",  sub:"Browse events near you and join ones that excite you.",    cta:"Explore events",href:"/explore"},
    saved:  {emoji:"🔖",title:"No saved events",            sub:"Save events you're interested in to find them later.",     cta:"Explore events",href:"/explore"},
    past:   {emoji:"🕐",title:"No past events yet",         sub:"Events you attend or create will appear here after they end.",cta:"Explore events",href:"/explore"},
  }[tab];
  return (
    <div style={{ background:"#fff",borderRadius:"16px",border:"1px solid #E8E8F0",padding:"48px 20px",textAlign:"center",animation:"fadeUp .4s ease" }}>
      <div style={{ fontSize:"40px",marginBottom:"12px" }}>{cfg.emoji}</div>
      <p style={{ fontSize:"16px",fontWeight:600,color:"#1A1A2E",marginBottom:"8px" }}>{cfg.title}</p>
      <p style={{ fontSize:"13px",color:"#888780",marginBottom:"20px",maxWidth:"280px",margin:"0 auto 20px",lineHeight:1.6 }}>{cfg.sub}</p>
      <Link href={cfg.href} style={{ display:"inline-flex",alignItems:"center",gap:"6px",padding:"10px 20px",background:"#7F77DD",borderRadius:"10px",fontSize:"13px",fontWeight:600,color:"#fff",textDecoration:"none" }}>{cfg.cta} →</Link>
    </div>
  );
}