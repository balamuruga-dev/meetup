// app/actions/dashboardActions.ts
//
// ─────────────────────────────────────────────────────────────────────────────
//  All Firebase Firestore logic for the Dashboard page.
//  Dashboard page.tsx imports ONLY these functions.
//  No Firebase code lives in the UI component.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  type Unsubscribe,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// ─── Shared result type ───────────────────────────────────────────────────────
export interface ActionResult<T = undefined> {
  success: boolean;
  error?:  string;
  data?:   T;
}

// ─── Data shapes ──────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalEventsCreated: number;
  totalJoined:        number;      // sum of all attendees across created events
  upcomingCount:      number;
  savedCount:         number;
  totalViews:         number;
  totalRevenue:       number;
}

export type EventStatus = "upcoming" | "live" | "past" | "cancelled";

export interface DashboardEvent {
  id:            string;
  title:         string;
  category:      string;
  categoryColor: string;
  categoryBg:    string;
  date:          string;          // ISO date string  YYYY-MM-DD
  dateDisplay:   string;          // "Sat 12 Apr"
  time:          string;          // "6:00 PM"
  city:          string;
  state:         string;
  joined:        number;
  max:           number | null;
  type:          "Free" | "Paid";
  price?:        number;
  status:        EventStatus;
  image:         string;          // category emoji fallback
  organizer:     string;
  role:          "creator" | "attendee";
  views?:        number;
  revenue?:      number;
}

export interface DashboardNotification {
  id:        string;
  type:      "join" | "reminder" | "update" | "cancel" | "new_event" | "system";
  title:     string;
  body:      string;
  timeAgo:   string;
  read:      boolean;
  iconBg:    string;
  iconColor: string;
  emoji:     string;
  eventId?:  string;
  createdAt: Timestamp | null;
}

export interface UserInterest {
  id:    string;
  label: string;
  bg:    string;
  color: string;
}

export interface DashboardData {
  stats:         DashboardStats;
  createdEvents: DashboardEvent[];
  joinedEvents:  DashboardEvent[];
  notifications: DashboardNotification[];
  userName:      string;
  userCity:      string;
  userState:     string;
  interests:     string[];
}

// ─── Category colour map ──────────────────────────────────────────────────────
const CAT_COLORS: Record<string, { color: string; bg: string; emoji: string }> = {
  tech:        { color:"#3C3489", bg:"#EEEDFE", emoji:"💻" },
  music:       { color:"#633806", bg:"#FAEEDA", emoji:"🎵" },
  art:         { color:"#72243E", bg:"#FBEAF0", emoji:"🎨" },
  food:        { color:"#712B13", bg:"#FAECE7", emoji:"🍜" },
  sports:      { color:"#085041", bg:"#E1F5EE", emoji:"⚽" },
  health:      { color:"#27500A", bg:"#EAF3DE", emoji:"🧘" },
  business:    { color:"#0C447C", bg:"#E6F1FB", emoji:"💼" },
  photography: { color:"#085041", bg:"#E1F5EE", emoji:"📸" },
  fashion:     { color:"#72243E", bg:"#FBEAF0", emoji:"👗" },
  gaming:      { color:"#3C3489", bg:"#EEEDFE", emoji:"🎮" },
  education:   { color:"#0C447C", bg:"#E6F1FB", emoji:"📚" },
  travel:      { color:"#085041", bg:"#E1F5EE", emoji:"✈️" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a Firestore Timestamp or ISO string → "Sat 12 Apr" */
function formatDateDisplay(date: string | Timestamp | null): string {
  if (!date) return "";
  const d = date instanceof Timestamp
    ? date.toDate()
    : new Date(date);
  return d.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });
}

/** Convert a Firestore Timestamp or ISO string → "YYYY-MM-DD" */
function toIsoDate(date: string | Timestamp | null): string {
  if (!date) return "";
  const d = date instanceof Timestamp ? date.toDate() : new Date(date);
  return d.toISOString().split("T")[0];
}

