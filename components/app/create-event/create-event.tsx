"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Action imports (all Firebase logic lives here) ───────────────────────────
import {
  uploadCoverImage,
  createEvent,
  saveDraft,
  validateStep,
  type CreateEventPayload,
} from "@/app/actions/Create-Event";

// ─── Location Data ────────────────────────────────────────────────────────────
const LOCATION_DATA: Record<string, Record<string, string[]>> = {
  "Tamil Nadu": {
    "Madurai":          ["Madurai City","Melur","Thirumangalam","Usilampatti","Alanganallur"],
    "Chennai":          ["T. Nagar","Anna Nagar","Adyar","Velachery","Tambaram","Porur"],
    "Coimbatore":       ["RS Puram","Saibaba Colony","Singanallur","Ganapathy","Peelamedu"],
    "Tiruchirappalli":  ["Srirangam","KK Nagar","Ariyamangalam","Woraiyur"],
    "Salem":            ["Fairlands","Suramangalam","Ammapet","Shevapet"],
    "Tirunelveli":      ["Palayamkottai","Melapalayam","Vannarpet"],
    "Erode":            ["Bhavani","Perundurai","Gobichettipalayam"],
    "Vellore":          ["Katpadi","Ambur","Ranipet","Vellore Town"],
    "Thanjavur":        ["Kumbakonam","Papanasam","Thanjavur Town"],
    "Kanyakumari":      ["Nagercoil","Marthandam","Padmanabhapuram"],
    "Tiruppur":         ["Tiruppur Town","Kangeyam","Dharapuram"],
  },
  "Kerala": {
    "Ernakulam":        ["Kochi","Kalamassery","Aluva","Edappally"],
    "Thiruvananthapuram":["Kovalam","Technopark","Pattom","Kowdiar"],
    "Kozhikode":        ["Calicut Beach","Nadakkavu","Mavoor"],
    "Thrissur":         ["Guruvayur","Chalakudy","Thrissur Town"],
    "Palakkad":         ["Palakkad Town","Ottapalam","Shoranur"],
  },
  "Karnataka": {
    "Bengaluru Urban":  ["Koramangala","Indiranagar","Whitefield","HSR Layout","Jayanagar"],
    "Mysuru":           ["Mysore City","Nanjangud","T. Narsipur"],
    "Mangaluru":        ["Mangalore City","Surathkal","Ullal"],
  },
  "Maharashtra": {
    "Mumbai":           ["Bandra","Andheri","Dadar","Colaba","Powai"],
    "Pune":             ["Koregaon Park","Hinjewadi","Viman Nagar","Kothrud"],
    "Nagpur":           ["Dharampeth","Sitabuldi","Sadar"],
  },
  "Delhi": {
    "Central Delhi":    ["Connaught Place","Karol Bagh","Paharganj"],
    "South Delhi":      ["Hauz Khas","Saket","Vasant Kunj","Lajpat Nagar"],
    "North Delhi":      ["Civil Lines","Model Town","Pitampura"],
  },
  "Telangana": {
    "Hyderabad":        ["Banjara Hills","Jubilee Hills","Madhapur","Hitech City","Ameerpet"],
  },
  "Gujarat": {
    "Ahmedabad":        ["Navrangpura","Satellite","Vastrapur","Maninagar"],
    "Surat":            ["Surat City","Adajan","Vesu"],
  },
};

const CATEGORIES = [
  { id:"tech",        label:"Tech",        emoji:"💻", color:"#3C3489", bg:"#EEEDFE" },
  { id:"music",       label:"Music",       emoji:"🎵", color:"#633806", bg:"#FAEEDA" },
  { id:"art",         label:"Art",         emoji:"🎨", color:"#72243E", bg:"#FBEAF0" },
  { id:"food",        label:"Food",        emoji:"🍜", color:"#712B13", bg:"#FAECE7" },
  { id:"sports",      label:"Sports",      emoji:"🏃", color:"#085041", bg:"#E1F5EE" },
  { id:"health",      label:"Health",      emoji:"🧘", color:"#27500A", bg:"#EAF3DE" },
  { id:"business",    label:"Business",    emoji:"💼", color:"#0C447C", bg:"#E6F1FB" },
  { id:"photography", label:"Photography", emoji:"📸", color:"#085041", bg:"#E1F5EE" },
  { id:"fashion",     label:"Fashion",     emoji:"👗", color:"#72243E", bg:"#FBEAF0" },
  { id:"gaming",      label:"Gaming",      emoji:"🎮", color:"#3C3489", bg:"#EEEDFE" },
  { id:"education",   label:"Education",   emoji:"📚", color:"#0C447C", bg:"#E6F1FB" },
  { id:"travel",      label:"Travel",      emoji:"✈️", color:"#085041", bg:"#E1F5EE" },
];

