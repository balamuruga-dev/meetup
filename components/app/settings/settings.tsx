"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ─── Action imports ────────────────────────────────────────────────────────────
import {
  loadUserProfile,
  saveProfile,
  saveLocation,
  saveInterests,
  saveNotifPrefs,
  savePrivacySettings,
  uploadProfilePhoto,
  removeProfilePhoto,
  changePassword,
  deleteAccount,
} from "@/app/actions/Settingsactions ";

// ─── Sign out helper (from firebase/auth) ─────────────────────────────────────
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

// ─────────────────────────────────────────────────────────────────────────────

const LOCATION_DATA: Record<string, Record<string, string[]>> = {
  "Tamil Nadu": { "Madurai":["Madurai City","Melur","Thirumangalam","Usilampatti","Alanganallur","Vadipatti"],"Chennai":["T. Nagar","Anna Nagar","Adyar","Velachery","Tambaram","Chrompet","Porur"],"Coimbatore":["RS Puram","Saibaba Colony","Singanallur","Ganapathy","Peelamedu"],"Tiruchirappalli":["Srirangam","KK Nagar","Ariyamangalam","Woraiyur"],"Salem":["Fairlands","Suramangalam","Ammapet","Shevapet"],"Tirunelveli":["Palayamkottai","Melapalayam","Vannarpet"],"Erode":["Bhavani","Perundurai","Gobichettipalayam"],"Vellore":["Katpadi","Ambur","Ranipet"],"Thanjavur":["Kumbakonam","Papanasam","Pattukottai"],"Dindigul":["Palani","Natham","Oddanchatram"],"Kanyakumari":["Nagercoil","Marthandam","Padmanabhapuram"],"Thoothukudi":["Thoothukudi City","Kovilpatti","Sankarankovil"] },
  "Kerala":     { "Ernakulam":["Kochi","Kalamassery","Aluva","Edappally"],"Thiruvananthapuram":["Kovalam","Technopark","Pattom","Kowdiar"],"Kozhikode":["Calicut Beach","Nadakkavu","Mavoor"],"Thrissur":["Guruvayur","Chalakudy","Irinjalakuda"],"Palakkad":["Palakkad Town","Ottapalam","Shoranur"],"Malappuram":["Manjeri","Tirur","Perinthalmanna"] },
  "Karnataka":  { "Bengaluru Urban":["Koramangala","Indiranagar","Whitefield","HSR Layout","Jayanagar","Malleshwaram"],"Mysuru":["Mysore City","Nanjangud","T. Narsipur"],"Mangaluru":["Mangalore City","Surathkal","Ullal"],"Hubli-Dharwad":["Hubli","Dharwad"] },
  "Maharashtra":{ "Mumbai":["Bandra","Andheri","Dadar","Colaba","Powai","Juhu"],"Pune":["Koregaon Park","Hinjewadi","Viman Nagar","Kothrud"],"Nagpur":["Dharampeth","Sitabuldi","Sadar"],"Nashik":["Nashik Road","Deolali"] },
  "Delhi":      { "Central Delhi":["Connaught Place","Karol Bagh","Paharganj"],"South Delhi":["Hauz Khas","Saket","Vasant Kunj","Lajpat Nagar"],"North Delhi":["Civil Lines","Model Town","Pitampura"],"East Delhi":["Laxmi Nagar","Preet Vihar","Mayur Vihar"] },
  "Telangana":  { "Hyderabad":["Banjara Hills","Jubilee Hills","Madhapur","Hitech City","Ameerpet"],"Rangareddy":["Gachibowli","Kondapur","Shamshabad"] },
  "West Bengal":{ "Kolkata":["Park Street","Salt Lake","New Town","Tollygunge","Ballygunge"],"Howrah":["Howrah City","Shibpur","Bally"] },
  "Gujarat":    { "Ahmedabad":["Navrangpura","Vastrapur","Bopal","Satellite","Maninagar"],"Surat":["Adajan","Vesu","Athwa","Katargam"],"Vadodara":["Alkapuri","Fatehgunj","Manjalpur"] },
  "Rajasthan":  { "Jaipur":["Malviya Nagar","Vaishali Nagar","Mansarovar","C-Scheme"],"Jodhpur":["Jodhpur City","Ratanada"],"Udaipur":["Udaipur City","Hiran Magri"] },
};

const INTERESTS = [
  { id:"tech",        label:"Tech",        emoji:"💻", bg:"#EEEDFE", color:"#3C3489" },
  { id:"music",       label:"Music",       emoji:"🎵", bg:"#FAEEDA", color:"#633806" },
  { id:"art",         label:"Art",         emoji:"🎨", bg:"#FBEAF0", color:"#72243E" },
  { id:"food",        label:"Food",        emoji:"🍜", bg:"#FAECE7", color:"#712B13" },
  { id:"sports",      label:"Sports",      emoji:"⚽", bg:"#E1F5EE", color:"#085041" },
  { id:"health",      label:"Health",      emoji:"🧘", bg:"#EAF3DE", color:"#27500A" },
  { id:"business",    label:"Business",    emoji:"💼", bg:"#E6F1FB", color:"#0C447C" },
  { id:"photography", label:"Photography", emoji:"📸", bg:"#E1F5EE", color:"#085041" },
  { id:"fashion",     label:"Fashion",     emoji:"👗", bg:"#FBEAF0", color:"#72243E" },
  { id:"gaming",      label:"Gaming",      emoji:"🎮", bg:"#EEEDFE", color:"#3C3489" },
  { id:"education",   label:"Education",   emoji:"📚", bg:"#E6F1FB", color:"#0C447C" },
  { id:"travel",      label:"Travel",      emoji:"✈️", bg:"#E1F5EE", color:"#085041" },
];