/** Derive EventStatus from Firestore status field + date */
function deriveStatus(
  storedStatus: string,
  isoDate:      string
): EventStatus {
  if (storedStatus === "cancelled") return "cancelled";
  const today = new Date().toISOString().split("T")[0];
  if (isoDate < today)  return "past";
  if (isoDate === today) return "live";
  return "upcoming";
}

/** Format a Firestore Timestamp → "2 hours ago" style */
function timeAgo(ts: Timestamp | null): string {
  if (!ts) return "";
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (secs < 60)   return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400)return `${Math.floor(secs / 3600)} hr${Math.floor(secs / 3600) > 1 ? "s" : ""} ago`;
  if (secs < 172800) return "Yesterday";
  return `${Math.floor(secs / 86400)} days ago`;
}

/** Map a raw Firestore event doc → DashboardEvent */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(id: string, data: any, role: "creator" | "attendee"): DashboardEvent {
  const cat    = (data.category ?? "").toLowerCase();
  const catCfg = CAT_COLORS[cat] ?? { color:"#444441", bg:"#F1EFE8", emoji:"📅" };
  const isoDate = toIsoDate(data.date ?? data.eventDate ?? null);

  return {
    id,
    title:         data.title         ?? "Untitled event",
    category:      data.category      ?? "",
    categoryColor: catCfg.color,
    categoryBg:    catCfg.bg,
    date:          isoDate,
    dateDisplay:   formatDateDisplay(data.date ?? data.eventDate ?? null),
    time:          data.time          ?? data.startTime ?? "",
    city:          data.city          ?? data.area      ?? "",
    state:         data.state         ?? "",
    joined:        data.joined        ?? data.joinedCount ?? 0,
    max:           data.maxAttendees  ?? data.max       ?? null,
    type:          data.entryType     ?? data.type      ?? "Free",
    price:         data.price         ?? undefined,
    status:        deriveStatus(data.status ?? "upcoming", isoDate),
    image:         catCfg.emoji,
    organizer:     data.contactName   ?? data.organizer ?? "",
    role,
    views:         data.views         ?? 0,
    revenue:       data.revenue       ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  1.  LOAD ALL DASHBOARD DATA  (single call from Dashboard useEffect)
// ─────────────────────────────────────────────────────────────────────────────
export async function loadDashboardData(): Promise<ActionResult<DashboardData>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // ── 1a. User profile ──────────────────────────────────────────────────
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const profile     = profileSnap.exists() ? profileSnap.data() : {};

    const userName  = `${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim()
                      || user.displayName
                      || "User";
    const userCity  = profile.area     ?? profile.district ?? "";
    const userState = profile.state    ?? "";
    const interests = profile.interests ?? [];

    // ── 1b. Events CREATED by this user ───────────────────────────────────
    // NOTE: orderBy("date") requires a composite index (creatorId + date).
    // Until the index is built in Firebase Console, we sort client-side.
    const createdQuery = query(
      collection(db, "events"),
      where("creatorId", "==", user.uid),
      limit(20)
    );
    const createdSnap = await getDocs(createdQuery);
    const createdEvents: DashboardEvent[] = createdSnap.docs
      .map(d => mapEvent(d.id, d.data(), "creator"))
      .sort((a, b) => a.date.localeCompare(b.date)); // client-side sort

    // ── 1c. Events this user JOINED ────────────────────────────────────────
    // Strategy: query the user's joinedEvents subcollection
    // (written by joinEventActions when a user joins)
    const joinedQuery = query(
      collection(db, "users", user.uid, "joinedEvents"),
      orderBy("joinedAt", "desc"),
      limit(10)
    );
    const joinedSnap = await getDocs(joinedQuery);

    // Fetch the actual event documents in parallel
    const joinedEvents: DashboardEvent[] = (
      await Promise.all(
        joinedSnap.docs.map(async jd => {
          const eventId = jd.data().eventId as string;
          if (!eventId) return null;
          const evSnap = await getDoc(doc(db, "events", eventId));
          if (!evSnap.exists()) return null;
          return mapEvent(evSnap.id, evSnap.data(), "attendee");
        })
      )
    ).filter(Boolean) as DashboardEvent[];

    // ── 1d. Saved events count ────────────────────────────────────────────
    const savedSnap = await getDocs(
      collection(db, "users", user.uid, "savedEvents")
    );
    const savedCount = savedSnap.size;

    // ── 1e. Notifications ──────────────────────────────────────────────────
    // NOTE: orderBy("createdAt") with where("userId") requires a composite index.
    // Sorting client-side until the index is built.
    const notifQuery = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      limit(10)
    );
    const notifSnap = await getDocs(notifQuery);
    const notifications: DashboardNotification[] = notifSnap.docs
      .map(d => {
        const data = d.data();
        return {
          id:        d.id,
          type:      data.type      ?? "system",
          title:     data.title     ?? "",
          body:      data.body      ?? "",
          timeAgo:   timeAgo(data.createdAt ?? null),
          read:      data.read      ?? false,
          iconBg:    notifIconBg(data.type),
          iconColor: notifIconColor(data.type),
          emoji:     notifEmoji(data.type),
          eventId:   data.eventId   ?? undefined,
          createdAt: data.createdAt ?? null,
        };
      })
      .sort((a, b) => {
        // Sort newest first client-side
        const aMs = a.createdAt?.toMillis?.() ?? 0;
        const bMs = b.createdAt?.toMillis?.() ?? 0;
        return bMs - aMs;
      });

    // ── 1f. Compute stats ─────────────────────────────────────────────────
    const today         = new Date().toISOString().split("T")[0];
    const upcomingCount = createdEvents.filter(
      e => e.status === "upcoming" || e.status === "live"
    ).length;
    const totalJoined   = createdEvents.reduce((s, e) => s + e.joined, 0);
    const totalViews    = createdEvents.reduce((s, e) => s + (e.views ?? 0), 0);
    const totalRevenue  = createdEvents.reduce((s, e) => s + (e.revenue ?? 0), 0);

    const stats: DashboardStats = {
      totalEventsCreated: createdEvents.length,
      totalJoined,
      upcomingCount,
      savedCount,
      totalViews,
      totalRevenue,
    };

    return {
      success: true,
      data: {
        stats,
        createdEvents,
        joinedEvents,
        notifications,
        userName,
        userCity,
        userState,
        interests,
      },
    };
  } catch (err) {
    console.error("[loadDashboardData]", err);
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  2.  REAL-TIME STATS LISTENER
//      Subscribes to the user's events and updates joined counts live.
//      Returns an unsubscribe function — call it in the useEffect cleanup.
//
//  Usage in Dashboard:
//    useEffect(() => {
//      const unsub = subscribeToStats((stats) => setStats(stats));
//      return () => unsub();
//    }, []);
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToStats(
  onUpdate: (stats: DashboardStats) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, "events"),
    where("creatorId", "==", user.uid)
  );

  return onSnapshot(q, snapshot => {
    const events = snapshot.docs.map(d => d.data());
    const today  = new Date().toISOString().split("T")[0];

    onUpdate({
      totalEventsCreated: events.length,
      totalJoined:        events.reduce((s, e) => s + (e.joined ?? e.joinedCount ?? 0), 0),
      upcomingCount:      events.filter(e => {
        const iso = toIsoDate(e.date ?? null);
        return iso >= today && e.status !== "cancelled";
      }).length,
      savedCount:         0,  // updated separately
      totalViews:         events.reduce((s, e) => s + (e.views ?? 0), 0),
      totalRevenue:       events.reduce((s, e) => s + (e.revenue ?? 0), 0),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  3.  REAL-TIME NOTIFICATIONS LISTENER
//      Keeps the notification badge and panel live.
//
//  Usage:
//    useEffect(() => {
//      const unsub = subscribeToNotifications((notifs) => setNotifications(notifs));
//      return () => unsub();
//    }, []);
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToNotifications(
  onUpdate: (notifs: DashboardNotification[]) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, "notifications"),
    where("userId", "==", user.uid),
    limit(10)
    // orderBy removed — sort client-side until composite index is built
  );

  return onSnapshot(q, snapshot => {
    onUpdate(
      snapshot.docs.map(d => {
        const data = d.data();
        return {
          id:        d.id,
          type:      data.type      ?? "system",
          title:     data.title     ?? "",
          body:      data.body      ?? "",
          timeAgo:   timeAgo(data.createdAt ?? null),
          read:      data.read      ?? false,
          iconBg:    notifIconBg(data.type),
          iconColor: notifIconColor(data.type),
          emoji:     notifEmoji(data.type),
          eventId:   data.eventId   ?? undefined,
          createdAt: data.createdAt ?? null,
        };
      })
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  4.  MARK NOTIFICATION AS READ
// ─────────────────────────────────────────────────────────────────────────────
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  try {
    const { updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(db, "notifications", notificationId), { read: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  5.  MARK ALL NOTIFICATIONS READ
// ─────────────────────────────────────────────────────────────────────────────
export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const { updateDoc, writeBatch } = await import("firebase/firestore");
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("read",   "==", false)
    );
    const snap  = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  6.  LOAD RECOMMENDED EVENTS
//      Uses the user's interests + location for the "Recommended for you" feed.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadRecommendedEvents(
  interests: string[],
  userState: string,
  maxResults = 6
): Promise<ActionResult<DashboardEvent[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Query by first interest + state for targeted results
    const primaryInterest = interests[0];
    let q;

    if (primaryInterest && userState) {
      q = query(
        collection(db, "events"),
        where("status",   "!=", "cancelled"),
        where("category", "==", primaryInterest),
        where("state",    "==", userState),
        orderBy("status"),
        orderBy("date", "asc"),
        limit(maxResults)
      );
    } else if (primaryInterest) {
      q = query(
        collection(db, "events"),
        where("status",   "!=", "cancelled"),
        where("category", "==", primaryInterest),
        orderBy("status"),
        orderBy("date", "asc"),
        limit(maxResults)
      );
    } else {
      // Fallback: most popular events
      q = query(
        collection(db, "events"),
        where("status", "!=", "cancelled"),
        orderBy("status"),
        orderBy("joined", "desc"),
        limit(maxResults)
      );
    }

    const snap = await getDocs(q);
    const events = snap.docs.map(d => mapEvent(d.id, d.data(), "attendee"));
    return { success: true, data: events };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  7.  LOAD NEARBY EVENTS  (same state)
// ─────────────────────────────────────────────────────────────────────────────
export async function loadNearbyEvents(
  userState: string,
  maxResults = 6
): Promise<ActionResult<DashboardEvent[]>> {
  try {
    if (!userState) return { success: true, data: [] };

    const q = query(
      collection(db, "events"),
      where("status", "!=", "cancelled"),
      where("state",  "==", userState),
      orderBy("status"),
      orderBy("date", "asc"),
      limit(maxResults)
    );

    const snap = await getDocs(q);
    return {
      success: true,
      data: snap.docs.map(d => mapEvent(d.id, d.data(), "attendee")),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  8.  GET GREETING
//      Returns "Good morning", "Good afternoon", or "Good evening"
// ─────────────────────────────────────────────────────────────────────────────
export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─────────────────────────────────────────────────────────────────────────────
//  9.  FORMAT TODAY'S DATE  →  "Saturday, 12 April 2025"
// ─────────────────────────────────────────────────────────────────────────────
export function formatTodayDate(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
  });
}

// ─── Notification styling helpers ─────────────────────────────────────────────
function notifIconBg(type: string): string {
  const map: Record<string, string> = {
    join:      "#EEEDFE",
    reminder:  "#FAEEDA",
    update:    "#E6F1FB",
    cancel:    "#FCEBEB",
    new_event: "#FBEAF0",
    system:    "#E1F5EE",
  };
  return map[type] ?? "#F1EFE8";
}
function notifIconColor(type: string): string {
  const map: Record<string, string> = {
    join:      "#534AB7",
    reminder:  "#854F0B",
    update:    "#185FA5",
    cancel:    "#A32D2D",
    new_event: "#72243E",
    system:    "#085041",
  };
  return map[type] ?? "#444441";
}
function notifEmoji(type: string): string {
  const map: Record<string, string> = {
    join:      "👤",
    reminder:  "🔔",
    update:    "📍",
    cancel:    "❌",
    new_event: "🎉",
    system:    "✅",
  };
  return map[type] ?? "📢";
}