const STEPS = [
  { id: 1, label: "Basics",   icon: "📝" },
  { id: 2, label: "Details",  icon: "📍" },
  { id: 3, label: "Contact",  icon: "📞" },
  { id: 4, label: "Preview",  icon: "👁" },
];

interface FormData {
  title:       string;
  category:    string;
  description: string;
  coverImageFile: File | null;   // raw File for upload
  coverImagePreview: string | null; // local data-URL for preview
  coverImageURL: string;         // Storage download URL after upload
  entryType:   "Free" | "Paid";
  price:       string;
  maxAttendees:string;
  date:        string;
  startTime:   string;
  endTime:     string;
  state:       string;
  district:    string;
  area:        string;
  venue:       string;
  landmark:    string;
  howToAttend: string;
  contactName:  string;
  contactPhone: string;
  contactEmail: string;
  contactWA:    string;
  website:      string;
}

const BLANK_FORM: FormData = {
  title:"", category:"", description:"",
  coverImageFile: null, coverImagePreview: null, coverImageURL: "",
  entryType:"Free", price:"", maxAttendees:"",
  date:"", startTime:"", endTime:"",
  state:"Tamil Nadu", district:"Madurai", area:"Madurai City",
  venue:"", landmark:"", howToAttend:"",
  contactName:"", contactPhone:"", contactEmail:"", contactWA:"", website:"",
};

// ─── Build the CreateEventPayload the action file expects ─────────────────────
function toPayload(form: FormData): CreateEventPayload {
  return {
    title:        form.title,
    category:     form.category,
    description:  form.description,
    entryType:    form.entryType,
    price:        form.price,
    maxAttendees: form.maxAttendees,
    date:         form.date,
    startTime:    form.startTime,
    endTime:      form.endTime,
    state:        form.state,
    district:     form.district,
    area:         form.area,
    venue:        form.venue,
    landmark:     form.landmark,
    howToAttend:  form.howToAttend,
    contactName:  form.contactName,
    contactPhone: form.contactPhone,
    contactEmail: form.contactEmail,
    contactWA:    form.contactWA,
    website:      form.website,
    coverImageURL: form.coverImageURL || undefined,
  };
}

