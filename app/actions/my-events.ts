// app/actions/myEventsActions.ts
// All Firebase Firestore logic for the My Events page.
// MyEventsPage.tsx imports ONLY these functions — no Firebase in the UI.

"use client";

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface MyEvent {
  id: string;
  title: string;
  category: string;
  categoryColor: string;
  categoryBg: string;
  date: string;         // ISO "YYYY-MM-DD"
  dateDisplay: string;  // "Sat 12 Apr"
  time: string;         // "6:00 PM"
  city: string;
  state: string;
  joined: number;
  max: number | null;
  type: "Free" | "Paid";
  price?: number;
  status: "upcoming" | "live" | "past" | "cancelled";
  image: string;        // category emoji
  organizer: string;
  role: "creator" | "attendee";
  views?: number;
  revenue?: number;
  coverImage?: string;
}

export interface EventStats {
  joined: number;
  views: number;
  revenue: number;
  participantCount: number;
}

export interface MyEventsSummary {
  totalCreated: number;
  totalJoined: number;    // sum of joined across all created events
  totalViews: number;
  totalRevenue: number;
  upcomingCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAT_COLORS: Record<
  string,
  { color: string; bg: string; emoji: string }
> = {
  tech:        { color: "#3C3489", bg: "#EEEDFE", emoji: "💻" },
  music:       { color: "#633806", bg: "#FAEEDA", emoji: "🎵" },
  art:         { color: "#72243E", bg: "#FBEAF0", emoji: "🎨" },
  food:        { color: "#712B13", bg: "#FAECE7", emoji: "🍜" },
  sports:      { color: "#085041", bg: "#E1F5EE", emoji: "⚽" },
  health:      { color: "#27500A", bg: "#EAF3DE", emoji: "🧘" },
  business:    { color: "#0C447C", bg: "#E6F1FB", emoji: "💼" },
  photography: { color: "#085041", bg: "#E1F5EE", emoji: "📸" },
  fashion:     { color: "#72243E", bg: "#FBEAF0", emoji: "👗" },
  gaming:      { color: "#3C3489", bg: "#EEEDFE", emoji: "🎮" },
  education:   { color: "#0C447C", bg: "#E6F1FB", emoji: "📚" },
  travel:      { color: "#085041", bg: "#E1F5EE", emoji: "✈️" },
};

const DEFAULT_CAT = { color: "#3C3489", bg: "#EEEDFE", emoji: "📅" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(ts: string | Timestamp | null | undefined): string {
  if (!ts) return "";
  if (ts instanceof Timestamp) return ts.toDate().toISOString().split("T")[0];
  return String(ts).split("T")[0];
}

function deriveStatus(
  stored: string,
  isoDate: string
): MyEvent["status"] {
  if (stored === "cancelled") return "cancelled";
  const today = new Date().toISOString().split("T")[0];
  if (isoDate < today) return "past";
  if (isoDate === today) return "live";
  return "upcoming";
}

function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }); // e.g. "Sat 12 Apr"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docToMyEvent(id: string, data: any, role: MyEvent["role"]): MyEvent {
  const catKey = (data.category ?? "").toLowerCase();
  const cat = CAT_COLORS[catKey] ?? DEFAULT_CAT;
  const isoDate = toIso(data.date);

  return {
    id,
    title: data.title ?? "",
    category: data.category ?? "",
    categoryColor: cat.color,
    categoryBg: cat.bg,
    date: isoDate,
    dateDisplay: formatDateDisplay(isoDate),
    time: data.time ?? data.startTime ?? "",
    city: data.city ?? data.area ?? "",
    state: data.state ?? "",
    joined: data.joined ?? 0,
    max: data.maxAttendees ?? null,
    type: data.entryType === "Paid" ? "Paid" : "Free",
    price: data.price,
    status: deriveStatus(data.status ?? "", isoDate),
    image: cat.emoji,
    organizer: data.organizer ?? data.contactName ?? "",
    role,
    views: data.views,
    revenue: data.revenue,
    coverImage: data.coverImage,
  };
}

// ---------------------------------------------------------------------------
// 1. loadCreatedEvents
// ---------------------------------------------------------------------------

