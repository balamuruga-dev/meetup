// app/actions/settingsActions.ts
//
// ─────────────────────────────────────────────────────────────────────────────
//  All Firebase Firestore + Storage logic for the Settings page.
//  SettingsPage.tsx imports ONLY these functions — no Firebase code in the UI.
// ─────────────────────────────────────────────────────────────────────────────

"use client";
import { getStorage } from "firebase/storage";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  type User,
} from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";

// ─── Shared result type ───────────────────────────────────────────────────────
export interface ActionResult<T = undefined> {
  success: boolean;
  error?:  string;
  data?:   T;
}

// ─── Firestore user profile shape (must match authActions.ts) ────────────────
export interface UserProfile {
  uid:           string;
  firstName:     string;
  lastName:      string;
  email:         string;
  phone:         string;
  username:      string;
  bio:           string;
  dob:           string;
  gender:        string;
  photoURL:      string;
  // Location
  state:         string;
  district:      string;
  area:          string;
  pincode:       string;
  landmark:      string;
  // Interests
  interests:     string[];
  // Notification preferences
  notif: {
    join:        boolean;
    reminder:    boolean;
    update:      boolean;
    email:       boolean;
    sms:         boolean;
  };
  // Privacy
  privacy: {
    publicProfile: boolean;
    showEmail:     boolean;
    showPhone:     boolean;
    showEvents:    boolean;
  };
  // Meta
  provider:      "email" | "google";
  role:          "user";
  createdAt:     unknown;
  updatedAt:     unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
//  1.  LOAD — pull the full profile from Firestore
//      Call this in SettingsPage on mount (useEffect)
// ─────────────────────────────────────────────────────────────────────────────
// app/actions/settingsActions.ts

export async function loadUserProfile(): Promise<ActionResult<UserProfile>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      // New Google user — build profile from their Google account
      const googleProfile = buildProfileFromGoogle(user);
      return { success: true, data: googleProfile };
    }

    // Get the raw data and ensure all fields exist
    const rawData = snap.data() as Partial<UserProfile>;
    
    // Build a complete profile with defaults for missing fields
    const completeProfile: UserProfile = {
      uid: rawData.uid ?? user.uid,
      firstName: rawData.firstName ?? "",
      lastName: rawData.lastName ?? "",
      email: rawData.email ?? user.email ?? "",
      phone: rawData.phone ?? "",
      username: rawData.username ?? "",
      bio: rawData.bio ?? "",
      dob: rawData.dob ?? "",
      gender: rawData.gender ?? "prefer_not",
      photoURL: rawData.photoURL ?? user.photoURL ?? "",
      state: rawData.state ?? "",
      district: rawData.district ?? "",
      area: rawData.area ?? "",
      pincode: rawData.pincode ?? "",
      landmark: rawData.landmark ?? "",
      interests: rawData.interests ?? [],
      // CRITICAL FIX: Ensure notif object exists with defaults
      notif: rawData.notif ?? {
        join: true,
        reminder: true,
        update: true,
        email: false,
        sms: false,
      },
      // CRITICAL FIX: Ensure privacy object exists with defaults
      privacy: rawData.privacy ?? {
        publicProfile: true,
        showEmail: false,
        showPhone: false,
        showEvents: true,
      },
      provider: rawData.provider ?? "email",
      role: rawData.role ?? "user",
      createdAt: rawData.createdAt ?? null,
      updatedAt: rawData.updatedAt ?? null,
    };

    return { success: true, data: completeProfile };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}


