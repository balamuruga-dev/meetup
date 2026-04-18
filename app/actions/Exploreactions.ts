// app/actions/exploreActions.ts
//
// ─────────────────────────────────────────────────────────────────────────────
//  All Firebase Firestore logic for the Explore Events page.
//  ExplorePage.tsx imports ONLY these functions — no Firebase in the UI.
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
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  setDoc,
  deleteDoc,
  Timestamp,
  type QueryConstraint,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// ─── Shared result type ───────────────────────────────────────────────────────
export interface ActionResult<T = undefined> {
  success: boolean;
  error?:  string;
  data?:   T;
}

// ─── Event shape returned to the UI ──────────────────────────────────────────
export interface ExploreEvent {
  id:            string;
  title:         string;
  category:      string;
  categoryColor: string;
  categoryBg:    string;
  date:          string;        // ISO  YYYY-MM-DD
  dateDisplay:   string;        // "Sat 12 Apr"
  time:          string;        // "6:00 PM"
  city:          string;
  state:         string;
  district:      string;
  joined:        number;
  max:           number | null;
  type:          "Free" | "Paid";
  price?:        number;
  status:        "upcoming" | "live" | "past" | "cancelled";
  organizer:     string;
  image:         string;        // emoji
  isFavourite:   boolean;       // true if current user has saved this event
  isJoined:      boolean;       // true if current user already joined
}

// ─── Filter params the UI passes in ──────────────────────────────────────────
export interface ExploreFilters {
  state?:     string;   // "Tamil Nadu" | "All India" | undefined
  district?:  string;   // "Madurai" | "All Districts" | undefined
  city?:      string;   // "Madurai City" | "All Cities" | undefined
  category?:  string;   // "Tech" | "All" | undefined
  entryType?: "Free" | "Paid" | "All";
  dateMode?:  "all" | "today" | "custom";
  startDate?: string;   // ISO  YYYY-MM-DD
  endDate?:   string;   // ISO  YYYY-MM-DD
  search?:    string;   // free-text search
  sortBy?:    "soonest" | "popular" | "newest";
  pageSize?:  number;
}