export async function loadCreatedEvents(): Promise<ActionResult<MyEvent[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // ✅ No orderBy — sort client-side to avoid composite index requirement
    const snap = await getDocs(
      query(
        collection(db, "events"),
        where("creatorId", "==", user.uid)
      )
    );

    const events: MyEvent[] = snap.docs
      .map((d) => docToMyEvent(d.id, d.data(), "creator"))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { success: true, data: events };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 2. loadJoinedEvents  (upcoming + live only)
// ---------------------------------------------------------------------------

export async function loadJoinedEvents(): Promise<ActionResult<MyEvent[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const joinedSnap = await getDocs(
      collection(db, "users", user.uid, "joinedEvents")
    );

    if (joinedSnap.empty) return { success: true, data: [] };

    // Fetch all event docs in parallel
    const eventDocs = await Promise.all(
      joinedSnap.docs.map((ref) => getDoc(doc(db, "events", ref.id)))
    );

    const today = new Date().toISOString().split("T")[0];

    const events: MyEvent[] = eventDocs
      .filter((d) => d.exists())
      .map((d) => docToMyEvent(d.id, d.data()!, "attendee"))
      .filter((e) => e.date >= today && e.status !== "cancelled"); // keep upcoming + live

    return { success: true, data: events };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 3. loadSavedEvents
// ---------------------------------------------------------------------------

export async function loadSavedEvents(): Promise<ActionResult<MyEvent[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const savedSnap = await getDocs(
      collection(db, "users", user.uid, "savedEvents")
    );

    if (savedSnap.empty) return { success: true, data: [] };

    const eventDocs = await Promise.all(
      savedSnap.docs.map((ref) => getDoc(doc(db, "events", ref.id)))
    );

    const events: MyEvent[] = eventDocs
      .filter((d) => d.exists())
      .map((d) => docToMyEvent(d.id, d.data()!, "attendee"));

    return { success: true, data: events };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 4. loadPastEvents  (created past + attended past, deduped, desc)
// ---------------------------------------------------------------------------

export async function loadPastEvents(): Promise<ActionResult<MyEvent[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const today = new Date().toISOString().split("T")[0];

    // ── Created past events ──────────────────────────────────────────────────
    const createdSnap = await getDocs(
      query(
        collection(db, "events"),
        where("creatorId", "==", user.uid)
      )
    );
    const createdPast: MyEvent[] = createdSnap.docs
      .map((d) => docToMyEvent(d.id, d.data(), "creator"))
      .filter((e) => e.date < today || e.status === "cancelled");

    // ── Attended past events ─────────────────────────────────────────────────
    const joinedSnap = await getDocs(
      collection(db, "users", user.uid, "joinedEvents")
    );

    let attendedPast: MyEvent[] = [];
    if (!joinedSnap.empty) {
      const eventDocs = await Promise.all(
        joinedSnap.docs.map((ref) => getDoc(doc(db, "events", ref.id)))
      );
      attendedPast = eventDocs
        .filter((d) => d.exists())
        .map((d) => docToMyEvent(d.id, d.data()!, "attendee"))
        .filter((e) => e.date < today);
    }

    // ── Combine & deduplicate (creator role wins on conflict) ────────────────
    const map = new Map<string, MyEvent>();
    for (const e of attendedPast) map.set(e.id, e);
    for (const e of createdPast) map.set(e.id, e); // creator overwrites attendee

    const events = Array.from(map.values()).sort((a, b) =>
      b.date.localeCompare(a.date) // descending
    );

    return { success: true, data: events };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 5. cancelEvent
// ---------------------------------------------------------------------------

export async function cancelEvent(eventId: string): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);

    if (!eventSnap.exists()) return { success: false, error: "Event not found." };

    const data = eventSnap.data();
    if (data.creatorId !== user.uid)
      return { success: false, error: "Permission denied." };

    await updateDoc(eventRef, { status: "cancelled" });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 6. deleteEvent
// ---------------------------------------------------------------------------

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const eventRef = doc(db, "events", eventId);
    const eventSnap = await getDoc(eventRef);

    if (!eventSnap.exists()) return { success: false, error: "Event not found." };

    const data = eventSnap.data();
    if (data.creatorId !== user.uid)
      return { success: false, error: "Permission denied." };

    // Delete participants subcollection in parallel
    const participantsSnap = await getDocs(
      collection(db, "events", eventId, "participants")
    );
    await Promise.all(
      participantsSnap.docs.map((p) => deleteDoc(p.ref))
    );

    // Delete the event document itself
    await deleteDoc(eventRef);

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 7. loadEventStats
// ---------------------------------------------------------------------------

export async function loadEventStats(
  eventId: string
): Promise<ActionResult<EventStats>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const [eventSnap, participantsSnap] = await Promise.all([
      getDoc(doc(db, "events", eventId)),
      getDocs(collection(db, "events", eventId, "participants")),
    ]);

    if (!eventSnap.exists()) return { success: false, error: "Event not found." };

    const data = eventSnap.data();

    return {
      success: true,
      data: {
        joined: data.joined ?? 0,
        views: data.views ?? 0,
        revenue: data.revenue ?? 0,
        participantCount: participantsSnap.size,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// 8. loadMyEventsSummary
// ---------------------------------------------------------------------------

export async function loadMyEventsSummary(): Promise<
  ActionResult<MyEventsSummary>
> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const today = new Date().toISOString().split("T")[0];

    // Fetch all created events
    const createdSnap = await getDocs(
      query(
        collection(db, "events"),
        where("creatorId", "==", user.uid)
      )
    );

    let totalJoined = 0;
    let totalViews = 0;
    let totalRevenue = 0;
    let upcomingCount = 0;

    createdSnap.docs.forEach((d) => {
      const data = d.data();
      const isoDate = toIso(data.date);
      const status = deriveStatus(data.status ?? "", isoDate);

      totalJoined  += data.joined  ?? 0;
      totalViews   += data.views   ?? 0;
      totalRevenue += data.revenue ?? 0;

      if (status === "upcoming" || status === "live") upcomingCount++;
    });

    // Count joined events from subcollection
    const joinedSnap = await getDocs(
      collection(db, "users", user.uid, "joinedEvents")
    );

    return {
      success: true,
      data: {
        totalCreated: createdSnap.size,
        totalJoined,
        totalViews,
        totalRevenue,
        upcomingCount,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}