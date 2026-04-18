"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  loadExploreEvents,
  toggleFavourite,
  joinEvent,
  leaveEvent,
  incrementEventView,
  getCurrentUserId,
  type ExploreEvent,
  type ExploreFilters,
} from "@/app/actions/Exploreactions";

// ─── Location dropdown data (mirrors Firestore field values) ─────────────────
const LOCATION_DATA: Record<string, Record<string, string[]>> = {
  "All India":   { "All Districts": ["All Cities"] },
  "Tamil Nadu":  { "All Districts":["All Cities"], "Madurai":["All Cities","Madurai City","Melur","Thirumangalam","Usilampatti","Vadipatti","Alanganallur"],"Chennai":["All Cities","T. Nagar","Anna Nagar","Adyar","Velachery","Tambaram","Chrompet","Porur"],"Coimbatore":["All Cities","RS Puram","Saibaba Colony","Singanallur","Ganapathy","Peelamedu"],"Tiruchirappalli":["All Cities","Srirangam","KK Nagar","Ariyamangalam","Woraiyur"],"Salem":["All Cities","Fairlands","Suramangalam","Ammapet","Shevapet"],"Tirunelveli":["All Cities","Palayamkottai","Melapalayam","Vannarpet"],"Erode":["All Cities","Bhavani","Perundurai","Gobichettipalayam"],"Vellore":["All Cities","Katpadi","Ambur","Ranipet"],"Thanjavur":["All Cities","Kumbakonam","Papanasam","Pattukottai"],"Dindigul":["All Cities","Palani","Natham","Oddanchatram"],"Kanyakumari":["All Cities","Nagercoil","Marthandam","Padmanabhapuram"] },
  "Kerala":      { "All Districts":["All Cities"], "Ernakulam":["All Cities","Kochi","Kalamassery","Aluva","Edappally"],"Thiruvananthapuram":["All Cities","Kovalam","Technopark","Pattom","Kowdiar"],"Kozhikode":["All Cities","Calicut Beach","Nadakkavu","Mavoor"],"Thrissur":["All Cities","Guruvayur","Chalakudy","Irinjalakuda"],"Palakkad":["All Cities","Palakkad Town","Ottapalam","Shoranur"] },
  "Karnataka":   { "All Districts":["All Cities"], "Bengaluru Urban":["All Cities","Koramangala","Indiranagar","Whitefield","HSR Layout","Jayanagar","Malleshwaram"],"Mysuru":["All Cities","Mysore City","Nanjangud","T. Narsipur"],"Mangaluru":["All Cities","Mangalore City","Surathkal","Ullal"],"Hubli-Dharwad":["All Cities","Hubli","Dharwad"] },
  "Maharashtra": { "All Districts":["All Cities"], "Mumbai":["All Cities","Bandra","Andheri","Dadar","Colaba","Powai","Juhu"],"Pune":["All Cities","Koregaon Park","Hinjewadi","Viman Nagar","Kothrud"],"Nagpur":["All Cities","Dharampeth","Sitabuldi","Sadar"],"Nashik":["All Cities","Nashik Road","Deolali"] },
  "Delhi":       { "All Districts":["All Cities"], "Central Delhi":["All Cities","Connaught Place","Karol Bagh","Paharganj"],"South Delhi":["All Cities","Hauz Khas","Saket","Vasant Kunj","Lajpat Nagar"],"North Delhi":["All Cities","Civil Lines","Model Town","Pitampura"] },
  "Telangana":   { "All Districts":["All Cities"], "Hyderabad":["All Cities","Banjara Hills","Jubilee Hills","Madhapur","Hitech City","Ameerpet"],"Rangareddy":["All Cities","Gachibowli","Kondapur","Shamshabad"] },
};

const CATEGORIES = ["All","Tech","Music","Art","Food","Sports","Health","Business","Photography","Fashion","Gaming","Education"];
const CAT_COLORS: Record<string,{c:string;b:string}> = {
  Tech:{c:"#3C3489",b:"#EEEDFE"}, Music:{c:"#633806",b:"#FAEEDA"}, Art:{c:"#72243E",b:"#FBEAF0"}, Food:{c:"#712B13",b:"#FAECE7"},
  Sports:{c:"#085041",b:"#E1F5EE"}, Health:{c:"#27500A",b:"#EAF3DE"}, Business:{c:"#0C447C",b:"#E6F1FB"}, Photography:{c:"#085041",b:"#E1F5EE"},
  Fashion:{c:"#72243E",b:"#FBEAF0"}, Gaming:{c:"#3C3489",b:"#EEEDFE"}, Education:{c:"#0C447C",b:"#E6F1FB"},
};

