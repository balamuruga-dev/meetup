// app/actions/createEventActions.ts
//
// ─────────────────────────────────────────────────────────────────────────────
//  All Firebase Firestore + Storage logic for the Create Event page.
//  CreateEventPage.tsx imports ONLY these functions — no Firebase in the UI.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";

// ─── Logger utility ───────────────────────────────────────────────────────────
const LOG_PREFIX = "🎯 [createEventActions]";
const logger = {
  info: (...args: any[]) => console.log(LOG_PREFIX, "ℹ️", ...args),
  success: (...args: any[]) => console.log(LOG_PREFIX, "✅", ...args),
  error: (...args: any[]) => console.error(LOG_PREFIX, "❌", ...args),
  warn: (...args: any[]) => console.warn(LOG_PREFIX, "⚠️", ...args),
  debug: (...args: any[]) => console.log(LOG_PREFIX, "🐛", ...args),
  step: (step: string, data?: any) => {
    console.log(LOG_PREFIX, `📌 ${step}`);
    if (data) console.log(LOG_PREFIX, "   Data:", data);
  },
};

// ─── Shared result type ───────────────────────────────────────────────────────
export interface ActionResult<T = undefined> {
  success: boolean;
  error?:  string;
  data?:   T;
}

// ─── Shape of the form data the UI sends in ───────────────────────────────────
export interface CreateEventPayload {
  // Step 1 — Basics
  title:        string;
  category:     string;
  description:  string;
  entryType:    "Free" | "Paid";
  price?:       number | string;   // "" when not set
  maxAttendees?: number | string;  // "" when not set / unlimited

  // Step 2 — Details
  date:         string;   // "YYYY-MM-DD"
  startTime:    string;   // "HH:MM"  (24h)
  endTime?:     string;
  state:        string;
  district:     string;
  area:         string;
  venue:        string;
  landmark?:    string;
  howToAttend?: string;

  // Step 3 — Contact
  contactName:  string;
  contactPhone: string;
  contactEmail: string;
  contactWA?:   string;
  website?:     string;

  // Cover image — passed as a File object from the form
  // Uploaded separately via uploadCoverImage() before createEvent()
  coverImageURL?: string;   // already-uploaded Storage URL (optional)
}

// ─── Shape stored in Firestore /events/{id} ───────────────────────────────────
export interface EventDocument {
  title:        string;
  category:     string;
  description:  string;
  entryType:    "Free" | "Paid";
  price:        number | null;
  maxAttendees: number | null;
  date:         Timestamp;
  startTime:    string;
  endTime:      string;
  state:        string;
  district:     string;
  city:         string;           // = area
  area:         string;
  venue:        string;
  landmark:     string;
  howToAttend:  string;
  contactName:  string;
  contactPhone: string;
  contactEmail: string;
  contactWA:    string;
  website:      string;
  coverImage:   string;           // Storage download URL or ""
  creatorId:    string;
  creatorName:  string;
  creatorPhoto: string;
  status:       "upcoming" | "live" | "past" | "cancelled" | "draft";
  joined:       number;
  views:        number;
  revenue:      number;
  createdAt:    unknown;          // serverTimestamp()
  updatedAt:    unknown;
}

// ─── Helper: convert "YYYY-MM-DD" → Firestore Timestamp ──────────────────────
function dateStringToTimestamp(dateStr: string): Timestamp {
  logger.debug(`Converting date string to Timestamp: ${dateStr}`);
  const d = new Date(dateStr + "T00:00:00");
  const timestamp = Timestamp.fromDate(d);
  logger.debug(`   Result: ${timestamp.toDate().toISOString()}`);
  return timestamp;
}

