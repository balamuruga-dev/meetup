// app/actions/messagesActions.ts
//
// ─────────────────────────────────────────────────────────────────────────────
//  All Firebase Firestore logic for the Messages & Notifications page.
//  MessagesNotificationsPage.tsx imports ONLY these functions.
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
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// ─── Shared result type ───────────────────────────────────────────────────────
export interface ActionResult<T = undefined> {
  success: boolean;
  error?:  string;
  data?:   T;
}

// ─────────────────────────────────────────────────────────────────────────────
//  DATA SHAPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:        string;
  from:      "me" | "them";          // derived after fetch — "me" if senderId === uid
  senderId:  string;
  text:      string;
  time:      string;                 // "10:42 AM"
  read:      boolean;
  createdAt: Timestamp | null;
}

export interface Conversation {
  id:              string;           // Firestore doc ID
  participantIds:  string[];         // [uid, otherUid]
  otherUserId:     string;
  otherUserName:   string;
  otherUserInitials: string;
  otherUserPhoto:  string;
  otherUserGradient: string;         // fallback gradient when no photo
  eventTitle:      string;           // the event this conversation is about
  eventId:         string;
  lastMessage:     string;
  lastTime:        string;           // "2m" | "1h" | "Yesterday" etc.
  unreadCount:     number;
  online:          boolean;          // always false from DB — set to true client-side if needed
  messages:        ChatMessage[];    // populated when conversation is opened
}

export interface AppNotification {
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
  group:     "Today" | "Yesterday" | "Earlier";
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Timestamp → "10:42 AM" */
function toTimeStr(ts: Timestamp | null): string {
  if (!ts) return "";
  return ts.toDate().toLocaleTimeString("en-IN", {
    hour:   "2-digit",
    minute: "2-digit",
  });
}

/** Timestamp → "2m" | "1h" | "3h" | "Yesterday" | "2 days" */
function toRelativeTime(ts: Timestamp | null): string {
  if (!ts) return "";
  const secs  = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (secs < 60)    return "now";
  if (secs < 3600)  return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 172800) return "Yesterday";
  return `${Math.floor(secs / 86400)} days`;
}

/** Timestamp → "Today" | "Yesterday" | "Earlier" */
function toGroup(ts: Timestamp | null): "Today" | "Yesterday" | "Earlier" {
  if (!ts) return "Earlier";
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (secs < 86400)  return "Today";
  if (secs < 172800) return "Yesterday";
  return "Earlier";
}

/** Stable gradient from a user ID string */
function gradientFromId(id: string): string {
  const gradients = [
    "linear-gradient(135deg,#7F77DD,#D4537E)",
    "linear-gradient(135deg,#1D9E75,#378ADD)",
    "linear-gradient(135deg,#BA7517,#E24B4A)",
    "linear-gradient(135deg,#534AB7,#1D9E75)",
    "linear-gradient(135deg,#D4537E,#BA7517)",
    "linear-gradient(135deg,#0C447C,#7F77DD)",
    "linear-gradient(135deg,#085041,#378ADD)",
  ];
  const index = id.charCodeAt(0) % gradients.length;
  return gradients[index];
}