// ─── Build a default profile from Google sign-in data ────────────────────────
function buildProfileFromGoogle(user: User): UserProfile {
  const parts     = (user.displayName ?? "").split(" ");
  const firstName = parts[0] ?? "";
  const lastName  = parts.slice(1).join(" ");

  return {
    uid:       user.uid,
    firstName,
    lastName,
    email:     user.email         ?? "",
    phone:     user.phoneNumber   ?? "",
    username:  firstName.toLowerCase().replace(/\s/g, "_") + "_" + user.uid.slice(0, 4),
    bio:       "",
    dob:       "",
    gender:    "prefer_not",
    photoURL:  user.photoURL      ?? "",
    state:     "",
    district:  "",
    area:      "",
    pincode:   "",
    landmark:  "",
    interests: [],
    notif: {
      join:     true,
      reminder: true,
      update:   true,
      email:    false,
      sms:      false,
    },
    privacy: {
      publicProfile: true,
      showEmail:     false,
      showPhone:     false,
      showEvents:    true,
    },
    provider:  "google",
    role:      "user",
    createdAt: null,
    updatedAt: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  2.  SAVE PROFILE — name, bio, dob, gender, phone, email, username
// ─────────────────────────────────────────────────────────────────────────────
export interface SaveProfilePayload {
  firstName: string;
  lastName:  string;
  username:  string;
  bio:       string;
  dob:       string;
  gender:    string;
  phone:     string;
  email:     string;
}

export async function saveProfile(
  payload: SaveProfilePayload
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // 1. Update Firebase Auth displayName
    await updateProfile(user, {
      displayName: `${payload.firstName} ${payload.lastName}`.trim(),
    });

    // 2. Update Firestore document
    await updateDoc(doc(db, "users", user.uid), {
      firstName: payload.firstName,
      lastName:  payload.lastName,
      username:  payload.username,
      bio:       payload.bio,
      dob:       payload.dob,
      gender:    payload.gender,
      phone:     payload.phone,
      email:     payload.email,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  3.  SAVE LOCATION
// ─────────────────────────────────────────────────────────────────────────────
export interface SaveLocationPayload {
  state:    string;
  district: string;
  area:     string;
  pincode:  string;
  landmark: string;
}

export async function saveLocation(
  payload: SaveLocationPayload
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    await updateDoc(doc(db, "users", user.uid), {
      ...payload,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  4.  SAVE INTERESTS
// ─────────────────────────────────────────────────────────────────────────────
export async function saveInterests(
  interests: string[]
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    await updateDoc(doc(db, "users", user.uid), {
      interests,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  5.  SAVE NOTIFICATION PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────
export interface NotifPayload {
  join:     boolean;
  reminder: boolean;
  update:   boolean;
  email:    boolean;
  sms:      boolean;
}

export async function saveNotifPrefs(
  prefs: NotifPayload
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    await updateDoc(doc(db, "users", user.uid), {
      notif:     prefs,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  6.  SAVE PRIVACY SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
export interface PrivacyPayload {
  publicProfile: boolean;
  showEmail:     boolean;
  showPhone:     boolean;
  showEvents:    boolean;
}

export async function savePrivacySettings(
  payload: PrivacyPayload
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    await updateDoc(doc(db, "users", user.uid), {
      privacy:   payload,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  7.  UPLOAD PROFILE PHOTO
//      Uploads to Firebase Storage at:  profile-photos/{uid}/avatar.jpg
//      Returns the public download URL.
// ─────────────────────────────────────────────────────────────────────────────
export async function uploadProfilePhoto(
  file: File
): Promise<ActionResult<string>> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    if (!file.type.startsWith("image/"))
      return { success: false, error: "Please upload an image file." };

    if (file.size > 5 * 1024 * 1024)
      return { success: false, error: "Image must be under 5 MB." };

    // Upload to Firebase Storage
    const storageRef = ref(storage, `profile-photos/${user.uid}/avatar`);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const downloadURL = await getDownloadURL(storageRef);

    // Update Firebase Auth photoURL
    await updateProfile(user, { photoURL: downloadURL });

    // Update Firestore
    await updateDoc(doc(db, "users", user.uid), {
      photoURL:  downloadURL,
      updatedAt: serverTimestamp(),
    });

    return { success: true, data: downloadURL };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  8.  REMOVE PROFILE PHOTO
// ─────────────────────────────────────────────────────────────────────────────
export async function removeProfilePhoto(): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Remove from Storage (best-effort — ignore if not found)
    try {
      const storageRef = ref(storage, `profile-photos/${user.uid}/avatar`);
      await deleteObject(storageRef);
    } catch {
      // File may not exist — that's fine
    }

    // Clear in Auth + Firestore
    await updateProfile(user, { photoURL: "" });
    await updateDoc(doc(db, "users", user.uid), {
      photoURL:  "",
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  9.  CHANGE PASSWORD
//      Requires the current password to re-authenticate first.
// ─────────────────────────────────────────────────────────────────────────────
export async function changePassword(
  currentPassword: string,
  newPassword:     string
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user || !user.email) return { success: false, error: "Not signed in." };

    if (newPassword.length < 8)
      return { success: false, error: "New password must be at least 8 characters." };

    // Re-authenticate so Firebase allows the password change
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);

    // Now update
    await updatePassword(user, newPassword);

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  10. DELETE ACCOUNT (permanent)
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteAccount(
  currentPassword?: string
): Promise<ActionResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not signed in." };

    // Re-authenticate email users
    if (currentPassword && user.email) {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
    }

    // Delete Firestore document (best-effort)
    try {
      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "users", user.uid));
    } catch { /* ignore */ }

    // Delete Auth account
    await deleteUser(user);

    return { success: true };
  } catch (err) {
    return { success: false, error: friendlyError(err) };
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function friendlyError(err: unknown): string {
  const code = (err as { code?: string }).code ?? "";
  const map: Record<string, string> = {
    "auth/wrong-password":         "Current password is incorrect.",
    "auth/too-many-requests":      "Too many attempts. Try again later.",
    "auth/requires-recent-login":  "Please sign out and sign in again before making this change.",
    "auth/email-already-in-use":   "That email is already linked to another account.",
    "auth/invalid-email":          "Please enter a valid email address.",
    "storage/unauthorized":        "Storage permission denied. Check Firebase rules.",
    "storage/quota-exceeded":      "Storage quota exceeded.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}