// ─── Helper: friendly Firestore error messages ────────────────────────────────
function friendlyError(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  const message = (err as { message?: string }).message ?? "";
  
  logger.error(`Error occurred - Code: ${code}, Message: ${message}`);
  
  const map: Record<string, string> = {
    "permission-denied":          "You don't have permission to do that.",
    "storage/unauthorized":       "Storage permission denied. Check Firebase rules.",
    "storage/quota-exceeded":     "Storage quota exceeded.",
    "storage/object-not-found":   "File not found in storage.",
    "unavailable":                "Network unavailable. Please check your connection.",
    "not-found":                  "Document not found.",
    "already-exists":             "Document already exists.",
    "failed-precondition":        "Operation failed due to precondition.",
    "aborted":                    "Operation aborted.",
    "out-of-range":               "Operation out of range.",
    "unimplemented":              "Operation not implemented.",
    "internal":                   "Internal server error.",
    "unauthenticated":            "You must be logged in.",
  };
  
  const friendly = map[code] ?? (err instanceof Error ? err.message : "Something went wrong.");
  logger.warn(`Friendly error message: ${friendly}`);
  return friendly;
}

// ─────────────────────────────────────────────────────────────────────────────
//  1.  UPLOAD COVER IMAGE
//      Call BEFORE createEvent() — returns the download URL.
//      Stored at:  event-covers/{uid}/{timestamp}_{filename}
//
//  Usage in UI:
//    const imgResult = await uploadCoverImage(file);
//    if (imgResult.success) payload.coverImageURL = imgResult.data;
// ─────────────────────────────────────────────────────────────────────────────
export async function uploadCoverImage(
  file: File
): Promise<ActionResult<string>> {
  logger.step("uploadCoverImage - Started");
  logger.debug(`File: ${file.name}, Size: ${file.size} bytes, Type: ${file.type}`);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.error("No authenticated user found");
      return { success: false, error: "Not signed in." };
    }
    logger.success(`User authenticated: ${user.uid} (${user.email})`);

    if (!file.type.startsWith("image/")) {
      logger.error(`Invalid file type: ${file.type}`);
      return { success: false, error: "Please upload a valid image file (JPG, PNG, WebP)." };
    }

    if (file.size > 5 * 1024 * 1024) {
      logger.error(`File too large: ${file.size} bytes (max 5MB)`);
      return { success: false, error: "Cover image must be under 5 MB." };
    }

    // Unique path:  event-covers/{uid}/{timestamp}_{sanitised filename}
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `event-covers/${user.uid}/${Date.now()}_${safeName}`;
    logger.info(`Storage path: ${storagePath}`);
    
    const storageRef  = ref(storage, storagePath);
    
    logger.info("Uploading to Firebase Storage...");
    await uploadBytes(storageRef, file, { contentType: file.type });
    logger.success("Upload completed successfully");
    
    logger.info("Getting download URL...");
    const downloadURL = await getDownloadURL(storageRef);
    logger.success(`Download URL obtained: ${downloadURL.substring(0, 100)}...`);

    return { success: true, data: downloadURL };
  } catch (err) {
    logger.error("Upload failed:", err);
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  2.  CREATE EVENT  (main publish function)
//      Writes a new document to /events/{auto-id}
//      Returns the new event ID on success.
//
//  Usage in UI:
//    const result = await createEvent(payload);
//    if (result.success) router.push(`/events/${result.data}`);
// ─────────────────────────────────────────────────────────────────────────────
export async function createEvent(
  payload: CreateEventPayload
): Promise<ActionResult<string>> {
  logger.step("createEvent - Started");
  logger.debug("Payload received:", payload);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.error("No authenticated user found");
      return { success: false, error: "Not signed in." };
    }
    logger.success(`User authenticated: ${user.uid} (${user.displayName || user.email})`);

    // ── Validate required fields ──────────────────────────────────────────
    logger.info("Validating required fields...");
    
    if (!payload.title?.trim()) {
      logger.error("Missing: title");
      return { success: false, error: "Event title is required." };
    }
    if (!payload.category) {
      logger.error("Missing: category");
      return { success: false, error: "Please select a category." };
    }
    if (!payload.description?.trim()) {
      logger.error("Missing: description");
      return { success: false, error: "Event description is required." };
    }
    if (!payload.date) {
      logger.error("Missing: date");
      return { success: false, error: "Event date is required." };
    }
    if (!payload.startTime) {
      logger.error("Missing: startTime");
      return { success: false, error: "Start time is required." };
    }
    if (!payload.venue?.trim()) {
      logger.error("Missing: venue");
      return { success: false, error: "Venue name is required." };
    }
    if (!payload.contactName?.trim()) {
      logger.error("Missing: contactName");
      return { success: false, error: "Contact name is required." };
    }
    if (!payload.contactPhone?.trim()) {
      logger.error("Missing: contactPhone");
      return { success: false, error: "Contact phone is required." };
    }
    if (!payload.contactEmail?.trim()) {
      logger.error("Missing: contactEmail");
      return { success: false, error: "Contact email is required." };
    }
    if (payload.entryType === "Paid" && !payload.price) {
      logger.error("Missing: price for paid event");
      return { success: false, error: "Please enter a ticket price." };
    }
    
    logger.success("All required fields validated");

    // ── Derive status from date ───────────────────────────────────────────
    const today   = new Date().toISOString().split("T")[0];
    let status: EventDocument["status"];
    
    if (payload.date < today) {
      status = "past";
      logger.info(`Event date (${payload.date}) is in the past → status: past`);
    } else if (payload.date === today) {
      status = "live";
      logger.info(`Event date (${payload.date}) is today → status: live`);
    } else {
      status = "upcoming";
      logger.info(`Event date (${payload.date}) is in future → status: upcoming`);
    }

    // ── Build Firestore document ──────────────────────────────────────────
    logger.info("Building Firestore document...");
    
    const eventData: EventDocument = {
      title:        payload.title.trim(),
      category:     payload.category,
      description:  payload.description.trim(),
      entryType:    payload.entryType,
      price:        payload.entryType === "Paid" && payload.price
                      ? Number(payload.price) : null,
      maxAttendees: payload.maxAttendees ? Number(payload.maxAttendees) : null,
      date:         dateStringToTimestamp(payload.date),
      startTime:    payload.startTime,
      endTime:      payload.endTime   ?? "",
      state:        payload.state,
      district:     payload.district,
      city:         payload.area,        // city = area for query consistency
      area:         payload.area,
      venue:        payload.venue.trim(),
      landmark:     payload.landmark    ?? "",
      howToAttend:  payload.howToAttend ?? "",
      contactName:  payload.contactName.trim(),
      contactPhone: payload.contactPhone.trim(),
      contactEmail: payload.contactEmail.trim(),
      contactWA:    payload.contactWA   ?? "",
      website:      payload.website     ?? "",
      coverImage:   payload.coverImageURL ?? "",
      creatorId:    user.uid,
      creatorName:  user.displayName ?? "",
      creatorPhoto: user.photoURL    ?? "",
      status,
      joined:       0,
      views:        0,
      revenue:      0,
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
    };
    
    logger.debug("Event data prepared:", { ...eventData, coverImage: eventData.coverImage.substring(0, 50) + "..." });

    // ── Write to Firestore ────────────────────────────────────────────────
    logger.info("Creating Firestore document with auto-generated ID...");
    const eventRef = doc(collection(db, "events"));
    logger.debug(`Document reference path: ${eventRef.path}`);
    
    await setDoc(eventRef, eventData);
    logger.success(`Event created successfully with ID: ${eventRef.id}`);

    // ── Update user's eventsCreated count ─────────────────────────────────
    logger.info(`Updating user ${user.uid} eventsCreated count...`);
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const current = userSnap.data().eventsCreated ?? 0;
      logger.debug(`Current eventsCreated: ${current}`);
      await updateDoc(userRef, { eventsCreated: current + 1 });
      logger.success(`Updated eventsCreated to ${current + 1}`);
    } else {
      logger.warn(`User document not found for ${user.uid}, creating...`);
      await setDoc(userRef, { eventsCreated: 1 });
      logger.success(`Created user document with eventsCreated: 1`);
    }

    logger.success(`🎉 Event creation complete! ID: ${eventRef.id}`);
    return { success: true, data: eventRef.id };
  } catch (err) {
    logger.error("createEvent - Fatal error:", err);
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  3.  UPDATE EVENT  (edit an existing event)
//      Only the creator can update their event.
//      Pass only the fields that changed — uses Firestore merge.
//
//  Usage:
//    const result = await updateEvent(eventId, { title: "New Title" });
// ─────────────────────────────────────────────────────────────────────────────
export async function updateEvent(
  eventId: string,
  updates: Partial<CreateEventPayload>
): Promise<ActionResult> {
  logger.step(`updateEvent - Event ID: ${eventId}`);
  logger.debug("Updates:", updates);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.error("No authenticated user found");
      return { success: false, error: "Not signed in." };
    }
    logger.success(`User authenticated: ${user.uid}`);

    // Security: verify creator
    logger.info(`Fetching event ${eventId} to verify ownership...`);
    const eventRef = doc(db, "events", eventId);
    const evSnap = await getDoc(eventRef);
    
    if (!evSnap.exists()) {
      logger.error(`Event ${eventId} not found`);
      return { success: false, error: "Event not found." };
    }
    
    const eventData = evSnap.data();
    if (eventData.creatorId !== user.uid) {
      logger.error(`User ${user.uid} is not creator (creator: ${eventData.creatorId})`);
      return { success: false, error: "You can only edit your own events." };
    }
    logger.success("Ownership verified");

    // Build update payload — only include defined fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { updatedAt: serverTimestamp() };
    let fieldCount = 0;

    if (updates.title) {
      patch.title = updates.title.trim();
      fieldCount++;
      logger.debug(`Updating title: ${patch.title}`);
    }
    if (updates.category) {
      patch.category = updates.category;
      fieldCount++;
      logger.debug(`Updating category: ${patch.category}`);
    }
    if (updates.description) {
      patch.description = updates.description.trim();
      fieldCount++;
      logger.debug(`Updating description (length: ${patch.description.length})`);
    }
    if (updates.entryType) {
      patch.entryType = updates.entryType;
      fieldCount++;
      logger.debug(`Updating entryType: ${patch.entryType}`);
    }
    if (updates.price != null) {
      patch.price = updates.entryType === "Paid" ? Number(updates.price) : null;
      fieldCount++;
      logger.debug(`Updating price: ${patch.price}`);
    }
    if (updates.maxAttendees != null) {
      patch.maxAttendees = updates.maxAttendees ? Number(updates.maxAttendees) : null;
      fieldCount++;
      logger.debug(`Updating maxAttendees: ${patch.maxAttendees}`);
    }
    if (updates.date) {
      patch.date = dateStringToTimestamp(updates.date);
      // Recalculate status when date changes
      const today  = new Date().toISOString().split("T")[0];
      patch.status = updates.date < today ? "past"
                   : updates.date === today ? "live" : "upcoming";
      fieldCount++;
      logger.debug(`Updating date: ${updates.date}, new status: ${patch.status}`);
    }
    if (updates.startTime) {
      patch.startTime = updates.startTime;
      fieldCount++;
      logger.debug(`Updating startTime: ${patch.startTime}`);
    }
    if (updates.endTime) {
      patch.endTime = updates.endTime;
      fieldCount++;
      logger.debug(`Updating endTime: ${patch.endTime}`);
    }
    if (updates.state) {
      patch.state = updates.state;
      fieldCount++;
      logger.debug(`Updating state: ${patch.state}`);
    }
    if (updates.district) {
      patch.district = updates.district;
      fieldCount++;
      logger.debug(`Updating district: ${patch.district}`);
    }
    if (updates.area) {
      patch.area = updates.area;
      patch.city = updates.area;
      fieldCount++;
      logger.debug(`Updating area/city: ${patch.area}`);
    }
    if (updates.venue) {
      patch.venue = updates.venue.trim();
      fieldCount++;
      logger.debug(`Updating venue: ${patch.venue}`);
    }
    if (updates.landmark) {
      patch.landmark = updates.landmark;
      fieldCount++;
      logger.debug(`Updating landmark: ${patch.landmark}`);
    }
    if (updates.howToAttend) {
      patch.howToAttend = updates.howToAttend;
      fieldCount++;
      logger.debug(`Updating howToAttend (length: ${patch.howToAttend.length})`);
    }
    if (updates.contactName) {
      patch.contactName = updates.contactName.trim();
      fieldCount++;
      logger.debug(`Updating contactName: ${patch.contactName}`);
    }
    if (updates.contactPhone) {
      patch.contactPhone = updates.contactPhone.trim();
      fieldCount++;
      logger.debug(`Updating contactPhone: ${patch.contactPhone}`);
    }
    if (updates.contactEmail) {
      patch.contactEmail = updates.contactEmail.trim();
      fieldCount++;
      logger.debug(`Updating contactEmail: ${patch.contactEmail}`);
    }
    if (updates.contactWA) {
      patch.contactWA = updates.contactWA;
      fieldCount++;
      logger.debug(`Updating contactWA: ${patch.contactWA}`);
    }
    if (updates.website) {
      patch.website = updates.website;
      fieldCount++;
      logger.debug(`Updating website: ${patch.website}`);
    }
    if (updates.coverImageURL !== undefined) {
      patch.coverImage = updates.coverImageURL;
      fieldCount++;
      logger.debug(`Updating coverImage (URL length: ${patch.coverImage?.length || 0})`);
    }

    logger.info(`Applying ${fieldCount} field updates to Firestore...`);
    await updateDoc(eventRef, patch);
    logger.success(`Event ${eventId} updated successfully`);
    
    return { success: true };
  } catch (err) {
    logger.error(`updateEvent - Error for event ${eventId}:`, err);
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  4.  UPDATE COVER IMAGE on an existing event
//      Replaces the old cover image in Storage + updates Firestore URL.
// ─────────────────────────────────────────────────────────────────────────────
export async function updateCoverImage(
  eventId: string,
  file:    File
): Promise<ActionResult<string>> {
  logger.step(`updateCoverImage - Event ID: ${eventId}`);
  logger.debug(`New file: ${file.name}, Size: ${file.size} bytes`);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.error("No authenticated user found");
      return { success: false, error: "Not signed in." };
    }
    logger.success(`User authenticated: ${user.uid}`);

    // Upload new image
    logger.info("Uploading new cover image...");
    const uploadResult = await uploadCoverImage(file);
    if (!uploadResult.success || !uploadResult.data) {
      logger.error("Upload failed:", uploadResult.error);
      return uploadResult;
    }
    logger.success(`New image uploaded, URL: ${uploadResult.data.substring(0, 100)}...`);

    // Update Firestore
    logger.info(`Updating Firestore for event ${eventId}...`);
    await updateDoc(doc(db, "events", eventId), {
      coverImage: uploadResult.data,
      updatedAt:  serverTimestamp(),
    });
    logger.success(`Cover image updated successfully for event ${eventId}`);

    return { success: true, data: uploadResult.data };
  } catch (err) {
    logger.error(`updateCoverImage - Error for event ${eventId}:`, err);
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  5.  REMOVE COVER IMAGE from an existing event
// ─────────────────────────────────────────────────────────────────────────────
export async function removeCoverImage(eventId: string): Promise<ActionResult> {
  logger.step(`removeCoverImage - Event ID: ${eventId}`);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.error("No authenticated user found");
      return { success: false, error: "Not signed in." };
    }
    logger.success(`User authenticated: ${user.uid}`);

    // Get current cover URL
    logger.info(`Fetching event ${eventId} to get current cover image...`);
    const eventRef = doc(db, "events", eventId);
    const evSnap = await getDoc(eventRef);
    
    if (!evSnap.exists()) {
      logger.error(`Event ${eventId} not found`);
      return { success: false, error: "Event not found." };
    }

    const currentURL = evSnap.data().coverImage as string;
    logger.debug(`Current cover URL: ${currentURL ? currentURL.substring(0, 100) + "..." : "none"}`);

    // Delete from Storage (best-effort)
    if (currentURL) {
      try {
        logger.info("Deleting image from Storage...");
        const storageRef = ref(storage, currentURL);
        await deleteObject(storageRef);
        logger.success("Storage deletion successful");
      } catch (err) {
        logger.warn("Storage deletion failed (file may already be gone):", err);
      }
    } else {
      logger.info("No cover image to remove");
    }

    // Clear in Firestore
    logger.info("Clearing coverImage field in Firestore...");
    await updateDoc(eventRef, {
      coverImage: "",
      updatedAt:  serverTimestamp(),
    });
    logger.success(`Cover image removed from event ${eventId}`);

    return { success: true };
  } catch (err) {
    logger.error(`removeCoverImage - Error for event ${eventId}:`, err);
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  6.  SAVE DRAFT  (saves event with status "draft" — not visible in explore)
//      Works exactly like createEvent but sets status = "draft"
// ─────────────────────────────────────────────────────────────────────────────
export async function saveDraft(
  payload: Partial<CreateEventPayload>
): Promise<ActionResult<string>> {
  logger.step("saveDraft - Started");
  logger.debug("Payload:", payload);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.error("No authenticated user found");
      return { success: false, error: "Not signed in." };
    }
    logger.success(`User authenticated: ${user.uid}`);

    if (!payload.title?.trim()) {
      logger.error("Missing title for draft");
      return { success: false, error: "Add a title before saving as draft." };
    }
    logger.info(`Saving draft: ${payload.title}`);

    const draftRef = doc(collection(db, "events"));
    logger.debug(`Draft document path: ${draftRef.path}`);
    
    const draftData = {
      ...payload,
      title:        payload.title?.trim() ?? "",
      creatorId:    user.uid,
      creatorName:  user.displayName ?? "",
      creatorPhoto: user.photoURL    ?? "",
      status:       "draft",
      joined:       0,
      views:        0,
      revenue:      0,
      entryType:    payload.entryType ?? "Free",
      price:        payload.price ? Number(payload.price) : null,
      maxAttendees: payload.maxAttendees ? Number(payload.maxAttendees) : null,
      coverImage:   payload.coverImageURL ?? "",
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
    };
    
    await setDoc(draftRef, draftData);
    logger.success(`Draft saved successfully with ID: ${draftRef.id}`);

    return { success: true, data: draftRef.id };
  } catch (err) {
    logger.error("saveDraft - Error:", err);
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  7.  DUPLICATE EVENT  (creates a copy with "upcoming" status + cleared stats)
//      Used in My Events page → "Duplicate" button on past events.
// ─────────────────────────────────────────────────────────────────────────────
export async function duplicateEvent(
  eventId: string
): Promise<ActionResult<string>> {
  logger.step(`duplicateEvent - Original Event ID: ${eventId}`);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      logger.error("No authenticated user found");
      return { success: false, error: "Not signed in." };
    }
    logger.success(`User authenticated: ${user.uid}`);

    logger.info(`Fetching original event ${eventId}...`);
    const evSnap = await getDoc(doc(db, "events", eventId));
    
    if (!evSnap.exists()) {
      logger.error(`Event ${eventId} not found`);
      return { success: false, error: "Event not found." };
    }

    const original = evSnap.data();
    logger.debug(`Original event title: ${original.title}`);

    if (original.creatorId !== user.uid) {
      logger.error(`User ${user.uid} is not creator of original event`);
      return { success: false, error: "You can only duplicate your own events." };
    }
    logger.success("Ownership verified");

    const copyRef = doc(collection(db, "events"));
    const newTitle = `${original.title} (Copy)`;
    logger.info(`Creating duplicate with title: ${newTitle}`);
    
    await setDoc(copyRef, {
      ...original,
      title:     newTitle,
      status:    "upcoming",
      joined:    0,
      views:     0,
      revenue:   0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    logger.success(`Event duplicated successfully! New ID: ${copyRef.id}`);

    return { success: true, data: copyRef.id };
  } catch (err) {
    logger.error(`duplicateEvent - Error for event ${eventId}:`, err);
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  8.  VALIDATE FORM STEP
//      Call from the UI at the end of each wizard step before advancing.
//      Returns an errors object { fieldName: "error message" } or {} if clean.
// ─────────────────────────────────────────────────────────────────────────────
export function validateStep(
  step:    number,
  payload: Partial<CreateEventPayload>
): Record<string, string> {
  logger.step(`validateStep - Step ${step}`);
  logger.debug("Payload being validated:", payload);
  
  const errors: Record<string, string> = {};

  if (step === 1) {
    logger.info("Validating Step 1 (Basics)...");
    
    if (!payload.title?.trim()) {
      errors.title = "Event title is required.";
      logger.debug("❌ Title validation failed");
    } else {
      logger.debug("✅ Title validated");
    }
    
    if (!payload.category) {
      errors.category = "Please select a category.";
      logger.debug("❌ Category validation failed");
    } else {
      logger.debug("✅ Category validated");
    }
    
    if (!payload.description?.trim()) {
      errors.description = "Description is required.";
      logger.debug("❌ Description validation failed");
    } else {
      logger.debug("✅ Description validated");
    }
    
    if (payload.entryType === "Paid" && !payload.price) {
      errors.price = "Enter a ticket price.";
      logger.debug("❌ Price validation failed (paid event)");
    } else if (payload.entryType === "Paid") {
      logger.debug(`✅ Price validated: ${payload.price}`);
    } else {
      logger.debug("✅ Free event, no price needed");
    }
    
    const errorCount = Object.keys(errors).length;
    if (errorCount === 0) {
      logger.success("Step 1 validation passed");
    } else {
      logger.warn(`Step 1 validation failed with ${errorCount} error(s)`);
    }
  }

  if (step === 2) {
    logger.info("Validating Step 2 (Details & Location)...");
    
    if (!payload.date) {
      errors.date = "Date is required.";
      logger.debug("❌ Date validation failed");
    } else {
      logger.debug(`✅ Date validated: ${payload.date}`);
    }
    
    if (!payload.startTime) {
      errors.startTime = "Start time is required.";
      logger.debug("❌ Start time validation failed");
    } else {
      logger.debug(`✅ Start time validated: ${payload.startTime}`);
    }
    
    if (!payload.venue?.trim()) {
      errors.venue = "Venue name is required.";
      logger.debug("❌ Venue validation failed");
    } else {
      logger.debug(`✅ Venue validated: ${payload.venue}`);
    }
    
    if (!payload.state) {
      errors.state = "Please select a state.";
      logger.debug("❌ State validation failed");
    } else {
      logger.debug(`✅ State validated: ${payload.state}`);
    }
    
    if (!payload.district) {
      errors.district = "Please select a district.";
      logger.debug("❌ District validation failed");
    } else {
      logger.debug(`✅ District validated: ${payload.district}`);
    }
    
    if (!payload.area) {
      errors.area = "Please select an area.";
      logger.debug("❌ Area validation failed");
    } else {
      logger.debug(`✅ Area validated: ${payload.area}`);
    }
    
    const errorCount = Object.keys(errors).length;
    if (errorCount === 0) {
      logger.success("Step 2 validation passed");
    } else {
      logger.warn(`Step 2 validation failed with ${errorCount} error(s)`);
    }
  }

  if (step === 3) {
    logger.info("Validating Step 3 (Contact Info)...");
    
    if (!payload.contactName?.trim()) {
      errors.contactName = "Contact name is required.";
      logger.debug("❌ Contact name validation failed");
    } else {
      logger.debug(`✅ Contact name validated: ${payload.contactName}`);
    }
    
    if (!payload.contactPhone?.trim()) {
      errors.contactPhone = "Phone number is required.";
      logger.debug("❌ Phone validation failed");
    } else {
      logger.debug(`✅ Phone validated: ${payload.contactPhone}`);
    }
    
    if (!payload.contactEmail?.trim()) {
      errors.contactEmail = "Email address is required.";
      logger.debug("❌ Email validation failed (missing)");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail)) {
      errors.contactEmail = "Enter a valid email address.";
      logger.debug(`❌ Email validation failed (invalid format): ${payload.contactEmail}`);
    } else {
      logger.debug(`✅ Email validated: ${payload.contactEmail}`);
    }
    
    const errorCount = Object.keys(errors).length;
    if (errorCount === 0) {
      logger.success("Step 3 validation passed");
    } else {
      logger.warn(`Step 3 validation failed with ${errorCount} error(s)`);
    }
  }

  return errors;
}

// Export logger for external debugging if needed
export { logger };