// ─── DragScroll — lets mouse users click-and-drag to scroll horizontally ─────
function DragScroll({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref      = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const scrollL  = useRef(0);
  const moved    = useRef(false);          // did we actually drag?

  const onMouseDown = (e: React.MouseEvent) => {
    if (!ref.current) return;
    dragging.current = true;
    moved.current    = false;
    startX.current   = e.pageX - ref.current.offsetLeft;
    scrollL.current  = ref.current.scrollLeft;
    ref.current.style.cursor = "grabbing";
    ref.current.style.userSelect = "none";
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current || !ref.current) return;
    const x    = e.pageX - ref.current.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 3) moved.current = true;    // threshold before we call it a drag
    ref.current.scrollLeft = scrollL.current - walk;
  };

  const stopDrag = () => {
    dragging.current = false;
    if (ref.current) {
      ref.current.style.cursor = "grab";
      ref.current.style.userSelect = "";
    }
  };

  // If the user only clicked (didn't drag), don't swallow the click
  const onClickCapture = (e: React.MouseEvent) => {
    if (moved.current) e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ cursor:"grab", ...style }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onClickCapture={onClickCapture}
    >
      {children}
    </div>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────
function FilterPanel({ selState, selDist, selCity, activeCat, activeType, dateMode, startDate, endDate, search, activeFilterCount, onState, onDist, setSelCity, setActiveCat, setActiveType, setDateMode, setStartDate, setEndDate, setSearch, clearAll }: any) {
  const states    = Object.keys(LOCATION_DATA);
  const districts = selState === "All India" ? ["All Districts"] : Object.keys(LOCATION_DATA[selState] ?? {});
  const cities    = (selState === "All India" || selDist === "All Districts") ? ["All Cities"] : (LOCATION_DATA[selState]?.[selDist] ?? ["All Cities"]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
      {/* Search */}
      <div style={{ background:"#fff", borderRadius:"14px", border:"1px solid #E8E8F0", padding:"14px" }}>
        <p className="filter-label">Search</p>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:"10px", top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input type="text" placeholder="Search events, cities..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width:"100%", padding:"8px 10px 8px 30px", border:"1px solid #E8E8F0", borderRadius:"8px", fontSize:"13px", color:"#1A1A2E", fontFamily:"'DM Sans',sans-serif", background:"#FAFAFA" }} />
        </div>
      </div>

      {/* Location */}
      <div style={{ background:"#fff", borderRadius:"14px", border:"1px solid #E8E8F0", padding:"14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"11px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <p className="filter-label" style={{ marginBottom:0 }}>Location</p>
        </div>
        <div style={{ marginBottom:"8px" }}>
          <p className="filter-sublabel">State / Region</p>
          <select value={selState} onChange={e => onState(e.target.value)} className="filter-select">{states.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        {selState !== "All India" && (
          <div style={{ marginBottom:"8px" }}>
            <p className="filter-sublabel">District</p>
            <select value={selDist} onChange={e => onDist(e.target.value)} className="filter-select">{districts.map(d => <option key={d}>{d}</option>)}</select>
          </div>
        )}
        {selState !== "All India" && selDist !== "All Districts" && (
          <div>
            <p className="filter-sublabel">City / Area</p>
            <select value={selCity} onChange={e => setSelCity(e.target.value)} className="filter-select">{cities.map(c => <option key={c}>{c}</option>)}</select>
          </div>
        )}
        {selState !== "All India" && (
          <div style={{ marginTop:"10px", display:"flex", alignItems:"center", gap:"6px" }}>
            <span style={{ fontSize:"11px", padding:"3px 10px", background:"#EEEDFE", color:"#3C3489", borderRadius:"20px", fontWeight:500 }}>
              📍 {selCity !== "All Cities" ? selCity : selDist !== "All Districts" ? selDist : selState}
            </span>
            <button onClick={() => onState("All India")} style={{ fontSize:"11px", color:"#E24B4A", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>✕</button>
          </div>
        )}
      </div>

      {/* Date */}
      <div style={{ background:"#fff", borderRadius:"14px", border:"1px solid #E8E8F0", padding:"14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"11px" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p className="filter-label" style={{ marginBottom:0 }}>Date</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:"6px", marginBottom: dateMode==="custom"?"10px":0 }}>
          {([{val:"all",label:"📅 All dates"},{val:"today",label:"⚡ Today only"},{val:"custom",label:"🗓 Custom range"}] as const).map(({val,label}) => (
            <button key={val} onClick={() => setDateMode(val)} style={{ padding:"8px 12px", background: dateMode===val?"#1A1A2E":"#FAFAFA", border:`1px solid ${dateMode===val?"#1A1A2E":"#E8E8F0"}`, borderRadius:"8px", fontSize:"13px", color: dateMode===val?"#fff":"#888780", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left", fontWeight: dateMode===val?500:400, transition:"all .15s" }}>{label}</button>
          ))}
        </div>
        {dateMode==="custom" && (
          <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
            <div><p className="filter-sublabel">Start date</p><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="filter-select"/></div>
            <div><p className="filter-sublabel">End date</p><input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className="filter-select"/></div>
          </div>
        )}
      </div>

      {/* Entry type */}
      <div style={{ background:"#fff", borderRadius:"14px", border:"1px solid #E8E8F0", padding:"14px" }}>
        <p className="filter-label">Entry type</p>
        <div style={{ display:"flex", gap:"6px" }}>
          {(["All","Free","Paid"] as const).map(t => (
            <button key={t} onClick={() => setActiveType(t)} style={{ flex:1, padding:"8px 4px", background: activeType===t?(t==="Free"?"#E1F5EE":t==="Paid"?"#FAEEDA":"#1A1A2E"):"#FAFAFA", border:`1px solid ${activeType===t?(t==="Free"?"#1D9E75":t==="Paid"?"#BA7517":"#1A1A2E"):"#E8E8F0"}`, borderRadius:"8px", fontSize:"13px", fontWeight: activeType===t?600:400, color: activeType===t?(t==="Free"?"#085041":t==="Paid"?"#633806":"#fff"):"#888780", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>{t}</button>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <button onClick={clearAll} style={{ width:"100%", padding:"11px", background:"#FCEBEB", border:"1px solid #F7C1C1", borderRadius:"10px", fontSize:"13px", fontWeight:500, color:"#A32D2D", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:"6px" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Clear {activeFilterCount} filter{activeFilterCount>1?"s":""}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ExplorePage() {
  // ── UI filter state ──────────────────────────────────────────────────────
  const [selState,     setSelState]     = useState("All India");
  const [selDist,      setSelDist]      = useState("All Districts");
  const [selCity,      setSelCity]      = useState("All Cities");
  const [activeCat,    setActiveCat]    = useState("All");
  const [activeType,   setActiveType]   = useState<"All"|"Free"|"Paid">("All");
  const [dateMode,     setDateMode]     = useState<"all"|"today"|"custom">("all");
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const [search,       setSearch]       = useState("");
  const [sortBy,       setSortBy]       = useState<"popular"|"soonest"|"newest">("soonest");
  const [viewMode,     setViewMode]     = useState<"grid"|"list">("grid");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [filterOpen,   setFilterOpen]   = useState(false);

  // ── Firebase data state ─────────────────────────────────────────────────
  const [events,    setEvents]    = useState<ExploreEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState("");
  const [joiningId, setJoiningId] = useState<string|null>(null);

  // ── Debounce ref ────────────────────────────────────────────────────────
  const searchTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ── Fetch from Firestore ────────────────────────────────────────────────
  const fetchEvents = useCallback(async (filters: ExploreFilters) => {
    setLoading(true); setLoadError("");
    const result = await loadExploreEvents(filters);
    setLoading(false);
    if (result.success && result.data) setEvents(result.data);
    else setLoadError(result.error ?? "Failed to load events.");
  }, []);

  // ── Re-fetch on filter change (debounce search input) ──────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const delay = search ? 400 : 0;
    searchTimer.current = setTimeout(() => {
      fetchEvents({
        state:     selState !== "All India"     ? selState   : undefined,
        district:  selDist  !== "All Districts" ? selDist    : undefined,
        city:      selCity  !== "All Cities"    ? selCity    : undefined,
        category:  activeCat !== "All"          ? activeCat  : undefined,
        entryType: activeType !== "All"         ? activeType : undefined,
        dateMode:  dateMode !== "all"           ? dateMode   : undefined,
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
        search:    search.trim() || undefined,
        sortBy,
        pageSize: 50,
      });
    }, delay);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [selState,selDist,selCity,activeCat,activeType,dateMode,startDate,endDate,search,sortBy]);

  // ── Toggle favourite ────────────────────────────────────────────────────
  const handleToggleFav = async (eventId: string, currentState: boolean) => {
    if (!getCurrentUserId()) return;
    setEvents(prev => prev.map(e => e.id===eventId ? {...e, isFavourite:!currentState} : e));
    const result = await toggleFavourite(eventId, currentState);
    if (!result.success)
      setEvents(prev => prev.map(e => e.id===eventId ? {...e, isFavourite:currentState} : e));
  };

  // ── Join / Leave ────────────────────────────────────────────────────────
  const handleJoin = async (eventId: string, isJoined: boolean) => {
    if (!getCurrentUserId()) return;
    setJoiningId(eventId);
    // Optimistic update
    setEvents(prev => prev.map(e => e.id===eventId ? {...e, isJoined:!isJoined, joined: isJoined ? Math.max(0,e.joined-1) : e.joined+1} : e));
    const result = isJoined ? await leaveEvent(eventId) : await joinEvent(eventId);
    if (!result.success)
      setEvents(prev => prev.map(e => e.id===eventId ? {...e, isJoined, joined: isJoined ? e.joined+1 : Math.max(0,e.joined-1)} : e));
    setJoiningId(null);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const onState  = (s: string) => { setSelState(s); setSelDist("All Districts"); setSelCity("All Cities"); };
  const onDist   = (d: string) => { setSelDist(d); setSelCity("All Cities"); };
  const clearAll = () => { onState("All India"); setActiveCat("All"); setActiveType("All"); setDateMode("all"); setStartDate(""); setEndDate(""); setSearch(""); setShowFavsOnly(false); };

  const displayed = showFavsOnly ? events.filter(e => e.isFavourite) : events;
  const favList   = events.filter(e => e.isFavourite);

  const activeFilterCount = [
    selState!=="All India", activeCat!=="All", activeType!=="All",
    dateMode!=="all", search.trim()!=="", showFavsOnly,
  ].filter(Boolean).length;

  const filterProps = { selState, selDist, selCity, activeCat, activeType, dateMode, startDate, endDate, search, activeFilterCount, onState, onDist, setSelCity, setActiveCat, setActiveType, setDateMode, setStartDate, setEndDate, setSearch, clearAll };

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F5F5FA", minHeight:"100vh", width:"100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        .filter-label { font-size:10px; font-weight:600; color:#888780; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px; }
        .filter-sublabel { font-size:11px; color:#B4B2A9; margin-bottom:4px; }
        .filter-select { width:100%; padding:8px 10px; border:1px solid #E8E8F0; border-radius:8px; font-size:13px; color:#1A1A2E; font-family:'DM Sans',sans-serif; background:#FAFAFA; cursor:pointer; }
        .filter-select:focus { outline:none; border-color:#7F77DD; box-shadow:0 0 0 3px rgba(127,119,221,.12); }
        input:focus { outline:none; border-color:#7F77DD !important; box-shadow:0 0 0 3px rgba(127,119,221,.12); }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes sheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .ev-card { transition:transform .18s,box-shadow .18s; }
        .ev-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px rgba(26,26,46,.1) !important; }
        .fav-btn { transition:transform .15s; }
        .fav-btn:hover { transform:scale(1.2); }
        .scrollx::-webkit-scrollbar { display:none; }
        .scrollx { scrollbar-width:none; -webkit-overflow-scrolling:touch; }

        /* ── Category chips — scrollable row, never wraps ── */
        .cats-scroll {
          display:flex; flex-wrap:nowrap; gap:6px;
          overflow-x:auto; overflow-y:hidden;
          scrollbar-width:none; -webkit-overflow-scrolling:touch;
          padding-bottom:3px; min-width:0;
        }
        .cats-scroll::-webkit-scrollbar { display:none; }
        .cats-scroll > button { flex-shrink:0; white-space:nowrap; }
        .cats-scroll.dragging { user-select:none; cursor:grabbing !important; }
        input[type=date]::-webkit-calendar-picker-indicator { cursor:pointer; opacity:.7; }
        .filter-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:200; }
        .filter-backdrop.open { display:block; }
        .filter-sheet { position:fixed; bottom:0; left:0; right:0; background:#F5F5FA; border-radius:20px 20px 0 0; padding:0 16px 32px; z-index:201; max-height:88vh; overflow-y:auto; transform:translateY(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
        .filter-sheet.open { transform:translateY(0); animation:sheetUp .3s cubic-bezier(.4,0,.2,1) both; }
        .filter-sheet-handle { width:36px; height:4px; background:#E0E0EA; border-radius:2px; margin:12px auto 16px; }
        .explore-layout { display:grid; grid-template-columns:264px 1fr; gap:18px; align-items:start; }
        .sidebar-desktop { display:block; }
        .mobile-top-bar { display:none; overflow:hidden; }
        .mobile-filter-btn { display:none; }
        @media (max-width:900px) { .explore-layout { grid-template-columns:220px 1fr; gap:14px; } }
        @media (max-width:768px) { .explore-layout { grid-template-columns:1fr; } .sidebar-desktop { display:none; } .mobile-top-bar { display:flex; overflow:hidden; } .mobile-filter-btn { display:flex; } }
        .event-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:14px; }
        @media (max-width:480px) { .event-grid { grid-template-columns:1fr; gap:10px; } }
        .page-header-row { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .header-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .favs-strip { background:#fff; border:1px solid #E8E8F0; border-radius:14px; padding:14px 16px; margin-bottom:18px; }
        .fav-strip-item { flex-shrink:0; background:#F5F5FA; border:1px solid #E8E8F0; border-radius:10px; padding:9px 13px; display:flex; align-items:center; gap:9px; min-width:200px; }
        .event-row { background:#fff; border-radius:14px; border:1px solid #E8E8F0; padding:13px 16px; display:grid; grid-template-columns:52px 1fr auto; gap:13px; align-items:center; }
        @media (max-width:480px) {
          .event-row { grid-template-columns:44px 1fr; grid-template-rows:auto auto; }
          .event-row-actions { grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid #F0F0F8; margin-top:4px; }
        }
      `}</style>

      <div style={{ width:"100%", padding:"20px 16px 28px" }}>

        {/* Header */}
        <div style={{ marginBottom:"18px", animation:"fadeUp .4s ease both" }}>
          <p style={{ fontSize:"12px", color:"#888780", marginBottom:"3px" }}>Discover what's happening across India</p>
          <div className="page-header-row">
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(20px,4vw,26px)", fontWeight:700, color:"#1A1A2E", letterSpacing:"-0.02em" }}>Explore Events</h1>
            <div className="header-controls">
              <button onClick={() => setShowFavsOnly(!showFavsOnly)} style={{ display:"flex", alignItems:"center", gap:"6px", padding:"7px 12px", background: showFavsOnly?"#FCEBEB":"#fff", border:`1px solid ${showFavsOnly?"#F09595":"#E8E8F0"}`, borderRadius:"8px", fontSize:"12px", fontWeight:500, color: showFavsOnly?"#A32D2D":"#888780", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s", whiteSpace:"nowrap" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill={showFavsOnly?"#E24B4A":"none"} stroke={showFavsOnly?"#E24B4A":"#888780"} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                Saved {favList.length > 0 && `(${favList.length})`}
              </button>
              <div style={{ display:"flex", background:"#fff", border:"1px solid #E8E8F0", borderRadius:"8px", overflow:"hidden" }}>
                {(["grid","list"] as const).map(v => (
                  <button key={v} onClick={() => setViewMode(v)} style={{ padding:"7px 11px", background: viewMode===v?"#1A1A2E":"transparent", border:"none", cursor:"pointer", color: viewMode===v?"#fff":"#888780", transition:"all .15s", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center" }}>
                    {v==="grid" ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>}
                  </button>
                ))}
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ padding:"7px 10px", background:"#fff", border:"1px solid #E8E8F0", borderRadius:"8px", fontSize:"12px", color:"#1A1A2E", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
                <option value="soonest">Soonest</option>
                <option value="popular">Popular</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mobile: Filter button + category chips */}
        <div className="mobile-top-bar" style={{ alignItems:"center", gap:"10px", marginBottom:"14px" }}>
          <button className="mobile-filter-btn" onClick={() => setFilterOpen(true)} style={{ display:"flex", alignItems:"center", gap:"7px", padding:"9px 14px", background:"#fff", border:"1px solid #E8E8F0", borderRadius:"10px", fontSize:"13px", fontWeight:500, color:"#1A1A2E", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", flexShrink:0, position:"relative", whiteSpace:"nowrap" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
            Filters
            {activeFilterCount > 0 && <span style={{ position:"absolute", top:"-6px", right:"-6px", minWidth:"18px", height:"18px", background:"#7F77DD", borderRadius:"9px", fontSize:"10px", fontWeight:700, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px" }}>{activeFilterCount}</span>}
          </button>
          <DragScroll className="cats-scroll" style={{ flex:1, minWidth:0 }}>
            {CATEGORIES.map(cat => {
              const cc = cat !== "All" ? CAT_COLORS[cat] : null;
              const isA = activeCat === cat;
              return <button key={cat} onClick={() => setActiveCat(cat)} style={{ padding:"7px 13px", background: isA?(cc?cc.b:"#1A1A2E"):"#fff", border:`1px solid ${isA?(cc?cc.c:"#1A1A2E"):"#E8E8F0"}`, borderRadius:"20px", fontSize:"12px", fontWeight: isA?600:400, color: isA?(cc?cc.c:"#fff"):"#888780", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>{cat}</button>;
            })}
          </DragScroll>
        </div>

        {/* Saved strip */}
        {favList.length > 0 && (
          <div className="favs-strip" style={{ animation:"fadeUp .3s ease both" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"7px", marginBottom:"10px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#E24B4A" stroke="#E24B4A" strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              <span style={{ fontSize:"13px", fontWeight:600, color:"#1A1A2E" }}>Your favourites</span>
              <span style={{ fontSize:"11px", color:"#888780" }}>{favList.length} saved</span>
            </div>
            <div className="scrollx" style={{ display:"flex", gap:"10px", overflowX:"auto" }}>
              {favList.map(e => (
                <div key={e.id} className="fav-strip-item">
                  <span style={{ fontSize:"20px" }}>{e.image}</span>
                  <div style={{ minWidth:0 }}>
                    <p style={{ fontSize:"12px", fontWeight:600, color:"#1A1A2E", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"130px" }}>{e.title}</p>
                    <p style={{ fontSize:"11px", color:"#888780" }}>{e.dateDisplay} · {e.city}</p>
                  </div>
                  <button onClick={() => handleToggleFav(e.id, true)} style={{ background:"none", border:"none", cursor:"pointer", padding:"2px", flexShrink:0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two-col layout */}
        <div className="explore-layout">
          {/* Desktop sidebar */}
          <div className="sidebar-desktop" style={{ animation:"fadeUp .4s .1s ease both", opacity:0, animationFillMode:"forwards" }}>
            <div style={{ marginBottom:"12px", overflow:"hidden" }}>
              <DragScroll className="cats-scroll">
                {CATEGORIES.map(cat => {
                  const cc = cat !== "All" ? CAT_COLORS[cat] : null;
                  const isA = activeCat === cat;
                  return <button key={cat} onClick={() => setActiveCat(cat)} style={{ padding:"5px 13px", background: isA?(cc?cc.b:"#1A1A2E"):"#fff", border:`1px solid ${isA?(cc?cc.c:"#1A1A2E"):"#E8E8F0"}`, borderRadius:"20px", fontSize:"12px", fontWeight: isA?600:400, color: isA?(cc?cc.c:"#fff"):"#888780", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s" }}>{cat}</button>;
                })}
              </DragScroll>
            </div>
            <FilterPanel {...filterProps} />
          </div>

          {/* Events area */}
          <div style={{ animation:"fadeUp .4s .15s ease both", opacity:0, animationFillMode:"forwards", minWidth:0 }}>
            {/* Status bar */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px", flexWrap:"wrap", gap:"6px" }}>
              {loading ? (
                <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                  <span style={{ width:"14px",height:"14px",border:"2px solid #EEEDFE",borderTopColor:"#7F77DD",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite" }}/>
                  <span style={{ fontSize:"13px", color:"#888780" }}>Loading…</span>
                </div>
              ) : loadError ? (
                <span style={{ fontSize:"13px", color:"#E24B4A" }}>⚠️ {loadError}</span>
              ) : (
                <p style={{ fontSize:"13px", color:"#888780" }}>
                  <strong style={{ color:"#1A1A2E" }}>{displayed.length}</strong> events
                  {selState !== "All India" && <> in <strong style={{ color:"#7F77DD" }}>{selCity!=="All Cities"?selCity:selDist!=="All Districts"?selDist:selState}</strong></>}
                </p>
              )}
              {favList.length > 0 && <span style={{ fontSize:"11px", color:"#E24B4A", fontWeight:500 }}>♥ {favList.length} saved</span>}
            </div>

            {/* Empty */}
            {!loading && !loadError && displayed.length === 0 && (
              <div style={{ background:"#fff", borderRadius:"16px", border:"1px solid #E8E8F0", padding:"48px 24px", textAlign:"center" }}>
                <div style={{ fontSize:"40px", marginBottom:"10px" }}>🔍</div>
                <p style={{ fontSize:"15px", fontWeight:600, color:"#1A1A2E", marginBottom:"6px" }}>No events found</p>
                <p style={{ fontSize:"13px", color:"#888780", marginBottom:"16px" }}>Try adjusting your filters or search</p>
                <button onClick={clearAll} style={{ padding:"8px 20px", background:"#7F77DD", border:"none", borderRadius:"8px", fontSize:"13px", fontWeight:500, color:"#fff", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Clear all filters</button>
              </div>
            )}

            {/* Grid */}
            {!loading && viewMode==="grid" && displayed.length > 0 && (
              <div className="event-grid">
                {displayed.map((ev,i) => <EventCard key={ev.id} event={ev} delay={i*0.04} onFav={() => handleToggleFav(ev.id,ev.isFavourite)} onJoin={() => handleJoin(ev.id,ev.isJoined)} joiningId={joiningId}/>)}
              </div>
            )}

            {/* List */}
            {!loading && viewMode==="list" && displayed.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                {displayed.map((ev,i) => <EventRow key={ev.id} event={ev} delay={i*0.03} onFav={() => handleToggleFav(ev.id,ev.isFavourite)} onJoin={() => handleJoin(ev.id,ev.isJoined)} joiningId={joiningId}/>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      <div className={`filter-backdrop${filterOpen?" open":""}`} onClick={() => setFilterOpen(false)} />
      <div className={`filter-sheet${filterOpen?" open":""}`} aria-hidden={!filterOpen}>
        <div className="filter-sheet-handle"/>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
          <span style={{ fontSize:"16px", fontWeight:600, color:"#1A1A2E", fontFamily:"'DM Sans',sans-serif" }}>Filters</span>
          <button onClick={() => setFilterOpen(false)} style={{ background:"none", border:"none", cursor:"pointer", padding:"4px", display:"flex", alignItems:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888780" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <FilterPanel {...filterProps} />
        <button onClick={() => setFilterOpen(false)} style={{ width:"100%", padding:"13px", background:"#7F77DD", border:"none", borderRadius:"12px", fontSize:"14px", fontWeight:600, color:"#fff", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginTop:"16px" }}>
          Show {displayed.length} events
        </button>
      </div>
    </div>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({ event:e, delay, onFav, onJoin, joiningId }: { event:ExploreEvent; delay:number; onFav:()=>void; onJoin:()=>void; joiningId:string|null }) {
  const pct  = e.max ? Math.round((e.joined/e.max)*100) : 0;
  const bar  = pct>=90?"#E24B4A":pct>=70?"#BA7517":"#1D9E75";
  const full = e.max!==null && e.joined>=e.max;
  const isJoining = joiningId===e.id;

  return (
    <div className="ev-card" style={{ background:"#fff", borderRadius:"16px", border:"1px solid #E8E8F0", overflow:"hidden", boxShadow:"0 2px 8px rgba(26,26,46,.04)", animation:`fadeUp .4s ${delay}s ease both`, opacity:0, animationFillMode:"forwards" }}>
      <div style={{ height:"104px", background:e.categoryBg, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 14px", position:"relative" }}>
        <span style={{ fontSize:"42px" }}>{e.image}</span>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"5px" }}>
          <button className="fav-btn" onClick={onFav} style={{ width:"30px", height:"30px", borderRadius:"50%", background:"rgba(255,255,255,.9)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={e.isFavourite?"#E24B4A":"none"} stroke={e.isFavourite?"#E24B4A":"#888780"} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          </button>
          {e.status==="live" && <span style={{ fontSize:"10px",fontWeight:700,padding:"2px 7px",background:"#E1F5EE",color:"#085041",borderRadius:"20px",display:"flex",alignItems:"center",gap:"3px" }}><span style={{ width:"5px",height:"5px",borderRadius:"50%",background:"#1D9E75",animation:"pulse 1.5s infinite",display:"inline-block" }}/>Live</span>}
          {full && <span style={{ fontSize:"10px",fontWeight:700,padding:"2px 7px",background:"#FCEBEB",color:"#791F1F",borderRadius:"20px" }}>Full</span>}
        </div>
        <span style={{ position:"absolute",bottom:"8px",left:"12px",fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.type==="Free"?"#EAF3DE":"#FAEEDA",color:e.type==="Free"?"#27500A":"#633806" }}>{e.type==="Paid"?`₹${e.price}`:"Free"}</span>
      </div>
      <div style={{ padding:"13px 14px" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"5px" }}>
          <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 7px",borderRadius:"20px",background:e.categoryBg,color:e.categoryColor }}>{e.category}</span>
          <span style={{ fontSize:"11px",color:"#888780" }}>{e.dateDisplay}</span>
        </div>
        <h3 style={{ fontSize:"13px",fontWeight:600,color:"#1A1A2E",lineHeight:1.4,marginBottom:"7px",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden" }}>{e.title}</h3>
        <div style={{ display:"flex",flexDirection:"column",gap:"3px",marginBottom:"9px" }}>
          <span style={{ fontSize:"11px",color:"#888780",display:"flex",alignItems:"center",gap:"4px" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{e.time}</span>
          <span style={{ fontSize:"11px",color:"#888780",display:"flex",alignItems:"center",gap:"4px" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>{e.city}, {e.state}</span>
        </div>
        {e.max ? (
          <div style={{ marginBottom:"9px" }}>
            <div style={{ height:"3px",background:"#F0F0F8",borderRadius:"2px",overflow:"hidden" }}><div style={{ width:`${pct}%`,height:"100%",background:bar,borderRadius:"2px" }}/></div>
            <span style={{ fontSize:"10px",color:"#B4B2A9",marginTop:"2px",display:"block" }}>{e.joined}/{e.max} joined</span>
          </div>
        ) : <p style={{ fontSize:"10px",color:"#B4B2A9",marginBottom:"9px" }}>{e.joined} joined · Unlimited</p>}
        <div style={{ display:"flex", gap:"7px" }}>
          <Link href={`/events/${e.id}`} onClick={() => incrementEventView(e.id)} style={{ flex:1,display:"block",textAlign:"center",padding:"7px",background:"#F5F5FA",borderRadius:"8px",fontSize:"12px",fontWeight:500,color:"#444441",textDecoration:"none" }}>View →</Link>
          {!full ? (
            <button onClick={onJoin} disabled={isJoining} style={{ flex:1,padding:"7px",background:e.isJoined?"#FCEBEB":"#7F77DD",border:`1px solid ${e.isJoined?"#F09595":"transparent"}`,borderRadius:"8px",fontSize:"12px",fontWeight:600,color:e.isJoined?"#A32D2D":"#fff",cursor:isJoining?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",opacity:isJoining?.7:1 }}>
              {isJoining?"…":e.isJoined?"Leave":"Join"}
            </button>
          ) : (
            <span style={{ flex:1,display:"block",textAlign:"center",padding:"7px",background:"#F5F5FA",borderRadius:"8px",fontSize:"12px",color:"#B4B2A9",fontWeight:500 }}>Full</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────
function EventRow({ event:e, delay, onFav, onJoin, joiningId }: { event:ExploreEvent; delay:number; onFav:()=>void; onJoin:()=>void; joiningId:string|null }) {
  const pct = e.max ? Math.round((e.joined/e.max)*100) : 0;
  const bar = pct>=90?"#E24B4A":pct>=70?"#BA7517":"#1D9E75";
  const full = e.max!==null && e.joined>=e.max;
  const isJoining = joiningId===e.id;

  return (
    <div className="event-row" style={{ animation:`fadeUp .35s ${delay}s ease both`, opacity:0, animationFillMode:"forwards" }}>
      <div style={{ width:"44px",height:"44px",borderRadius:"12px",background:e.categoryBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"24px",flexShrink:0,alignSelf:"start" }}>{e.image}</div>
      <div style={{ minWidth:0 }}>
        <div style={{ display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"4px" }}>
          <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 6px",borderRadius:"20px",background:e.categoryBg,color:e.categoryColor }}>{e.category}</span>
          <span style={{ fontSize:"10px",fontWeight:600,padding:"2px 6px",borderRadius:"20px",background:e.type==="Free"?"#EAF3DE":"#FAEEDA",color:e.type==="Free"?"#27500A":"#633806" }}>{e.type==="Paid"?`₹${e.price}`:"Free"}</span>
          {e.status==="live" && <span style={{ fontSize:"10px",fontWeight:700,padding:"2px 6px",background:"#E1F5EE",color:"#085041",borderRadius:"20px",display:"flex",alignItems:"center",gap:"3px" }}><span style={{ width:"5px",height:"5px",borderRadius:"50%",background:"#1D9E75",animation:"pulse 1.5s infinite",display:"inline-block" }}/>Live</span>}
        </div>
        <h3 style={{ fontSize:"13px",fontWeight:600,color:"#1A1A2E",marginBottom:"3px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{e.title}</h3>
        <div style={{ display:"flex",gap:"10px",flexWrap:"wrap" }}>
          <span style={{ fontSize:"11px",color:"#888780" }}>{e.dateDisplay} · {e.time}</span>
          <span style={{ fontSize:"11px",color:"#888780" }}>📍 {e.city}, {e.state}</span>
        </div>
        {e.max && (
          <div style={{ display:"flex",alignItems:"center",gap:"6px",marginTop:"5px",maxWidth:"260px" }}>
            <div style={{ flex:1,height:"3px",background:"#F0F0F8",borderRadius:"2px" }}><div style={{ width:`${pct}%`,height:"100%",background:bar,borderRadius:"2px" }}/></div>
            <span style={{ fontSize:"10px",color:"#B4B2A9" }}>{e.joined}/{e.max}</span>
          </div>
        )}
      </div>
      {/* Desktop actions */}
      <div className="event-row-actions-desktop" style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"7px" }}>
        <button className="fav-btn" onClick={onFav} style={{ background:"none",border:"none",cursor:"pointer",padding:"3px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill={e.isFavourite?"#E24B4A":"none"} stroke={e.isFavourite?"#E24B4A":"#B4B2A9"} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        </button>
        <Link href={`/events/${e.id}`} onClick={() => incrementEventView(e.id)} style={{ padding:"6px 13px",background:"#7F77DD",borderRadius:"8px",fontSize:"12px",fontWeight:600,color:"#fff",textDecoration:"none",whiteSpace:"nowrap" }}>View →</Link>
        {!full && <button onClick={onJoin} disabled={isJoining} style={{ padding:"6px 13px",background:e.isJoined?"#FCEBEB":"transparent",border:`1px solid ${e.isJoined?"#F09595":"#E8E8F0"}`,borderRadius:"8px",fontSize:"12px",fontWeight:500,color:e.isJoined?"#A32D2D":"#888780",cursor:isJoining?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap" }}>{isJoining?"…":e.isJoined?"Leave":"Join"}</button>}
      </div>
      {/* Mobile actions */}
      <div className="event-row-actions" style={{ display:"none" }}>
        <button className="fav-btn" onClick={onFav} style={{ background:"none",border:"none",cursor:"pointer",padding:"3px",display:"flex",alignItems:"center",gap:"5px",fontSize:"12px",color:e.isFavourite?"#E24B4A":"#888780",fontFamily:"'DM Sans',sans-serif" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={e.isFavourite?"#E24B4A":"none"} stroke={e.isFavourite?"#E24B4A":"#888780"} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          {e.isFavourite?"Saved":"Save"}
        </button>
        <div style={{ display:"flex",gap:"7px" }}>
          <Link href={`/events/${e.id}`} onClick={() => incrementEventView(e.id)} style={{ padding:"7px 14px",background:"#7F77DD",borderRadius:"8px",fontSize:"12px",fontWeight:600,color:"#fff",textDecoration:"none" }}>View →</Link>
          {!full && <button onClick={onJoin} disabled={isJoining} style={{ padding:"7px 14px",background:e.isJoined?"#FCEBEB":"transparent",border:`1px solid ${e.isJoined?"#F09595":"#E8E8F0"}`,borderRadius:"8px",fontSize:"12px",fontWeight:500,color:e.isJoined?"#A32D2D":"#888780",cursor:isJoining?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif" }}>{isJoining?"…":e.isJoined?"Leave":"Join"}</button>}
        </div>
      </div>
    </div>
  );
}