/** Initials from a display name */
function initials(name: string): string {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// ─── Notification styling helpers ─────────────────────────────────────────────
function notifIconBg(type: string): string {
  const m: Record<string, string> = {
    join:"#EEEDFE", reminder:"#FAEEDA", update:"#E6F1FB",
    cancel:"#FCEBEB", new_event:"#FBEAF0", system:"#E1F5EE",
  };
  return m[type] ?? "#F1EFE8";
}
function notifIconColor(type: string): string {
  const m: Record<string, string> = {
    join:"#534AB7", reminder:"#854F0B", update:"#185FA5",
    cancel:"#A32D2D", new_event:"#72243E", system:"#085041",
  };
  return m[type] ?? "#444441";
}
function notifEmoji(type: string): string {
  const m: Record<string, string> = {
    join:"👤", reminder:"🔔", update:"📍",
    cancel:"❌", new_event:"🎉", system:"✅",
  };
  return m[type] ?? "📢";
}

// ─────────────────────────────────────────────────────────────────────────────
//  FIRESTORE COLLECTION STRUCTURE
//
//  /conversations/{convoId}
//    participantIds: string[]          [uid, otherUid]
//    eventId:        string
//    eventTitle:     string
//    lastMessage:    string
//    lastMessageAt:  Timestamp
//    unreadCounts:   { [uid]: number } e.g. { "uid1": 2, "uid2": 0 }
//    createdAt:      Timestamp
//
//    /messages/{msgId}
//      senderId:  string
//      text:      string
//      read:      boolean
//      createdAt: Timestamp
//
//  /notifications/{notifId}
//    userId:    string
//    type:      string
//    title:     string
//    body:      string
//    read:      boolean
//    eventId?:  string
//    createdAt: Timestamp
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  1.  LOAD ALL CONVERSATIONS
//      Returns a list of conversations the current user is part of,
//      sorted by most recent message first.
//      Messages array starts empty — populated when you open a conversation.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadConversations(): Promise<ActionResult<Conversation[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Query conversations where current user is a participant
    // NOTE: No orderBy — sort client-side to avoid composite index
    const q = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid),
      limit(30)
    );

    const snap = await getDocs(q);

    // Collect all unique "other user" IDs so we can batch-fetch their profiles
    const otherUserIds = new Set<string>();
    snap.docs.forEach(d => {
      const ids = d.data().participantIds as string[];
      ids.forEach(id => { if (id !== user.uid) otherUserIds.add(id); });
    });

    // Batch fetch other users' profiles
    const profileMap = new Map<string, { name: string; photo: string }>();
    await Promise.all(
      Array.from(otherUserIds).map(async uid => {
        try {
          const pSnap = await getDoc(doc(db, "users", uid));
          if (pSnap.exists()) {
            const p = pSnap.data();
            profileMap.set(uid, {
              name:  `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "User",
              photo: p.photoURL ?? "",
            });
          }
        } catch {
          profileMap.set(uid, { name: "User", photo: "" });
        }
      })
    );

    const conversations: Conversation[] = snap.docs.map(d => {
      const data         = d.data();
      const ids          = data.participantIds as string[];
      const otherUid     = ids.find(id => id !== user.uid) ?? "";
      const profile      = profileMap.get(otherUid) ?? { name: "User", photo: "" };
      const unreadCounts = (data.unreadCounts ?? {}) as Record<string, number>;

      return {
        id:                d.id,
        participantIds:    ids,
        otherUserId:       otherUid,
        otherUserName:     profile.name,
        otherUserInitials: initials(profile.name),
        otherUserPhoto:    profile.photo,
        otherUserGradient: gradientFromId(otherUid),
        eventTitle:        data.eventTitle   ?? "",
        eventId:           data.eventId      ?? "",
        lastMessage:       data.lastMessage  ?? "",
        lastTime:          toRelativeTime(data.lastMessageAt ?? null),
        unreadCount:       unreadCounts[user.uid] ?? 0,
        online:            false,
        messages:          [],           // loaded separately when convo is opened
      };
    });

    // Sort by most recent message first (client-side)
    conversations.sort((a, b) => {
      const aTs = (snap.docs.find(d => d.id === a.id)?.data().lastMessageAt as Timestamp)?.toMillis() ?? 0;
      const bTs = (snap.docs.find(d => d.id === b.id)?.data().lastMessageAt as Timestamp)?.toMillis() ?? 0;
      return bTs - aTs;
    });

    return { success: true, data: conversations };
  } catch (err) {
    console.error("[loadConversations]", err);
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  2.  LOAD MESSAGES FOR A CONVERSATION
//      Call when user opens a conversation.
//      Also marks all messages from the other user as read.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadMessages(
  conversationId: string
): Promise<ActionResult<ChatMessage[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Load messages — no orderBy to avoid composite index
    const q = query(
      collection(db, "conversations", conversationId, "messages"),
      limit(50)
    );
    const snap = await getDocs(q);

    const messages: ChatMessage[] = snap.docs
      .map(d => {
        const data = d.data();
        return {
          id:        d.id,
          from:      data.senderId === user.uid ? "me" as const : "them" as const,
          senderId:  data.senderId  ?? "",
          text:      data.text      ?? "",
          time:      toTimeStr(data.createdAt ?? null),
          read:      data.read      ?? false,
          createdAt: data.createdAt ?? null,
        };
      })
      // Sort oldest → newest client-side
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis() ?? 0;
        const bMs = b.createdAt?.toMillis() ?? 0;
        return aMs - bMs;
      });

    // Mark unread messages from the other user as read
    await markConversationRead(conversationId);

    return { success: true, data: messages };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  3.  REAL-TIME MESSAGES LISTENER
//      Keeps the chat window live — new messages appear instantly.
//      Returns an unsubscribe function — call it in useEffect cleanup.
//
//  Usage:
//    useEffect(() => {
//      const unsub = subscribeToMessages(convoId, (msgs) => setMessages(msgs));
//      return () => unsub();
//    }, [convoId]);
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToMessages(
  conversationId: string,
  onUpdate: (messages: ChatMessage[]) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, "conversations", conversationId, "messages"),
    limit(50)
    // No orderBy — sort client-side
  );

  return onSnapshot(q, snap => {
    const messages: ChatMessage[] = snap.docs
      .map(d => {
        const data = d.data();
        return {
          id:        d.id,
          from:      data.senderId === user.uid ? "me" as const : "them" as const,
          senderId:  data.senderId  ?? "",
          text:      data.text      ?? "",
          time:      toTimeStr(data.createdAt ?? null),
          read:      data.read      ?? false,
          createdAt: data.createdAt ?? null,
        };
      })
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis() ?? 0;
        const bMs = b.createdAt?.toMillis() ?? 0;
        return aMs - bMs;
      });

    onUpdate(messages);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  4.  REAL-TIME CONVERSATIONS LISTENER
//      Updates the conversation list live (new messages, unread counts).
//
//  Usage:
//    useEffect(() => {
//      const unsub = subscribeToConversations((convos) => setConversations(convos));
//      return () => unsub();
//    }, []);
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToConversations(
  onUpdate: (conversations: Conversation[]) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, "conversations"),
    where("participantIds", "array-contains", user.uid),
    limit(30)
  );

  return onSnapshot(q, async snap => {
    // Collect other user IDs
    const otherIds = new Set<string>();
    snap.docs.forEach(d => {
      (d.data().participantIds as string[]).forEach(id => {
        if (id !== user.uid) otherIds.add(id);
      });
    });

    // Fetch profiles
    const profileMap = new Map<string, { name: string; photo: string }>();
    await Promise.all(
      Array.from(otherIds).map(async uid => {
        try {
          const pSnap = await getDoc(doc(db, "users", uid));
          if (pSnap.exists()) {
            const p = pSnap.data();
            profileMap.set(uid, {
              name:  `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "User",
              photo: p.photoURL ?? "",
            });
          }
        } catch {
          profileMap.set(uid, { name: "User", photo: "" });
        }
      })
    );

    const conversations: Conversation[] = snap.docs
      .map(d => {
        const data         = d.data();
        const ids          = data.participantIds as string[];
        const otherUid     = ids.find(id => id !== user.uid) ?? "";
        const profile      = profileMap.get(otherUid) ?? { name: "User", photo: "" };
        const unreadCounts = (data.unreadCounts ?? {}) as Record<string, number>;

        return {
          id:                d.id,
          participantIds:    ids,
          otherUserId:       otherUid,
          otherUserName:     profile.name,
          otherUserInitials: initials(profile.name),
          otherUserPhoto:    profile.photo,
          otherUserGradient: gradientFromId(otherUid),
          eventTitle:        data.eventTitle  ?? "",
          eventId:           data.eventId     ?? "",
          lastMessage:       data.lastMessage ?? "",
          lastTime:          toRelativeTime(data.lastMessageAt ?? null),
          unreadCount:       unreadCounts[user.uid] ?? 0,
          online:            false,
          messages:          [],
        };
      })
      .sort((a, b) => {
        const aTs = (snap.docs.find(d => d.id === a.id)?.data().lastMessageAt as Timestamp)?.toMillis() ?? 0;
        const bTs = (snap.docs.find(d => d.id === b.id)?.data().lastMessageAt as Timestamp)?.toMillis() ?? 0;
        return bTs - aTs;
      });

    onUpdate(conversations);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  5.  SEND MESSAGE