const NAV = [
  { id:"profile",       label:"Profile",       icon:"👤" },
  { id:"location",      label:"Location",      icon:"📍" },
  { id:"interests",     label:"Interests",     icon:"❤️" },
  { id:"account",       label:"Account",       icon:"🔐" },
  { id:"notifications", label:"Notifications", icon:"🔔" },
  { id:"privacy",       label:"Privacy",       icon:"🛡️" },
];

export default function SettingsPage() {
  const [section,   setSection]   = useState("profile");
  // "saved" now tracks a message string (success or error)
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [pageLoad,  setPageLoad]  = useState(true);
  const [avatar,    setAvatar]    = useState<string|null>(null);
  const [drag,      setDrag]      = useState(false);
  const [navOpen,   setNavOpen]   = useState(false);
  const fileRef                   = useRef<HTMLInputElement>(null);

  // Profile
  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [username,   setUsername]   = useState("");
  const [bio,        setBio]        = useState("");
  const [phone,      setPhone]      = useState("");
  const [email,      setEmail]      = useState("");
  const [dob,        setDob]        = useState("");
  const [gender,     setGender]     = useState("male");

  // Location
  const [state,    setState]    = useState("Tamil Nadu");
  const [district, setDistrict] = useState("Madurai");
  const [area,     setArea]     = useState("Madurai City");
  const [pincode,  setPincode]  = useState("");
  const [landmark, setLandmark] = useState("");

  // Interests
  const [interests, setInterests] = useState<Set<string>>(new Set());

  // Account
  const [curPwd,  setCurPwd]  = useState("");
  const [newPwd,  setNewPwd]  = useState("");
  const [confPwd, setConfPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // Notifications
  const [nJoin,  setNJoin]  = useState(true);
  const [nRem,   setNRem]   = useState(true);
  const [nUpd,   setNUpd]   = useState(true);
  const [nEmail, setNEmail] = useState(false);
  const [nSMS,   setNSMS]   = useState(false);

  // Privacy
  const [pubProf,  setPubProf]  = useState(true);
  const [shEmail,  setShEmail]  = useState(false);
  const [shPhone,  setShPhone]  = useState(false);
  const [shEvents, setShEvents] = useState(true);

  // Provider type (to hide/show password section)
  const [provider, setProvider] = useState<"email"|"google">("email");

  // ── Load profile from Firestore on mount ──────────────────────────────────
  useEffect(() => {
    (async () => {
      const res = await loadUserProfile();
      if (res.success && res.data) {
        const p = res.data;
        setFirstName(p.firstName);
        setLastName(p.lastName);
        setUsername(p.username);
        setBio(p.bio);
        setPhone(p.phone);
        setEmail(p.email);
        setDob(p.dob);
        setGender(p.gender);
        if (p.photoURL) setAvatar(p.photoURL);
        if (p.state)    setState(p.state);
        if (p.district) setDistrict(p.district);
        if (p.area)     setArea(p.area);
        setPincode(p.pincode);
        setLandmark(p.landmark);
        setInterests(new Set(p.interests));
        setNJoin(p.notif.join);
        setNRem(p.notif.reminder);
        setNUpd(p.notif.update);
        setNEmail(p.notif.email);
        setNSMS(p.notif.sms);
        setPubProf(p.privacy.publicProfile);
        setShEmail(p.privacy.showEmail);
        setShPhone(p.privacy.showPhone);
        setShEvents(p.privacy.showEvents);
        setProvider(p.provider);
      }
      setPageLoad(false);
    })();
  }, []);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  };

  const districts = Object.keys(LOCATION_DATA[state] ?? {});
  const areas     = (LOCATION_DATA[state] ?? {})[district] ?? [];

  const onState = (s: string) => {
    setState(s);
    const ds = Object.keys(LOCATION_DATA[s] ?? {});
    setDistrict(ds[0] ?? "");
    setArea(((LOCATION_DATA[s] ?? {})[ds[0]] ?? [])[0] ?? "");
  };
  const onDistrict = (d: string) => {
    setDistrict(d);
    setArea(((LOCATION_DATA[state] ?? {})[d] ?? [])[0] ?? "");
  };

  const toggleInt = (id: string) => setInterests(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── Photo upload / remove ─────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    // Preview locally immediately
    const r = new FileReader();
    r.onload = e => setAvatar(e.target?.result as string);
    r.readAsDataURL(file);
    // Upload to Firebase
    const res = await uploadProfilePhoto(file);
    if (res.success && res.data) {
      setAvatar(res.data);
      showToast("Profile photo updated");
    } else {
      showToast(res.error ?? "Upload failed", false);
    }
  }, []);

  const handleRemovePhoto = async () => {
    setAvatar(null);
    const res = await removeProfilePhoto();
    if (!res.success) showToast(res.error ?? "Could not remove photo", false);
    else showToast("Profile photo removed");
  };

  // ── Section-specific save handlers ───────────────────────────────────────
  const handleSaveProfile = async () => {
    setLoading(true);
    const res = await saveProfile({ firstName, lastName, username, bio, dob, gender, phone, email });
    setLoading(false);
    showToast(res.success ? "Profile saved" : (res.error ?? "Save failed"), res.success);
  };

  const handleSaveLocation = async () => {
    setLoading(true);
    const res = await saveLocation({ state, district, area, pincode, landmark });
    setLoading(false);
    showToast(res.success ? "Location saved" : (res.error ?? "Save failed"), res.success);
  };

  const handleSaveInterests = async () => {
    if (interests.size === 0) { showToast("Select at least one interest", false); return; }
    setLoading(true);
    const res = await saveInterests(Array.from(interests));
    setLoading(false);
    showToast(res.success ? "Interests saved" : (res.error ?? "Save failed"), res.success);
  };

  const handleSaveNotifs = async () => {
    setLoading(true);
    const res = await saveNotifPrefs({ join: nJoin, reminder: nRem, update: nUpd, email: nEmail, sms: nSMS });
    setLoading(false);
    showToast(res.success ? "Notification preferences saved" : (res.error ?? "Save failed"), res.success);
  };

  const handleSavePrivacy = async () => {
    setLoading(true);
    const res = await savePrivacySettings({ publicProfile: pubProf, showEmail: shEmail, showPhone: shPhone, showEvents: shEvents });
    setLoading(false);
    showToast(res.success ? "Privacy settings saved" : (res.error ?? "Save failed"), res.success);
  };

  const handleChangePassword = async () => {
    if (newPwd !== confPwd) { showToast("Passwords do not match", false); return; }
    if (newPwd.length < 8)  { showToast("Password must be at least 8 characters", false); return; }
    setLoading(true);
    const res = await changePassword(curPwd, newPwd);
    setLoading(false);
    if (res.success) {
      setCurPwd(""); setNewPwd(""); setConfPwd("");
      showToast("Password updated successfully");
    } else {
      showToast(res.error ?? "Password update failed", false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("Are you sure you want to deactivate your account?")) return;
    // Deactivation flow — you can implement a Firestore flag instead of full deletion
    showToast("Account deactivated (implement your deactivation logic)", false);
  };

  const handleDeleteAccount = async () => {
    const pwd = provider === "email"
      ? prompt("Enter your current password to confirm account deletion:")
      : undefined;
    if (provider === "email" && !pwd) return;
    setLoading(true);
    const res = await deleteAccount(pwd ?? undefined);
    setLoading(false);
    if (res.success) {
      // Redirect to login — use your router here
      window.location.href = "/login";
    } else {
      showToast(res.error ?? "Deletion failed", false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    window.location.href = "/login";
  };

  const handleNavSelect = (id: string) => {
    setSection(id);
    setNavOpen(false);
  };

  const age = dob ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000*60*60*24*365.25)) : null;
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?";
  const currentNav = NAV.find(n => n.id === section);

  if (pageLoad) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#F5F5FA", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ width:"36px", height:"36px", border:"3px solid #EEEDFE", borderTop:"3px solid #7F77DD", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }}/>
          <p style={{ color:"#888780", fontSize:"13px" }}>Loading your settings…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", background:"#F5F5FA", minHeight:"100vh", width:"100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:wght@700&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

        @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn  { from{opacity:0;transform:translateX(10px)}  to{opacity:1;transform:translateX(0)} }
        @keyframes pop      { 0%{transform:scale(.9)} 60%{transform:scale(1.05)} 100%{transform:scale(1)} }
        @keyframes toastIn  { 0%{opacity:0;transform:translateY(8px)} 15%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0} }
        @keyframes sheetUp  { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes spin     { to { transform: rotate(360deg); } }

        .fi { width:100%; padding:10px 13px; border:1.5px solid #E8E8F0; border-radius:10px; font-size:14px; color:#1A1A2E; font-family:'DM Sans',sans-serif; background:#fff; transition:border-color .2s,box-shadow .2s; }
        .fi:focus  { outline:none; border-color:#7F77DD; box-shadow:0 0 0 3px rgba(127,119,221,.12); }
        .fi:hover  { border-color:#D3D1C7; }
        select.fi  { cursor:pointer; }

        .snav { display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px; background:transparent; border:none; border-radius:10px; font-size:13px; color:#888780; cursor:pointer; font-family:'DM Sans',sans-serif; font-weight:400; text-align:left; transition:all .15s; }
        .snav:hover  { background:rgba(127,119,221,.08); color:#7F77DD; }
        .snav.active { background:rgba(127,119,221,.12); color:#3C3489; font-weight:600; }

        .card       { background:#fff; border-radius:16px; border:1px solid #E8E8F0; padding:20px; margin-bottom:14px; }
        .card-title { font-size:13px; font-weight:600; color:#1A1A2E; margin-bottom:16px; }

        .fl       { display:flex; flex-direction:column; gap:5px; }
        .fl label { font-size:12px; font-weight:600; color:#444441; }
        .fl .hint { font-size:11px; color:#B4B2A9; }

        .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:13px; }
        @media (max-width:480px) { .grid2 { grid-template-columns:1fr; } }

        .trow             { display:flex; align-items:center; justify-content:space-between; padding:11px 0; border-bottom:1px solid #F5F5FA; }
        .trow:last-child  { border-bottom:none; }
        .tog              { position:relative; width:40px; height:22px; flex-shrink:0; }
        .tog input        { opacity:0; width:0; height:0; }
        .tog-track        { position:absolute; inset:0; background:#E8E8F0; border-radius:11px; cursor:pointer; transition:background .2s; }
        .tog input:checked+.tog-track { background:#7F77DD; }
        .tog-thumb        { position:absolute; top:3px; left:3px; width:16px; height:16px; background:#fff; border-radius:50%; transition:transform .2s; pointer-events:none; box-shadow:0 1px 3px rgba(0,0,0,.15); }
        .tog input:checked~.tog-thumb { transform:translateX(18px); }

        .int-pill { display:flex; align-items:center; gap:7px; padding:8px 14px; border-radius:24px; border:1.5px solid transparent; cursor:pointer; font-size:13px; font-family:'DM Sans',sans-serif; transition:all .15s; }
        .int-pill:hover { transform:translateY(-1px); }

        .save-btn     { display:flex; align-items:center; gap:7px; padding:11px 22px; background:#7F77DD; border:none; border-radius:10px; font-size:13px; font-weight:600; color:#fff; cursor:pointer; font-family:'DM Sans',sans-serif; transition:background .18s,transform .1s; -webkit-tap-highlight-color:transparent; }
        .save-btn:hover   { background:#6B63CC; }
        .save-btn:active  { transform:scale(.97); }
        .save-btn:disabled{ opacity:.6; cursor:not-allowed; }
        .danger-btn       { padding:9px 16px; background:#FCEBEB; border:1.5px solid #F09595; border-radius:9px; font-size:12px; font-weight:500; color:#A32D2D; cursor:pointer; font-family:'DM Sans',sans-serif; transition:background .15s; }
        .danger-btn:hover { background:#F7C1C1; }

        .drop-zone { border:2px dashed #D3D1C7; border-radius:14px; padding:22px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; cursor:pointer; transition:all .2s; background:#FAFAFA; text-align:center; }
        .drop-zone:hover,.drop-zone.drag { border-color:#7F77DD; background:#EEEDFE; }

        .pwd-wrap { position:relative; }
        .eye-btn  { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#888780; padding:3px; display:flex; }

        .toast { position:fixed; bottom:24px; right:16px; padding:11px 18px; border-radius:12px; font-size:13px; font-weight:500; display:flex; align-items:center; gap:8px; animation:toastIn 2.8s ease both; z-index:9999; box-shadow:0 8px 24px rgba(26,26,46,.2); }
        .toast-ok  { background:#1A1A2E; color:#fff; }
        .toast-err { background:#E24B4A; color:#fff; }

        .sec-content { animation:slideIn .22s ease both; }
        .sublabel    { font-size:10px; font-weight:600; color:#888780; letter-spacing:.08em; text-transform:uppercase; margin-bottom:12px; }
        .info-box    { padding:12px 14px; border-radius:10px; display:flex; align-items:flex-start; gap:9px; font-size:12px; line-height:1.6; }

        .mobile-nav-bar { display:none; align-items:center; gap:12px; background:#fff; border:1px solid #E8E8F0; border-radius:12px; padding:11px 14px; margin-bottom:16px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
        .mobile-nav-bar:active { background:#F5F5FA; }

        .settings-sidebar { display:block; }

        .nav-backdrop { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:300; }
        .nav-backdrop.open { display:block; }

        .nav-sheet { position:fixed; bottom:0; left:0; right:0; background:#fff; border-radius:20px 20px 0 0; padding:0 16px 32px; z-index:301; transform:translateY(100%); transition:transform .3s cubic-bezier(.4,0,.2,1); }
        .nav-sheet.open { transform:translateY(0); animation:sheetUp .3s cubic-bezier(.4,0,.2,1) both; }
        .nav-sheet-handle { width:36px; height:4px; background:#E0E0EA; border-radius:2px; margin:12px auto 16px; }

        .settings-layout { display:grid; grid-template-columns:210px 1fr; gap:22px; align-items:start; }

        @media (max-width:768px) {
          .settings-layout  { grid-template-columns:1fr; gap:0; }
          .settings-sidebar { display:none; }
          .mobile-nav-bar   { display:flex; }
        }
        @media (max-width:480px) {
          .card { padding:16px; }
          .save-btn { width:100%; justify-content:center; }
          .int-pill { font-size:12px; padding:7px 11px; }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.ok ? "toast-ok" : "toast-err"}`}>
          {toast.ok
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          }
          {toast.msg}
        </div>
      )}

      <div style={{ width:"100%", padding:"20px 16px 40px" }}>

        {/* Page header */}
        <div style={{ marginBottom:"22px", animation:"fadeUp .4s ease both" }}>
          <p style={{ fontSize:"12px", color:"#888780", marginBottom:"3px" }}>Manage your account</p>
          <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:"clamp(20px,5vw,26px)", fontWeight:700, color:"#1A1A2E", letterSpacing:"-0.02em" }}>Settings</h1>
        </div>

        {/* Mobile: section picker bar */}
        <div className="mobile-nav-bar" onClick={() => setNavOpen(true)}>
          <div style={{ width:"32px", height:"32px", borderRadius:"50%", overflow:"hidden", flexShrink:0, background: avatar ? "transparent" : "linear-gradient(135deg,#7F77DD,#1D9E75)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:600, color:"#fff" }}>
            {avatar ? <img src={avatar} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : initials}
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:"11px", color:"#B4B2A9", marginBottom:"1px" }}>Settings</p>
            <p style={{ fontSize:"14px", fontWeight:600, color:"#1A1A2E" }}>{currentNav?.icon} {currentNav?.label}</p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888780" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
        </div>

        <div className="settings-layout">

          {/* Desktop sidebar */}
          <div className="settings-sidebar" style={{ animation:"fadeUp .4s .05s ease both", opacity:0, animationFillMode:"forwards" }}>
            <div style={{ background:"#fff", borderRadius:"16px", border:"1px solid #E8E8F0", padding:"10px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"11px 8px 14px", borderBottom:"1px solid #F5F5FA", marginBottom:"6px" }}>
                <div style={{ width:"36px", height:"36px", borderRadius:"50%", overflow:"hidden", flexShrink:0, background: avatar ? "transparent" : "linear-gradient(135deg,#7F77DD,#1D9E75)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px", fontWeight:600, color:"#fff" }}>
                  {avatar ? <img src={avatar} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : initials}
                </div>
                <div style={{ minWidth:0 }}>
                  <p style={{ fontSize:"12px", fontWeight:600, color:"#1A1A2E", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{firstName} {lastName}</p>
                  <p style={{ fontSize:"11px", color:"#888780" }}>@{username}</p>
                </div>
              </div>

              {NAV.map(n => (
                <button key={n.id} className={`snav${section===n.id?" active":""}`} onClick={() => setSection(n.id)}>
                  <span style={{ fontSize:"15px", width:"18px", textAlign:"center" }}>{n.icon}</span>
                  {n.label}
                  {section===n.id && <span style={{ marginLeft:"auto", width:"6px", height:"6px", borderRadius:"50%", background:"#7F77DD", flexShrink:0 }}/>}
                </button>
              ))}

              <div style={{ borderTop:"1px solid #F5F5FA", marginTop:"6px", paddingTop:"7px" }}>
                <button className="snav" style={{ color:"#E24B4A" }} onClick={handleSignOut}>
                  <span style={{ fontSize:"15px", width:"18px", textAlign:"center" }}>🚪</span>
                  Sign out
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={{ animation:"fadeUp .4s .1s ease both", opacity:0, animationFillMode:"forwards", minWidth:0 }}>

            {/* PROFILE */}
            {section==="profile" && (
              <div className="sec-content">
                <SecHeader title="Profile information" sub="How others see you on MeetU" />

                <div className="card">
                  <p className="card-title">Profile photo <span style={{ fontWeight:400, color:"#B4B2A9", fontSize:"12px" }}>(optional)</span></p>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:"18px", flexWrap:"wrap" }}>
                    <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:"8px" }}>
                      <div style={{ width:"80px", height:"80px", borderRadius:"50%", overflow:"hidden", background: avatar ? "transparent" : "linear-gradient(135deg,#7F77DD,#1D9E75)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"24px", fontWeight:700, color:"#fff", border:"3px solid #EEEDFE", animation: avatar ? "pop .35s ease" : "none" }}>
                        {avatar ? <img src={avatar} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : initials}
                      </div>
                      {avatar && <button onClick={handleRemovePhoto} style={{ fontSize:"11px", color:"#E24B4A", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Remove</button>}
                    </div>
                    <div style={{ flex:1, minWidth:"180px" }}>
                      <div
                        className={`drop-zone${drag?" drag":""}`}
                        onClick={() => fileRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setDrag(true); }}
                        onDragLeave={() => setDrag(false)}
                        onDrop={e => { e.preventDefault(); setDrag(false); const f=e.dataTransfer.files[0]; if(f) handleFile(f); }}
                      >
                        <div style={{ width:"40px", height:"40px", background:"#EEEDFE", borderRadius:"12px", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </div>
                        <p style={{ fontSize:"13px", fontWeight:500, color:"#1A1A2E" }}>Drop photo or <span style={{ color:"#7F77DD" }}>browse</span></p>
                        <p style={{ fontSize:"11px", color:"#B4B2A9" }}>PNG, JPG or WEBP · Max 5 MB</p>
                        <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f); }}/>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <p className="card-title">Personal details</p>
                  <div className="grid2">
                    <div className="fl"><label>First name</label><input className="fi" type="text" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="First name"/></div>
                    <div className="fl"><label>Last name</label><input className="fi" type="text" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Last name"/></div>
                    <div className="fl">
                      <label>Username</label>
                      <div style={{ position:"relative" }}>
                        <span style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", fontSize:"13px", color:"#B4B2A9" }}>@</span>
                        <input className="fi" type="text" value={username} onChange={e=>setUsername(e.target.value.replace(/\s/g,"_").toLowerCase())} style={{ paddingLeft:"26px" }}/>
                      </div>
                    </div>
                    <div className="fl">
                      <label>Gender</label>
                      <select className="fi" value={gender} onChange={e=>setGender(e.target.value)}>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="nonbinary">Non-binary</option>
                        <option value="prefer_not">Prefer not to say</option>
                      </select>
                    </div>
                    <div className="fl">
                      <label>Date of birth</label>
                      <input className="fi" type="date" value={dob} onChange={e=>setDob(e.target.value)} max={new Date().toISOString().split("T")[0]}/>
                      {age!==null && <span className="hint">🎂 {age} years old</span>}
                    </div>
                    <div className="fl">
                      <label>Phone number</label>
                      <div style={{ display:"flex" }}>
                        <span style={{ padding:"10px 11px", background:"#F5F5FA", border:"1.5px solid #E8E8F0", borderRight:"none", borderRadius:"10px 0 0 10px", fontSize:"13px", color:"#444441", fontWeight:500, whiteSpace:"nowrap" }}>+91</span>
                        <input className="fi" type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile" style={{ borderRadius:"0 10px 10px 0" }} maxLength={10} inputMode="tel"/>
                      </div>
                    </div>
                    <div className="fl" style={{ gridColumn:"1 / -1" }}>
                      <label>Email address</label>
                      <input className="fi" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" inputMode="email"/>
                    </div>
                    <div className="fl" style={{ gridColumn:"1 / -1" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <label>Bio</label>
                        <span style={{ fontSize:"11px", color: bio.length>180?"#E24B4A":"#B4B2A9" }}>{bio.length}/200</span>
                      </div>
                      <textarea className="fi" value={bio} onChange={e=>e.target.value.length<=200&&setBio(e.target.value)} rows={3} style={{ resize:"vertical", lineHeight:1.6 }} placeholder="Tell people about yourself..."/>
                      <span className="hint">Shown on your public profile and event pages</span>
                    </div>
                  </div>
                </div>
                <SaveRow label="Save profile" onSave={handleSaveProfile} loading={loading}/>
              </div>
            )}

            {/* LOCATION */}
            {section==="location" && (
              <div className="sec-content">
                <SecHeader title="Your location" sub="Helps us show events near you"/>
                <div style={{ background:"#1A1A2E", borderRadius:"14px", padding:"16px 18px", marginBottom:"14px", display:"flex", alignItems:"center", gap:"14px", flexWrap:"wrap" }}>
                  <div style={{ width:"42px", height:"42px", background:"rgba(127,119,221,.2)", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" strokeWidth="1.8" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:"15px", fontWeight:600, color:"#AFA9EC" }}>{area||"—"}, {district||"—"}</p>
                    <p style={{ fontSize:"12px", color:"rgba(255,255,255,.4)" }}>{state||"—"} · India</p>
                  </div>
                  {pincode && <p style={{ fontSize:"12px", fontWeight:500, color:"rgba(255,255,255,.6)" }}>📮 {pincode}</p>}
                </div>
                <div className="card">
                  <p className="card-title">Address details</p>
                  <div style={{ display:"flex", flexDirection:"column", gap:"13px" }}>
                    <div className="fl">
                      <label>State</label>
                      <select className="fi" value={state} onChange={e=>onState(e.target.value)}>
                        {Object.keys(LOCATION_DATA).map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="grid2">
                      <div className="fl"><label>District</label><select className="fi" value={district} onChange={e=>onDistrict(e.target.value)}>{districts.map(d=><option key={d}>{d}</option>)}</select></div>
                      <div className="fl"><label>Area / City</label><select className="fi" value={area} onChange={e=>setArea(e.target.value)}>{areas.map(a=><option key={a}>{a}</option>)}</select></div>
                      <div className="fl"><label>Pincode</label><input className="fi" type="text" value={pincode} onChange={e=>setPincode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="6-digit pincode" maxLength={6} inputMode="numeric"/></div>
                      <div className="fl"><label>Landmark <span style={{ fontWeight:400, color:"#B4B2A9" }}>(optional)</span></label><input className="fi" type="text" value={landmark} onChange={e=>setLandmark(e.target.value)} placeholder="e.g. Near Meenakshi Temple"/></div>
                    </div>
                  </div>
                  <div className="info-box" style={{ background:"#EEEDFE", marginTop:"16px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#534AB7" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:"1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <p style={{ color:"#3C3489" }}>Only your city is shown publicly. Your exact address is never shared.</p>
                  </div>
                </div>
                <SaveRow label="Save location" onSave={handleSaveLocation} loading={loading}/>
              </div>
            )}

            {/* INTERESTS */}
            {section==="interests" && (
              <div className="sec-content">
                <SecHeader title="Your interests" sub="We personalise your event feed based on these"/>
                <div className="card">
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
                    <p style={{ fontSize:"13px", color:"#888780" }}><strong style={{ color:"#1A1A2E" }}>{interests.size}</strong> selected · Pick at least one</p>
                    {interests.size>0 && <button onClick={()=>setInterests(new Set())} style={{ fontSize:"12px", color:"#E24B4A", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>Clear all</button>}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"9px" }}>
                    {INTERESTS.map(int => {
                      const sel=interests.has(int.id);
                      return (
                        <button key={int.id} className="int-pill" onClick={()=>toggleInt(int.id)} style={{ background: sel?int.bg:"#FAFAFA", borderColor: sel?int.color:"#E8E8F0", color: sel?int.color:"#888780", fontWeight: sel?600:400 }}>
                          <span style={{ fontSize:"16px" }}>{int.emoji}</span>
                          {int.label}
                          {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                      );
                    })}
                  </div>
                  {interests.size===0 && (
                    <div className="info-box" style={{ background:"#FAEEDA", marginTop:"14px" }}>
                      <span>⚠️</span>
                      <p style={{ color:"#633806" }}>Select at least one interest to personalise your event feed.</p>
                    </div>
                  )}
                </div>
                <SaveRow label="Save interests" onSave={handleSaveInterests} loading={loading}/>
              </div>
            )}

            {/* ACCOUNT */}
            {section==="account" && (
              <div className="sec-content">
                <SecHeader title="Account & security" sub="Manage your login and connected accounts"/>

                {/* Only show password section for email users */}
                {provider === "email" ? (
                  <div className="card">
                    <p className="card-title">Change password</p>
                    <div style={{ display:"flex", flexDirection:"column", gap:"13px" }}>
                      {[
                        { label:"Current password",    val:curPwd,  set:setCurPwd  },
                        { label:"New password",         val:newPwd,  set:setNewPwd  },
                        { label:"Confirm new password", val:confPwd, set:setConfPwd },
                      ].map(({ label, val, set }) => (
                        <div key={label} className="fl">
                          <label>{label}</label>
                          <div className="pwd-wrap">
                            <input className="fi" type={showPwd?"text":"password"} value={val} onChange={e=>set(e.target.value)} placeholder="••••••••" style={{ paddingRight:"38px" }}/>
                            <button className="eye-btn" onClick={()=>setShowPwd(!showPwd)} type="button">
                              {showPwd
                                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                              }
                            </button>
                          </div>
                        </div>
                      ))}
                      {newPwd&&confPwd&&newPwd!==confPwd && <p style={{ fontSize:"12px", color:"#E24B4A" }}>Passwords do not match</p>}
                      {newPwd&&newPwd.length<8 && <p style={{ fontSize:"12px", color:"#BA7517" }}>Password must be at least 8 characters</p>}
                    </div>
                  </div>
                ) : (
                  <div className="card">
                    <div className="info-box" style={{ background:"#E6F1FB" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0, marginTop:"1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <p style={{ color:"#0C447C" }}>You signed in with Google. Password management is handled by your Google account.</p>
                    </div>
                  </div>
                )}

                <div className="card">
                  <p className="card-title">Connected accounts</p>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"11px 13px", background:"#F5F5FA", borderRadius:"10px", gap:"10px", flexWrap:"wrap" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                      <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/><path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
                      <div><p style={{ fontSize:"13px", fontWeight:500, color:"#1A1A2E" }}>Google</p><p style={{ fontSize:"11px", color:"#888780" }}>{email}</p></div>
                    </div>
                    <span style={{ fontSize:"11px", fontWeight:600, color: provider==="google"?"#1D9E75":"#888780", background: provider==="google"?"#EAF3DE":"#F5F5FA", padding:"3px 10px", borderRadius:"20px", flexShrink:0 }}>
                      {provider==="google" ? "Connected" : "Not linked"}
                    </span>
                  </div>
                </div>

                <div style={{ background:"#FCEBEB", borderRadius:"14px", border:"1px solid #F7C1C1", padding:"18px 20px", marginBottom:"14px" }}>
                  <p style={{ fontSize:"13px", fontWeight:600, color:"#A32D2D", marginBottom:"3px" }}>Danger zone</p>
                  <p style={{ fontSize:"12px", color:"#791F1F", marginBottom:"13px" }}>These actions are permanent and cannot be undone.</p>
                  <div style={{ display:"flex", gap:"9px", flexWrap:"wrap" }}>
                    <button className="danger-btn" onClick={handleDeactivate}>Deactivate account</button>
                    <button className="danger-btn" style={{ background:"#E24B4A", borderColor:"#E24B4A", color:"#fff" }} onClick={handleDeleteAccount}>Delete account</button>
                  </div>
                </div>

                {provider === "email" && (
                  <SaveRow label="Update password" onSave={handleChangePassword} loading={loading}/>
                )}
              </div>
            )}

            {/* NOTIFICATIONS */}
            {section==="notifications" && (
              <div className="sec-content">
                <SecHeader title="Notification preferences" sub="Choose what you hear about and how"/>
                <div className="card">
                  <p className="sublabel">In-app notifications</p>
                  <Tog label="Someone joins your event"  sub="Notified when a user joins your created event"     val={nJoin}  set={setNJoin}/>
                  <Tog label="Event reminders"            sub="24-hour reminder before your upcoming events"       val={nRem}   set={setNRem}/>
                  <Tog label="Event updates"              sub="When organiser changes date, time, or venue"         val={nUpd}   set={setNUpd}/>
                </div>
                <div className="card">
                  <p className="sublabel">Email & SMS</p>
                  <Tog label="Email notifications"  sub="Receive event updates and reminders via email"     val={nEmail} set={setNEmail}/>
                  <Tog label="SMS notifications"    sub="Receive text messages for important event updates" val={nSMS}   set={setNSMS}/>
                </div>
                <SaveRow label="Save preferences" onSave={handleSaveNotifs} loading={loading}/>
              </div>
            )}

            {/* PRIVACY */}
            {section==="privacy" && (
              <div className="sec-content">
                <SecHeader title="Privacy controls" sub="Control who sees your information"/>
                <div className="card">
                  <p className="sublabel">Visibility</p>
                  <Tog label="Public profile"      sub="Anyone on MeetU can view your profile"           val={pubProf}  set={setPubProf}/>
                  <Tog label="Show email address"  sub="Display your email on your public profile"       val={shEmail}  set={setShEmail}/>
                  <Tog label="Show phone number"   sub="Display your number to event creators"           val={shPhone}  set={setShPhone}/>
                  <Tog label="Show joined events"  sub="Let others see which events you have joined"     val={shEvents} set={setShEvents}/>
                </div>
                <div className="card">
                  <p style={{ fontSize:"13px", fontWeight:600, color:"#1A1A2E", marginBottom:"11px" }}>Data & privacy</p>
                  {["Download my data","Request data deletion"].map(label => (
                    <button key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"11px 13px", background:"#F5F5FA", border:"none", borderRadius:"9px", fontSize:"13px", color:"#1A1A2E", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginBottom:"8px" }}>
                      {label}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888780" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                </div>
                <SaveRow label="Save privacy settings" onSave={handleSavePrivacy} loading={loading}/>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Mobile Nav Drawer */}
      <div className={`nav-backdrop${navOpen?" open":""}`} onClick={() => setNavOpen(false)} />
      <div className={`nav-sheet${navOpen?" open":""}`}>
        <div className="nav-sheet-handle" />
        <div style={{ display:"flex", alignItems:"center", gap:"12px", padding:"12px 4px 16px", borderBottom:"1px solid #F5F5FA", marginBottom:"8px" }}>
          <div style={{ width:"44px", height:"44px", borderRadius:"50%", overflow:"hidden", flexShrink:0, background: avatar ? "transparent" : "linear-gradient(135deg,#7F77DD,#1D9E75)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", fontWeight:600, color:"#fff" }}>
            {avatar ? <img src={avatar} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : initials}
          </div>
          <div>
            <p style={{ fontSize:"14px", fontWeight:600, color:"#1A1A2E" }}>{firstName} {lastName}</p>
            <p style={{ fontSize:"12px", color:"#888780" }}>@{username}</p>
          </div>
        </div>

        {NAV.map(n => (
          <button
            key={n.id}
            onClick={() => handleNavSelect(n.id)}
            style={{ display:"flex", alignItems:"center", gap:"13px", width:"100%", padding:"13px 10px", background: section===n.id ? "rgba(127,119,221,.1)" : "transparent", border:"none", borderRadius:"12px", fontSize:"15px", color: section===n.id ? "#3C3489" : "#1A1A2E", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight: section===n.id ? 600 : 400, marginBottom:"3px", textAlign:"left", WebkitTapHighlightColor:"transparent" }}
          >
            <span style={{ fontSize:"20px", width:"26px", textAlign:"center" }}>{n.icon}</span>
            {n.label}
            {section===n.id && <span style={{ marginLeft:"auto", width:"7px", height:"7px", borderRadius:"50%", background:"#7F77DD" }}/>}
          </button>
        ))}

        <div style={{ borderTop:"1px solid #F5F5FA", marginTop:"8px", paddingTop:"8px" }}>
          <button onClick={handleSignOut} style={{ display:"flex", alignItems:"center", gap:"13px", width:"100%", padding:"13px 10px", background:"transparent", border:"none", borderRadius:"12px", fontSize:"15px", color:"#E24B4A", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:500, textAlign:"left" }}>
            <span style={{ fontSize:"20px", width:"26px", textAlign:"center" }}>🚪</span>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SecHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom:"18px" }}>
      <h2 style={{ fontSize:"clamp(16px,4vw,18px)", fontWeight:600, color:"#1A1A2E", marginBottom:"3px" }}>{title}</h2>
      <p style={{ fontSize:"13px", color:"#888780" }}>{sub}</p>
    </div>
  );
}

function SaveRow({ label="Save changes", onSave, loading }: { label?: string; onSave: () => void; loading?: boolean }) {
  return (
    <div style={{ display:"flex", justifyContent:"flex-end" }}>
      <button className="save-btn" onClick={onSave} disabled={loading}>
        {loading
          ? <span style={{ width:"14px", height:"14px", border:"2px solid rgba(255,255,255,.4)", borderTop:"2px solid #fff", borderRadius:"50%", display:"inline-block", animation:"spin .7s linear infinite" }}/>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        }
        {loading ? "Saving…" : label}
      </button>
    </div>
  );
}

function Tog({ label, sub, val, set }: { label: string; sub: string; val: boolean; set: (v:boolean)=>void }) {
  return (
    <div className="trow">
      <div style={{ flex:1, paddingRight:"14px" }}>
        <p style={{ fontSize:"13px", fontWeight:500, color:"#1A1A2E", marginBottom:"2px" }}>{label}</p>
        <p style={{ fontSize:"12px", color:"#888780" }}>{sub}</p>
      </div>
      <label className="tog" onClick={()=>set(!val)}>
        <input type="checkbox" checked={val} onChange={()=>{}}/>
        <span className="tog-track"/>
        <span className="tog-thumb"/>
      </label>
    </div>
  );
}