// ─── Category colour map ──────────────────────────────────────────────────────
const CAT: Record<string, { color: string; bg: string; emoji: string }> = {
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
function toIso(ts: string | Timestamp | null | undefined): string {
  if (!ts) return "";
  if (ts instanceof Timestamp) return ts.toDate().toISOString().split("T")[0];
  return String(ts).split("T")[0];
}

function toDisplay(ts: string | Timestamp | null | undefined): string {
  if (!ts) return "";
  const d = ts instanceof Timestamp ? ts.toDate() : new Date(String(ts));
  return d.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short" });
}

function deriveStatus(stored: string, isoDate: string): ExploreEvent["status"] {
  if (stored === "cancelled") return "cancelled";
  const today = new Date().toISOString().split("T")[0];
  if (isoDate < today)  return "past";
  if (isoDate === today) return "live";
  return "upcoming";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(
  id: string,
  data: Record<string, unknown>,
  savedIds:  Set<string>,
  joinedIds: Set<string>
): ExploreEvent {
  const catKey = String(data.category ?? "").toLowerCase();
  const cfg    = CAT[catKey] ?? { color:"#444441", bg:"#F1EFE8", emoji:"📅" };
  const iso    = toIso((data.date ?? data.eventDate) as string | Timestamp | null);

  return {
    id,
    title:         String(data.title         ?? "Untitled"),
    category:      String(data.category      ?? ""),
    categoryColor: cfg.color,
    categoryBg:    cfg.bg,
    date:          iso,
    dateDisplay:   toDisplay((data.date ?? data.eventDate) as string | Timestamp | null),
    time:          String(data.time ?? data.startTime ?? ""),
    city:          String(data.city ?? data.area ?? ""),
    state:         String(data.state   ?? ""),
    district:      String(data.district ?? ""),
    joined:        Number(data.joined ?? data.joinedCount ?? 0),
    max:           data.maxAttendees != null ? Number(data.maxAttendees) : null,
    type:          (data.entryType ?? data.type ?? "Free") as "Free" | "Paid",
    price:         data.price != null ? Number(data.price) : undefined,
    status:        deriveStatus(String(data.status ?? "upcoming"), iso),
    organizer:     String(data.contactName ?? data.organizer ?? ""),
    image:         cfg.emoji,
    isFavourite:   savedIds.has(id),
    isJoined:      joinedIds.has(id),
  };
}

// ─── Load user's saved & joined event IDs (for isFavourite / isJoined flags) ─
async function getUserEventSets(uid: string): Promise<{
  savedIds:  Set<string>;
  joinedIds: Set<string>;
}> {
  const [savedSnap, joinedSnap] = await Promise.all([
    getDocs(collection(db, "users", uid, "savedEvents")),
    getDocs(collection(db, "users", uid, "joinedEvents")),
  ]);
  return {
    savedIds:  new Set(savedSnap.docs.map(d => d.id)),
    joinedIds: new Set(joinedSnap.docs.map(d => d.id)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  1.  LOAD EXPLORE EVENTS
//      Applies filters, returns paginated results.
//      Client-side sort + text search are applied after Firestore fetch
//      (avoids needing composite indexes for every combination).
// ─────────────────────────────────────────────────────────────────────────────
export async function loadExploreEvents(
  filters: ExploreFilters = {}
): Promise<ActionResult<ExploreEvent[]>> {
  try {
    const user = auth.currentUser;
    const uid  = user?.uid;

    // Fetch user's saved/joined sets in parallel with the events query
    const [{ savedIds, joinedIds }] = await Promise.all([
      uid
        ? getUserEventSets(uid)
        : Promise.resolve({ savedIds: new Set<string>(), joinedIds: new Set<string>() }),
    ]);

    // ── Build Firestore constraints (only what won't need a composite index) ──
    const constraints: QueryConstraint[] = [
      // Always exclude cancelled events from explore
      //where("status", "!=", "cancelled"),
    ];

    // State filter
    const stateVal = filters.state && filters.state !== "All India"
      ? filters.state : null;
    if (stateVal) constraints.push(where("state", "==", stateVal));

    // District filter
    const distVal = filters.district &&
      filters.district !== "All Districts" &&
      filters.district !== "All States"
      ? filters.district : null;
    if (distVal) constraints.push(where("district", "==", distVal));

    // City / area filter
    const cityVal = filters.city && filters.city !== "All Cities"
      ? filters.city : null;
    if (cityVal) constraints.push(where("city", "==", cityVal));

    // Category filter — only add if NOT "All"
    const catVal = filters.category && filters.category !== "All"
      ? filters.category : null;
    if (catVal) constraints.push(where("category", "==", catVal));

    // Entry type filter
    if (filters.entryType && filters.entryType !== "All") {
      constraints.push(where("entryType", "==", filters.entryType));
    }

    // Sort — only simple single-field sorts to avoid composite index requirement
    // NOTE: "status != cancelled" + orderBy requires status index in Firestore.
    // We sort client-side to avoid this.
    constraints.push(limit(filters.pageSize ?? 50));

    const snap = await getDocs(
      query(collection(db, "events"), ...constraints)
    );

    // Map documents
    let events = snap.docs.map(d =>
      mapDoc(d.id, d.data() as Record<string, unknown>, savedIds, joinedIds)
    );

    // ── Client-side filters (cheaper than composite indexes) ──────────────

    // Date filters
    const today = new Date().toISOString().split("T")[0];
    if (filters.dateMode === "today") {
      events = events.filter(e => e.date === today);
    } else if (filters.dateMode === "custom") {
      if (filters.startDate) events = events.filter(e => e.date >= filters.startDate!);
      if (filters.endDate)   events = events.filter(e => e.date <= filters.endDate!);
    }

    // Text search — title, city, state, category, organizer
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      events = events.filter(e =>
        e.title.toLowerCase().includes(q)     ||
        e.city.toLowerCase().includes(q)      ||
        e.state.toLowerCase().includes(q)     ||
        e.category.toLowerCase().includes(q)  ||
        e.organizer.toLowerCase().includes(q)
      );
    }

    // Remove past events from general explore (keep if showing all)
events = events.filter(e => e.status !== "past" && e.status !== "cancelled");

    // Client-side sort
    switch (filters.sortBy ?? "soonest") {
      case "popular": events.sort((a, b) => b.joined - a.joined);          break;
      case "newest":  events.sort((a, b) => b.date.localeCompare(a.date)); break;
      default:        events.sort((a, b) => a.date.localeCompare(b.date)); break; // soonest
    }

    return { success: true, data: events };
  } catch (err) {
    console.error("[loadExploreEvents]", err);
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  2.  GET SINGLE EVENT DETAIL
// ─────────────────────────────────────────────────────────────────────────────
export async function getEventDetail(
  eventId: string
): Promise<ActionResult<ExploreEvent>> {
  try {
    const uid = auth.currentUser?.uid;
    const [evSnap, { savedIds, joinedIds }] = await Promise.all([
      getDoc(doc(db, "events", eventId)),
      uid
        ? getUserEventSets(uid)
        : Promise.resolve({ savedIds: new Set<string>(), joinedIds: new Set<string>() }),
    ]);

    if (!evSnap.exists()) return { success: false, error: "Event not found." };

    return {
      success: true,
      data: mapDoc(evSnap.id, evSnap.data() as Record<string, unknown>, savedIds, joinedIds),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  3.  SAVE EVENT (add to favourites)
//      Writes to:  users/{uid}/savedEvents/{eventId}
// ─────────────────────────────────────────────────────────────────────────────
export async function saveEvent(eventId: string): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Sign in to save events." };

    await setDoc(
      doc(db, "users", user.uid, "savedEvents", eventId),
      { eventId, savedAt: serverTimestamp() }
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  4.  UNSAVE EVENT (remove from favourites)
// ─────────────────────────────────────────────────────────────────────────────
export async function unsaveEvent(eventId: string): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    await deleteDoc(doc(db, "users", user.uid, "savedEvents", eventId));
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  5.  TOGGLE FAVOURITE  (convenience: save or unsave in one call)
//      Returns the new isFavourite state.
// ─────────────────────────────────────────────────────────────────────────────
export async function toggleFavourite(
  eventId:     string,
  currentState: boolean          // pass the current isFavourite value
): Promise<ActionResult<boolean>> {
  const result = currentState
    ? await unsaveEvent(eventId)
    : await saveEvent(eventId);

  // Fixed: Check result.success and return appropriate response
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  return { success: true, data: !currentState };
}

// ─────────────────────────────────────────────────────────────────────────────
//  6.  JOIN EVENT
//      - Adds user to event's participants subcollection
//      - Increments event.joined count atomically
//      - Adds event to user's joinedEvents subcollection
//      - Creates a join notification for the event creator
// ─────────────────────────────────────────────────────────────────────────────
export async function joinEvent(eventId: string): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Sign in to join events." };

    // 1. Check max capacity
    const evSnap = await getDoc(doc(db, "events", eventId));
    if (!evSnap.exists()) return { success: false, error: "Event not found." };

    const evData  = evSnap.data();
    const maxCap  = evData.maxAttendees ?? evData.max ?? null;
    const current = evData.joined       ?? evData.joinedCount ?? 0;

    if (maxCap !== null && current >= maxCap) {
      return { success: false, error: "This event is full." };
    }

    // 2. Add user to participants subcollection
    await setDoc(
      doc(db, "events", eventId, "participants", user.uid),
      {
        uid:       user.uid,
        name:      user.displayName ?? "",
        photoURL:  user.photoURL    ?? "",
        joinedAt:  serverTimestamp(),
      }
    );

    // 3. Increment joined count on the event
    await updateDoc(doc(db, "events", eventId), {
      joined: increment(1),
    });

    // 4. Save to user's joinedEvents
    await setDoc(
      doc(db, "users", user.uid, "joinedEvents", eventId),
      { eventId, joinedAt: serverTimestamp() }
    );

    // 5. Send notification to creator
    const creatorId = evData.creatorId;
    if (creatorId && creatorId !== user.uid) {
      await setDoc(
        doc(collection(db, "notifications")),
        {
          userId:    creatorId,
          type:      "join",
          title:     `${user.displayName ?? "Someone"} joined your event`,
          body:      `${user.displayName ?? "A user"} just joined ${evData.title ?? "your event"}.`,
          eventId,
          read:      false,
          createdAt: serverTimestamp(),
        }
      );
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  7.  LEAVE EVENT
// ─────────────────────────────────────────────────────────────────────────────
export async function leaveEvent(eventId: string): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Remove from participants
    await deleteDoc(doc(db, "events", eventId, "participants", user.uid));

    // Decrement joined count (never go below 0)
    const evSnap = await getDoc(doc(db, "events", eventId));
    if (evSnap.exists()) {
      const current = evSnap.data().joined ?? 0;
      if (current > 0) {
        await updateDoc(doc(db, "events", eventId), {
          joined: increment(-1),
        });
      }
    }

    // Remove from user's joinedEvents
    await deleteDoc(doc(db, "users", user.uid, "joinedEvents", eventId));

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  8.  LOAD USER'S SAVED EVENT IDs
//      Returns a Set<string> — use to initialise the favourites state
// ─────────────────────────────────────────────────────────────────────────────
export async function loadSavedEventIds(): Promise<ActionResult<Set<string>>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: true, data: new Set() };

    const snap = await getDocs(
      collection(db, "users", user.uid, "savedEvents")
    );
    return { success: true, data: new Set(snap.docs.map(d => d.id)) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  9.  LOAD USER'S JOINED EVENT IDs
// ─────────────────────────────────────────────────────────────────────────────
export async function loadJoinedEventIds(): Promise<ActionResult<Set<string>>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: true, data: new Set() };

    const snap = await getDocs(
      collection(db, "users", user.uid, "joinedEvents")
    );
    return { success: true, data: new Set(snap.docs.map(d => d.id)) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. INCREMENT EVENT VIEW COUNT
//      Call when a user clicks "View event" — counts page views.
// ─────────────────────────────────────────────────────────────────────────────
export async function incrementEventView(eventId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "events", eventId), {
      views: increment(1),
    });
  } catch {
    // Non-critical — don't surface view count errors to users
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. REPORT EVENT
//      Writes to:  reports/{eventId}__{uid}
// ─────────────────────────────────────────────────────────────────────────────
export type ReportReason = "spam" | "inappropriate" | "fake" | "other";

export async function reportEvent(
  eventId: string,
  reason:  ReportReason,
  details?: string
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Sign in to report events." };

    await setDoc(
      doc(db, "reports", `${eventId}__${user.uid}`),
      {
        eventId,
        reportedBy: user.uid,
        reason,
        details:    details ?? "",
        createdAt:  serverTimestamp(),
      }
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  12. CHECK AUTH STATE
//      Returns the current user's UID, or null if not signed in.
//      Useful for showing "Sign in to join" prompts.
// ─────────────────────────────────────────────────────────────────────────────
export function getCurrentUserId(): string | null {
  return auth.currentUser?.uid ?? null;
}