//      Writes a new message to /conversations/{id}/messages
//      Updates the conversation's lastMessage + increments other user's unread count
// ─────────────────────────────────────────────────────────────────────────────
export async function sendMessage(
  conversationId: string,
  text:           string
): Promise<ActionResult<ChatMessage>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };
    if (!text.trim()) return { success: false, error: "Message cannot be empty." };

    const now = serverTimestamp();

    // 1. Add the message
    const msgRef = await addDoc(
      collection(db, "conversations", conversationId, "messages"),
      {
        senderId:  user.uid,
        text:      text.trim(),
        read:      false,
        createdAt: now,
      }
    );

    // 2. Get conversation to find the other participant
    const convoSnap = await getDoc(doc(db, "conversations", conversationId));
    if (!convoSnap.exists()) return { success: false, error: "Conversation not found." };

    const convoData    = convoSnap.data();
    const otherUid     = (convoData.participantIds as string[]).find(id => id !== user.uid) ?? "";
    const unreadCounts = (convoData.unreadCounts ?? {}) as Record<string, number>;

    // 3. Update conversation metadata + increment other user's unread count
    await updateDoc(doc(db, "conversations", conversationId), {
      lastMessage:    text.trim(),
      lastMessageAt:  now,
      [`unreadCounts.${otherUid}`]: (unreadCounts[otherUid] ?? 0) + 1,
    });

    return {
      success: true,
      data: {
        id:        msgRef.id,
        from:      "me",
        senderId:  user.uid,
        text:      text.trim(),
        time:      new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" }),
        read:      false,
        createdAt: null,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  6.  START OR GET CONVERSATION
//      Creates a new conversation between current user and another user about
//      a specific event, OR returns the existing one if it already exists.
//
//  Usage (e.g. from event detail page "Message organiser" button):
//    const result = await startConversation(creatorId, eventId, eventTitle);
//    if (result.success) router.push(`/notifications?convo=${result.data}`);
// ─────────────────────────────────────────────────────────────────────────────
export async function startConversation(
  otherUserId: string,
  eventId:     string,
  eventTitle:  string
): Promise<ActionResult<string>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };
    if (otherUserId === user.uid)
      return { success: false, error: "You cannot message yourself." };

    // Check if conversation already exists between these two users for this event
    const q = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid),
      where("eventId", "==", eventId)
    );
    const snap = await getDocs(q);
    const existing = snap.docs.find(d => {
      const ids = d.data().participantIds as string[];
      return ids.includes(otherUserId);
    });

    if (existing) return { success: true, data: existing.id };

    // Create new conversation
    const convoRef = doc(collection(db, "conversations"));
    await setDoc(convoRef, {
      participantIds: [user.uid, otherUserId],
      eventId,
      eventTitle,
      lastMessage:    "",
      lastMessageAt:  serverTimestamp(),
      unreadCounts:   { [user.uid]: 0, [otherUserId]: 0 },
      createdAt:      serverTimestamp(),
    });

    return { success: true, data: convoRef.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  7.  MARK CONVERSATION READ
//      Resets the current user's unread count to 0 for this conversation.
//      Call when the user opens a conversation.
// ─────────────────────────────────────────────────────────────────────────────
export async function markConversationRead(
  conversationId: string
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    await updateDoc(doc(db, "conversations", conversationId), {
      [`unreadCounts.${user.uid}`]: 0,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  8.  DELETE CONVERSATION
//      Deletes the conversation and all its messages.
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteConversation(
  conversationId: string
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Delete all messages in the subcollection first
    const msgsSnap = await getDocs(
      collection(db, "conversations", conversationId, "messages")
    );
    const batch = writeBatch(db);
    msgsSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, "conversations", conversationId));
    await batch.commit();

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  9.  LOAD NOTIFICATIONS
//      Returns all notifications for the current user, grouped by Today /
//      Yesterday / Earlier. Sorted client-side — no composite index needed.
// ─────────────────────────────────────────────────────────────────────────────
export async function loadNotifications(
  filter: "all" | "unread" = "all"
): Promise<ActionResult<AppNotification[]>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Base query — no orderBy to avoid composite index error
    const constraints = [
      where("userId", "==", user.uid),
      limit(30),
    ];

    const snap = await getDocs(
      query(collection(db, "notifications"), ...constraints)
    );

    let notifications: AppNotification[] = snap.docs
      .map(d => {
        const data = d.data();
        return {
          id:        d.id,
          type:      data.type      ?? "system",
          title:     data.title     ?? "",
          body:      data.body      ?? "",
          timeAgo:   toRelativeTime(data.createdAt ?? null),
          read:      data.read      ?? false,
          iconBg:    notifIconBg(data.type),
          iconColor: notifIconColor(data.type),
          emoji:     notifEmoji(data.type),
          eventId:   data.eventId   ?? undefined,
          createdAt: data.createdAt ?? null,
          group:     toGroup(data.createdAt ?? null),
        };
      })
      // Sort newest first client-side
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis() ?? 0;
        const bMs = b.createdAt?.toMillis() ?? 0;
        return bMs - aMs;
      });

    // Apply unread filter client-side
    if (filter === "unread") {
      notifications = notifications.filter(n => !n.read);
    }

    return { success: true, data: notifications };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. REAL-TIME NOTIFICATIONS LISTENER
//      New notifications appear instantly without page refresh.
//
//  Usage:
//    useEffect(() => {
//      const unsub = subscribeToNotifications((notifs) => setNotifications(notifs));
//      return () => unsub();
//    }, []);
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToNotifications(
  onUpdate: (notifications: AppNotification[]) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, "notifications"),
    where("userId", "==", user.uid),
    limit(30)
    // No orderBy — sort client-side
  );

  return onSnapshot(q, snap => {
    const notifications: AppNotification[] = snap.docs
      .map(d => {
        const data = d.data();
        return {
          id:        d.id,
          type:      data.type      ?? "system",
          title:     data.title     ?? "",
          body:      data.body      ?? "",
          timeAgo:   toRelativeTime(data.createdAt ?? null),
          read:      data.read      ?? false,
          iconBg:    notifIconBg(data.type),
          iconColor: notifIconColor(data.type),
          emoji:     notifEmoji(data.type),
          eventId:   data.eventId   ?? undefined,
          createdAt: data.createdAt ?? null,
          group:     toGroup(data.createdAt ?? null),
        };
      })
      .sort((a, b) => {
        const aMs = a.createdAt?.toMillis() ?? 0;
        const bMs = b.createdAt?.toMillis() ?? 0;
        return bMs - aMs;
      });

    onUpdate(notifications);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  11. MARK ONE NOTIFICATION READ
// ─────────────────────────────────────────────────────────────────────────────
export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  try {
    await updateDoc(doc(db, "notifications", notificationId), { read: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  12. MARK ALL NOTIFICATIONS READ
// ─────────────────────────────────────────────────────────────────────────────
export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("userId", "==", user.uid),
        where("read",   "==", false)
      )
    );

    if (snap.empty) return { success: true };

    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  13. DELETE ONE NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteNotification(
  notificationId: string
): Promise<ActionResult> {
  try {
    await deleteDoc(doc(db, "notifications", notificationId));
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  14. GET UNREAD COUNTS  (for badge numbers in the navbar / tab bar)
//      Returns { messages: number, notifications: number }
// ─────────────────────────────────────────────────────────────────────────────
export async function getUnreadCounts(): Promise<
  ActionResult<{ messages: number; notifications: number }>
> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: true, data: { messages: 0, notifications: 0 } };

    const [convoSnap, notifSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "conversations"),
          where("participantIds", "array-contains", user.uid)
        )
      ),
      getDocs(
        query(
          collection(db, "notifications"),
          where("userId", "==", user.uid),
          where("read",   "==", false)
        )
      ),
    ]);

    // Sum unread message counts across all conversations
    const msgUnread = convoSnap.docs.reduce((sum, d) => {
      const counts = (d.data().unreadCounts ?? {}) as Record<string, number>;
      return sum + (counts[user.uid] ?? 0);
    }, 0);

    return {
      success: true,
      data: {
        messages:      msgUnread,
        notifications: notifSnap.size,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  15. REAL-TIME UNREAD COUNT LISTENER  (for the navbar badge)
//
//  Usage in layout or navbar:
//    useEffect(() => {
//      const unsub = subscribeToUnreadCounts(({ messages, notifications }) => {
//        setMsgBadge(messages);
//        setNotifBadge(notifications);
//      });
//      return () => unsub();
//    }, []);
// ─────────────────────────────────────────────────────────────────────────────
export function subscribeToUnreadCounts(
  onUpdate: (counts: { messages: number; notifications: number }) => void
): Unsubscribe {
  const user = auth.currentUser;
  if (!user) return () => {};

  let msgCount   = 0;
  let notifCount = 0;

  // Listen to conversations for message badge
  const unsubConvos = onSnapshot(
    query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", user.uid)
    ),
    snap => {
      msgCount = snap.docs.reduce((sum, d) => {
        const counts = (d.data().unreadCounts ?? {}) as Record<string, number>;
        return sum + (counts[user.uid] ?? 0);
      }, 0);
      onUpdate({ messages: msgCount, notifications: notifCount });
    }
  );

  // Listen to notifications for notification badge
  const unsubNotifs = onSnapshot(
    query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("read",   "==", false)
    ),
    snap => {
      notifCount = snap.size;
      onUpdate({ messages: msgCount, notifications: notifCount });
    }
  );

  // Return a combined unsubscribe
  return () => {
    unsubConvos();
    unsubNotifs();
  };
}