export default function CreateEventPage() {
  const router = useRouter();

  const [step, setStep]       = useState(1);
  const [form, setForm]       = useState<FormData>(BLANK_FORM);
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [submitting, setSubmitting]   = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitted, setSubmitted]     = useState(false);
  const [createdTitle, setCreatedTitle] = useState("");
  const [createdId, setCreatedId]       = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const districts = Object.keys(LOCATION_DATA[form.state] || {});
  const areas     = (LOCATION_DATA[form.state]?.[form.district]) || [];

  const onStateChange = (s: string) => {
    const d = Object.keys(LOCATION_DATA[s] || {})[0] || "";
    const a = (LOCATION_DATA[s]?.[d] || [])[0] || "";
    setForm(p => ({ ...p, state: s, district: d, area: a }));
  };
  const onDistChange = (d: string) => {
    const a = (LOCATION_DATA[form.state]?.[d] || [])[0] || "";
    setForm(p => ({ ...p, district: d, area: a }));
  };

  // ── Image handling: preview locally, defer upload to submit ─────────────────
  const handleImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => {
      setForm(prev => ({
        ...prev,
        coverImageFile: file,
        coverImagePreview: e.target?.result as string,
      }));
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Validate using the shared action helper ──────────────────────────────────
  const validate = (s: number): boolean => {
    const e = validateStep(s, toPayload(form));
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validate(step)) setStep(s => Math.min(s + 1, 4)); };
  const prev = () => { setStep(s => Math.max(s - 1, 1)); setErrors({}); };

  // ── Publish event ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate(3)) { setStep(3); return; }
    setGlobalError(null);
    setSubmitting(true);

    try {
      // 1. Upload cover image if user chose one
      let coverURL = form.coverImageURL;
      if (form.coverImageFile) {
        const imgResult = await uploadCoverImage(form.coverImageFile);
        if (!imgResult.success || !imgResult.data) {
          setGlobalError(imgResult.error ?? "Cover image upload failed.");
          setSubmitting(false);
          return;
        }
        coverURL = imgResult.data;
        setForm(prev => ({ ...prev, coverImageURL: coverURL }));
      }

      // 2. Create event in Firestore
      const payload: CreateEventPayload = { ...toPayload(form), coverImageURL: coverURL || undefined };
      const result = await createEvent(payload);

      if (!result.success || !result.data) {
        setGlobalError(result.error ?? "Failed to publish event.");
        setSubmitting(false);
        return;
      }

      setCreatedTitle(form.title);
      setCreatedId(result.data);
      setSubmitted(true);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Save draft ────────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!form.title.trim()) {
      setErrors({ title: "Add a title before saving as draft." });
      setStep(1);
      return;
    }
    setSavingDraft(true);
    setGlobalError(null);
    try {
      const result = await saveDraft(toPayload(form));
      if (!result.success) {
        setGlobalError(result.error ?? "Failed to save draft.");
      } else {
        router.push("/my-events");
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSavingDraft(false);
    }
  };

  const selCat = CATEGORIES.find(c => c.id === form.category);

  const formatDate = (d: string) => {
    if (!d) return "";
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short", year:"numeric" });
  };

  const completionItems = [
    { label:"Event title",  done: !!form.title },
    { label:"Category",     done: !!form.category },
    { label:"Description",  done: !!form.description },
    { label:"Date & time",  done: !!form.date && !!form.startTime },
    { label:"Location",     done: !!form.venue },
    { label:"Contact info", done: !!form.contactPhone || !!form.contactEmail },
    { label:"Cover image",  done: !!form.coverImagePreview },
  ];
  const completionCount = completionItems.filter(i => i.done).length;

  // ── Success screen ────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#F5F5FA]" style={{ fontFamily:"'DM Sans',sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
          @keyframes pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        `}</style>
        <div className="text-center px-6 py-10 animate-[fadeUp_.5s_ease]">
          <div className="w-16 h-16 rounded-full bg-[#E1F5EE] border-2 border-[#1D9E75] flex items-center justify-center mx-auto mb-5 animate-[pop_.5s_ease]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1A1A2E] mb-2" style={{ fontFamily:"'Playfair Display',serif" }}>Event created! 🎉</h1>
          <p className="text-sm text-[#888780] mb-2 leading-relaxed">
            <strong className="text-[#1A1A2E]">{createdTitle}</strong> is now live.
          </p>
          <p className="text-xs text-[#888780] mb-7">People can now find and join your event.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            {createdId && (
              <Link href={`/events/${createdId}`} className="px-5 py-2.5 bg-[#1D9E75] rounded-xl text-sm font-semibold text-white no-underline">
                View event →
              </Link>
            )}
            <Link href="/my-events" className="px-5 py-2.5 bg-[#7F77DD] rounded-xl text-sm font-semibold text-white no-underline">
              My events →
            </Link>
            <button
              onClick={() => { setSubmitted(false); setStep(1); setForm(BLANK_FORM); }}
              className="px-5 py-2.5 bg-transparent border border-[#E8E8F0] rounded-xl text-sm font-medium text-[#888780] cursor-pointer"
              style={{ fontFamily:"'DM Sans',sans-serif" }}>
              Create another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-[#F5F5FA]" style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
        *{box-sizing:border-box;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideRight{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}

        .fi{width:100%;padding:10px 13px;border:1.5px solid #E8E8F0;border-radius:9px;font-size:14px;color:#1A1A2E;font-family:'DM Sans',sans-serif;background:#fff;transition:border-color .15s,box-shadow .15s;}
        .fi:focus{outline:none;border-color:#7F77DD;box-shadow:0 0 0 3px rgba(127,119,221,.1);}
        .fi::placeholder{color:#B4B2A9;}
        .fi.err{border-color:#E24B4A;background:#FEFAFA;}
        textarea.fi{resize:vertical;min-height:96px;line-height:1.7;}
        select.fi{cursor:pointer;}
        .fl{font-size:12px;font-weight:500;color:#444441;margin-bottom:5px;display:block;}
        .fe{font-size:11px;color:#E24B4A;margin-top:4px;}
        .fh{font-size:11px;color:#B4B2A9;margin-top:4px;}
        .fg{display:flex;flex-direction:column;}
        .section{background:#fff;border-radius:16px;border:1px solid #E8E8F0;padding:20px;margin-bottom:14px;}
        .sec-title{font-size:14px;font-weight:600;color:#1A1A2E;margin-bottom:3px;}
        .sec-sub{font-size:12px;color:#888780;margin-bottom:16px;}
        .cat-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border:1.5px solid #E8E8F0;border-radius:11px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;background:#fff;}
        .cat-btn:hover{border-color:#7F77DD;transform:translateY(-1px);}
        .cat-btn.active{border-width:2px;}
        .type-toggle{display:flex;background:#F5F5FA;border-radius:10px;padding:4px;}
        .type-btn{flex:1;padding:9px;border:none;border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .18s;}
        .drop-zone{border:2px dashed #E8E8F0;border-radius:12px;padding:20px;text-align:center;cursor:pointer;transition:all .18s;}
        .drop-zone:hover{border-color:#7F77DD;background:rgba(127,119,221,.04);}
        .step-anim{animation:slideRight .3s ease both;}
        input[type=date].fi,input[type=time].fi{color-scheme:light;}
        .req{color:#E24B4A;}
        .char-count{font-size:11px;color:#B4B2A9;text-align:right;margin-top:3px;}
        .contact-icon-wrap{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
        .cat-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;}
        @media(max-width:640px){
          .g2{grid-template-columns:1fr;}
          .g3{grid-template-columns:1fr 1fr;}
          .cat-grid{grid-template-columns:repeat(4,1fr);}
          .section{padding:16px;border-radius:14px;}
          .fi{font-size:16px;}
        }
        @media(max-width:400px){
          .cat-grid{grid-template-columns:repeat(3,1fr);}
          .g3{grid-template-columns:1fr;}
        }
      `}</style>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1200px] mx-auto">

        {/* ── Header ── */}
        <div className="mb-5 sm:mb-6" style={{ animation:"fadeUp .4s ease both" }}>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/my-events" className="text-xs text-[#888780] no-underline flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              My events
            </Link>
            <span className="text-xs text-[#B4B2A9]">/</span>
            <span className="text-xs text-[#888780]">Create event</span>
          </div>
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl lg:text-[26px] font-bold text-[#1A1A2E] tracking-tight" style={{ fontFamily:"'Playfair Display',serif" }}>
              Create a new event
            </h1>
            {/* Save draft button — always visible */}
            <button
              onClick={handleSaveDraft}
              disabled={savingDraft || submitting}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-white border border-[#E8E8F0] rounded-xl text-xs font-medium text-[#888780] cursor-pointer transition-all hover:border-[#7F77DD] hover:text-[#7F77DD]"
              style={{ fontFamily:"'DM Sans',sans-serif" }}>
              {savingDraft ? (
                <span style={{ width:"11px", height:"11px", border:"1.5px solid #B4B2A9", borderTopColor:"#7F77DD", borderRadius:"50%", display:"inline-block", animation:"spin .7s linear infinite" }} />
              ) : "💾"} Save draft
            </button>
          </div>
        </div>

        {/* ── Global error banner ── */}
        {globalError && (
          <div className="mb-4 px-4 py-3 bg-[#FEFAFA] border border-[#E24B4A] rounded-xl text-sm text-[#E24B4A] flex items-center gap-2">
            <span>⚠️</span> {globalError}
            <button onClick={() => setGlobalError(null)} className="ml-auto text-[#E24B4A] bg-transparent border-none cursor-pointer text-base leading-none">×</button>
          </div>
        )}

        {/* ── Step Indicator ── */}
        <div className="mb-6" style={{ animation:"fadeUp .4s .05s ease both" }}>
          {/* Desktop stepper */}
          <div className="hidden sm:flex items-center">
            {STEPS.map((s, i) => (
              <div key={s.id} style={{ display:"flex", alignItems:"center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
                <div className="flex items-center gap-2 shrink-0">
                  <div style={{
                    width:"32px", height:"32px", borderRadius:"50%", display:"flex",
                    alignItems:"center", justifyContent:"center", fontSize:"13px", fontWeight:600,
                    background: step > s.id ? "#1D9E75" : step === s.id ? "#7F77DD" : "#F0F0F8",
                    color: step >= s.id ? "#fff" : "#B4B2A9",
                    transition:"all .25s",
                  }}>
                    {step > s.id ? "✓" : s.id}
                  </div>
                  <span style={{ fontSize:"13px", fontWeight:500, color: step === s.id ? "#1A1A2E" : "#888780" }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex:1, height:"2px", margin:"0 12px", background: step > s.id ? "#1D9E75" : "#E8E8F0", transition:"background .3s" }} />
                )}
              </div>
            ))}
          </div>

          {/* Mobile stepper */}
          <div className="flex sm:hidden items-center justify-center gap-2">
            {STEPS.map(s => (
              <div key={s.id} style={{
                width: step === s.id ? "28px" : "8px",
                height:"8px", borderRadius:"4px",
                background: step > s.id ? "#1D9E75" : step === s.id ? "#7F77DD" : "#E8E8F0",
                transition:"all .3s",
              }} />
            ))}
            <span className="text-xs text-[#888780] ml-1">{STEPS[step-1].label}</span>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-6 lg:items-start">

          {/* ── Form Column ── */}
          <div style={{ animation:"fadeUp .4s .1s ease both" }}>

            {/* ════════ STEP 1 — Basics ════════ */}
            {step === 1 && (
              <div className="step-anim">
                <div className="section">
                  <p className="sec-title">Event basics</p>
                  <p className="sec-sub">Tell people what your event is about</p>

                  {/* Title */}
                  <div className="fg mb-4">
                    <label className="fl">Event title <span className="req">*</span></label>
                    <input className={`fi${errors.title?" err":""}`} value={form.title} maxLength={80}
                      onChange={e => set("title", e.target.value)} placeholder="e.g. Tech Startup Meetup Chennai" />
                    {errors.title && <span className="fe">{errors.title}</span>}
                    <span className="char-count">{form.title.length}/80</span>
                  </div>

                  {/* Category */}
                  <div className="fg mb-4">
                    <label className="fl">Category <span className="req">*</span></label>
                    <div className="cat-grid">
                      {CATEGORIES.map(c => (
                        <button key={c.id}
                          className={`cat-btn${form.category===c.id?" active":""}`}
                          style={form.category===c.id ? { borderColor:c.color, background:c.bg } : {}}
                          onClick={() => set("category", c.id)}>
                          <span style={{ fontSize:"18px" }}>{c.emoji}</span>
                          <span style={{ fontSize:"10px", fontWeight:600, color: form.category===c.id ? c.color : "#888780" }}>{c.label}</span>
                        </button>
                      ))}
                    </div>
                    {errors.category && <span className="fe">{errors.category}</span>}
                  </div>

                  {/* Description */}
                  <div className="fg mb-4">
                    <label className="fl">Description <span className="req">*</span></label>
                    <textarea className={`fi${errors.description?" err":""}`} value={form.description} maxLength={1000}
                      onChange={e => set("description", e.target.value)} placeholder="What will attendees experience? Share agenda, speakers, activities…" />
                    {errors.description && <span className="fe">{errors.description}</span>}
                    <span className="char-count">{form.description.length}/1000</span>
                  </div>

                  {/* Entry type */}
                  <div className="fg mb-4">
                    <label className="fl">Entry type</label>
                    <div className="type-toggle">
                      {(["Free","Paid"] as const).map(t => (
                        <button key={t} className="type-btn"
                          style={{ background: form.entryType===t ? "#fff" : "transparent",
                            color: form.entryType===t ? "#1A1A2E" : "#888780",
                            boxShadow: form.entryType===t ? "0 1px 4px rgba(0,0,0,.08)" : "none" }}
                          onClick={() => set("entryType", t)}>{t}</button>
                      ))}
                    </div>
                  </div>

                  {form.entryType === "Paid" && (
                    <div className="g2 mb-4">
                      <div className="fg">
                        <label className="fl">Ticket price (₹) <span className="req">*</span></label>
                        <input type="number" min="1" className={`fi${errors.price?" err":""}`} value={form.price}
                          onChange={e => set("price", e.target.value)} placeholder="e.g. 499" />
                        {errors.price && <span className="fe">{errors.price}</span>}
                      </div>
                      <div className="fg">
                        <label className="fl">Max attendees</label>
                        <input type="number" min="1" className="fi" value={form.maxAttendees}
                          onChange={e => set("maxAttendees", e.target.value)} placeholder="Unlimited" />
                        <span className="fh">Leave blank for unlimited</span>
                      </div>
                    </div>
                  )}

                  {/* Cover image */}
                  <div className="fg">
                    <label className="fl">Cover image</label>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" style={{ display:"none" }}
                      onChange={e => { if (e.target.files?.[0]) handleImage(e.target.files[0]); }} />

                    {form.coverImagePreview ? (
                      <div style={{ position:"relative", borderRadius:"12px", overflow:"hidden", height:"160px" }}>
                        <img src={form.coverImagePreview} alt="Cover preview"
                          style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        <button onClick={() => setForm(prev => ({ ...prev, coverImageFile:null, coverImagePreview:null, coverImageURL:"" }))}
                          style={{ position:"absolute", top:"8px", right:"8px", background:"rgba(0,0,0,.55)", border:"none",
                            color:"#fff", borderRadius:"50%", width:"26px", height:"26px", cursor:"pointer", fontSize:"14px",
                            display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
                      </div>
                    ) : (
                      <div className="drop-zone"
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleImage(e.dataTransfer.files[0]); }}
                        onClick={() => fileRef.current?.click()}>
                        <div style={{ fontSize:"28px", marginBottom:"6px" }}>🖼️</div>
                        <p style={{ fontSize:"13px", color:"#888780", margin:"0 0 4px" }}>Drop an image or <span style={{ color:"#7F77DD", fontWeight:500 }}>browse</span></p>
                        <p style={{ fontSize:"11px", color:"#B4B2A9", margin:0 }}>JPG, PNG, WebP · max 5 MB</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ════════ STEP 2 — Details ════════ */}
            {step === 2 && (
              <div className="step-anim">
                {/* Date & Time */}
                <div className="section">
                  <p className="sec-title">Date & time</p>
                  <p className="sec-sub">When is your event happening?</p>
                  <div className="g3 mb-4">
                    <div className="fg">
                      <label className="fl">Date <span className="req">*</span></label>
                      <input type="date" className={`fi${errors.date?" err":""}`} value={form.date}
                        min={new Date().toISOString().split("T")[0]}
                        onChange={e => set("date", e.target.value)} />
                      {errors.date && <span className="fe">{errors.date}</span>}
                    </div>
                    <div className="fg">
                      <label className="fl">Start time <span className="req">*</span></label>
                      <input type="time" className={`fi${errors.startTime?" err":""}`} value={form.startTime}
                        onChange={e => set("startTime", e.target.value)} />
                      {errors.startTime && <span className="fe">{errors.startTime}</span>}
                    </div>
                    <div className="fg">
                      <label className="fl">End time</label>
                      <input type="time" className="fi" value={form.endTime}
                        onChange={e => set("endTime", e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="section">
                  <p className="sec-title">Location</p>
                  <p className="sec-sub">Where will the event take place?</p>
                  <div className="g3 mb-4">
                    <div className="fg">
                      <label className="fl">State <span className="req">*</span></label>
                      <select className={`fi${errors.state?" err":""}`} value={form.state} onChange={e => onStateChange(e.target.value)}>
                        {Object.keys(LOCATION_DATA).map(s => <option key={s}>{s}</option>)}
                      </select>
                      {errors.state && <span className="fe">{errors.state}</span>}
                    </div>
                    <div className="fg">
                      <label className="fl">District <span className="req">*</span></label>
                      <select className={`fi${errors.district?" err":""}`} value={form.district} onChange={e => onDistChange(e.target.value)}>
                        {districts.map(d => <option key={d}>{d}</option>)}
                      </select>
                      {errors.district && <span className="fe">{errors.district}</span>}
                    </div>
                    <div className="fg">
                      <label className="fl">Area <span className="req">*</span></label>
                      <select className={`fi${errors.area?" err":""}`} value={form.area} onChange={e => set("area", e.target.value)}>
                        {areas.map(a => <option key={a}>{a}</option>)}
                      </select>
                      {errors.area && <span className="fe">{errors.area}</span>}
                    </div>
                  </div>
                  <div className="fg mb-4">
                    <label className="fl">Venue name <span className="req">*</span></label>
                    <input className={`fi${errors.venue?" err":""}`} value={form.venue}
                      onChange={e => set("venue", e.target.value)} placeholder="e.g. IIT Madras Research Park, Hall B" />
                    {errors.venue && <span className="fe">{errors.venue}</span>}
                  </div>
                  <div className="g2">
                    <div className="fg">
                      <label className="fl">Landmark</label>
                      <input className="fi" value={form.landmark}
                        onChange={e => set("landmark", e.target.value)} placeholder="Near metro / bus stop…" />
                    </div>
                    <div className="fg">
                      <label className="fl">How to attend</label>
                      <input className="fi" value={form.howToAttend}
                        onChange={e => set("howToAttend", e.target.value)} placeholder="Zoom link, Google Meet, walk-in…" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════ STEP 3 — Contact ════════ */}
            {step === 3 && (
              <div className="step-anim">
                <div className="section">
                  <p className="sec-title">Contact details</p>
                  <p className="sec-sub">Let attendees know how to reach you</p>

                  {[
                    { key:"contactName" as const,  label:"Organiser name", req:true, icon:"👤", placeholder:"Your full name or organisation" },
                    { key:"contactPhone" as const, label:"Phone number",   req:true, icon:"📞", placeholder:"+91 98765 43210" },
                    { key:"contactEmail" as const, label:"Email",          req:true, icon:"✉️", placeholder:"events@yourorg.com" },
                    { key:"contactWA" as const,    label:"WhatsApp",       req:false,icon:"💬", placeholder:"+91 98765 43210 (optional)" },
                    { key:"website" as const,      label:"Website / link", req:false,icon:"🔗", placeholder:"https://yourwebsite.com (optional)" },
                  ].map(f => (
                    <div key={f.key} className="flex gap-3 mb-4 items-start">
                      <div className="contact-icon-wrap" style={{ background:"#F5F5FA", marginTop:"22px" }}>
                        <span style={{ fontSize:"15px" }}>{f.icon}</span>
                      </div>
                      <div className="fg" style={{ flex:1 }}>
                        <label className="fl">{f.label} {f.req && <span className="req">*</span>}</label>
                        <input className={`fi${errors[f.key]?" err":""}`} value={form[f.key]}
                          onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
                        {errors[f.key] && <span className="fe">{errors[f.key]}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ════════ STEP 4 — Preview ════════ */}
            {step === 4 && (
              <div className="step-anim">
                <div className="section">
                  <p className="sec-title">Final preview</p>
                  <p className="sec-sub">Review before publishing</p>

                  {/* Cover */}
                  <div style={{ height:"180px", borderRadius:"12px", overflow:"hidden", marginBottom:"16px",
                    background: selCat ? selCat.bg : "#F0F0F8",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:"48px" }}>
                    {form.coverImagePreview
                      ? <img src={form.coverImagePreview} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : (selCat?.emoji || "📅")}
                  </div>

                  <div className="flex gap-2 flex-wrap mb-3">
                    {selCat && <span style={{ fontSize:"11px", fontWeight:600, padding:"3px 10px", borderRadius:"20px", background:selCat.bg, color:selCat.color }}>{selCat.emoji} {selCat.label}</span>}
                    <span style={{ fontSize:"11px", fontWeight:600, padding:"3px 10px", borderRadius:"20px", background: form.entryType==="Free"?"#EAF3DE":"#FAEEDA", color: form.entryType==="Free"?"#27500A":"#633806" }}>
                      {form.entryType==="Paid" ? `₹${form.price}` : "Free"}
                    </span>
                    {form.maxAttendees && <span style={{ fontSize:"11px", fontWeight:600, padding:"3px 10px", borderRadius:"20px", background:"#F1EFE8", color:"#444441" }}>Max {form.maxAttendees}</span>}
                  </div>

                  <h2 className="text-xl font-bold text-[#1A1A2E] mb-3 leading-snug" style={{ fontFamily:"'Playfair Display',serif" }}>
                    {form.title || <span className="text-[#B4B2A9]">Your event title</span>}
                  </h2>

                  {[
                    { icon:"📅", value: form.date ? `${formatDate(form.date)} · ${form.startTime || ""}${form.endTime?" – "+form.endTime:""}` : "Date not set" },
                    { icon:"📍", value: form.venue ? `${form.venue}, ${form.area}, ${form.district}, ${form.state}` : "Location not set" },
                    { icon:"📞", value: form.contactPhone || "Contact not set" },
                    { icon:"👤", value: form.contactName  || "Organiser not set" },
                  ].map((row, i) => (
                    <div key={i} className="flex gap-2.5 items-start py-2.5 border-b border-[#F5F5FA]">
                      <span className="text-sm shrink-0 mt-0.5">{row.icon}</span>
                      <span className="text-sm leading-relaxed" style={{ color: row.value.includes("not set") ? "#B4B2A9" : "#444441" }}>{row.value}</span>
                    </div>
                  ))}

                  {form.description && (
                    <div className="mt-3.5">
                      <p className="text-[11px] font-semibold text-[#888780] uppercase tracking-wide mb-1.5">About this event</p>
                      <p className="text-sm text-[#444441] leading-relaxed">{form.description}</p>
                    </div>
                  )}

                  {form.howToAttend && (
                    <div className="mt-3.5 p-3 bg-[#F5F5FA] rounded-xl">
                      <p className="text-[11px] font-semibold text-[#888780] mb-1">How to attend</p>
                      <p className="text-sm text-[#444441] leading-relaxed">{form.howToAttend}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Navigation Buttons ── */}
            <div className="flex items-center justify-between pt-1 gap-3 flex-wrap">
              {/* Left side */}
              <div className="flex gap-2">
                {step > 1 ? (
                  <button onClick={prev} disabled={submitting}
                    className="px-5 py-3 bg-transparent border border-[#E8E8F0] rounded-xl text-sm font-medium text-[#888780] cursor-pointer transition-all hover:border-[#7F77DD] hover:text-[#7F77DD]"
                    style={{ fontFamily:"'DM Sans',sans-serif" }}>
                    ← Back
                  </button>
                ) : (
                  <Link href="/my-events"
                    className="px-5 py-3 bg-transparent border border-[#E8E8F0] rounded-xl text-sm font-medium text-[#888780] no-underline">
                    Cancel
                  </Link>
                )}
                {/* Mobile save draft */}
                <button onClick={handleSaveDraft} disabled={savingDraft || submitting}
                  className="sm:hidden px-4 py-3 bg-transparent border border-[#E8E8F0] rounded-xl text-xs font-medium text-[#888780] cursor-pointer"
                  style={{ fontFamily:"'DM Sans',sans-serif" }}>
                  {savingDraft ? "Saving…" : "💾 Draft"}
                </button>
              </div>

              {/* Right side */}
              {step < 4 ? (
                <button onClick={next} disabled={submitting}
                  className="flex-1 sm:flex-none px-6 py-3 bg-[#7F77DD] border-none rounded-xl text-sm font-semibold text-white cursor-pointer transition-all hover:bg-[#6B63CC] flex items-center justify-center gap-2"
                  style={{ fontFamily:"'DM Sans',sans-serif" }}>
                  Continue →
                </button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting}
                  className="flex-1 sm:flex-none px-6 py-3 border-none rounded-xl text-sm font-semibold text-white cursor-pointer flex items-center justify-center gap-2 transition-all"
                  style={{ background: submitting ? "#AFA9EC" : "#1D9E75", fontFamily:"'DM Sans',sans-serif", minWidth:"150px" }}>
                  {submitting ? (
                    <>
                      <span style={{ width:"14px", height:"14px", border:"2px solid rgba(255,255,255,.4)", borderTopColor:"#fff", borderRadius:"50%", display:"inline-block", animation:"spin .7s linear infinite" }} />
                      Publishing…
                    </>
                  ) : "🚀 Publish event"}
                </button>
              )}
            </div>
          </div>

          {/* ── Live Preview Sidebar ── */}
          <div className="mt-5 lg:mt-0 lg:sticky lg:top-6" style={{ animation:"fadeUp .4s .15s ease both" }}>
            <div className="bg-[#1A1A2E] rounded-2xl p-4 mb-3.5">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3">Live preview</p>
              <div className="bg-white rounded-xl overflow-hidden">
                <div className="h-20 flex items-center justify-center text-4xl overflow-hidden" style={{ background: selCat ? selCat.bg : "#F0F0F8" }}>
                  {form.coverImagePreview
                    ? <img src={form.coverImagePreview} alt="" className="w-full h-full object-cover" />
                    : (selCat?.emoji || "📅")}
                </div>
                <div className="p-3">
                  <div className="flex gap-1 mb-1.5 flex-wrap">
                    {selCat && <span style={{ fontSize:"10px", fontWeight:600, padding:"2px 6px", borderRadius:"20px", background:selCat.bg, color:selCat.color }}>{selCat.label}</span>}
                    <span style={{ fontSize:"10px", fontWeight:600, padding:"2px 6px", borderRadius:"20px", background: form.entryType==="Free"?"#EAF3DE":"#FAEEDA", color: form.entryType==="Free"?"#27500A":"#633806" }}>
                      {form.entryType==="Paid" && form.price ? `₹${form.price}` : form.entryType}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#1A1A2E] leading-snug mb-1.5 min-h-[18px]">
                    {form.title || <span className="text-[#B4B2A9]">Event title…</span>}
                  </p>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-[#888780] flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {form.date ? formatDate(form.date) : "Date TBD"}
                    </span>
                    <span className="text-xs text-[#888780] flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#B4B2A9" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                      {form.area || form.district || "Location TBD"}
                    </span>
                  </div>
                  <div className="mt-2.5 py-1.5 bg-[#7F77DD] rounded-lg text-center text-xs font-semibold text-white">
                    View event →
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist */}
            <div className="bg-white rounded-2xl border border-[#E8E8F0] p-4">
              <p className="text-xs font-semibold text-[#1A1A2E] mb-3">Completion checklist</p>
              {completionItems.map(item => (
                <div key={item.label} className="flex items-center gap-2.5 py-1.5 border-b border-[#F5F5FA]">
                  <div style={{
                    width:"18px", height:"18px", borderRadius:"50%", flexShrink:0,
                    background: item.done ? "#E1F5EE" : "#F0F0F8",
                    border:`1.5px solid ${item.done ? "#1D9E75" : "#E8E8F0"}`,
                    display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s",
                  }}>
                    {item.done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span style={{ fontSize:"12px", color: item.done ? "#444441" : "#B4B2A9", fontWeight: item.done ? 500 : 400 }}>{item.label}</span>
                </div>
              ))}
              <div className="mt-2.5 pt-2">
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs text-[#888780]">Progress</span>
                  <span className="text-xs font-semibold text-[#7F77DD]">{completionCount}/7</span>
                </div>
                <div className="h-1.5 bg-[#F0F0F8] rounded-full overflow-hidden">
                  <div className="h-full bg-[#7F77DD] rounded-full transition-all duration-500" style={{ width:`${(completionCount/7)*100}%` }} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}