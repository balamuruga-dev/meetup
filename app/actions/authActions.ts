// app/actions/authActions.ts
//
// ─────────────────────────────────────────────────────────────────────────────
//  ALL Firebase Auth logic lives here.
//  The UI (AuthPage.tsx) only imports and calls these functions.
//  Never import firebase directly in your UI components.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  type UserCredential,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// ─── Logger utility ────────────────────────────────────────────────────────
// app/actions/authActions.ts

// ─── Logger utility that bypasses console linting ───────────────────────────
const logger = {
  info: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log("[AUTH INFO]", new Date().toISOString(), ...args);
    }
  },
  error: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.error("[AUTH ERROR]", new Date().toISOString(), ...args);
    }
  },
  warn: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn("[AUTH WARN]", new Date().toISOString(), ...args);
    }
  },
  debug: (...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug("[AUTH DEBUG]", new Date().toISOString(), ...args);
    }
  },
};

// ─── Return type every action returns ────────────────────────────────────────
export interface AuthResult {
  success: boolean;
  error?:  string;       // Human-readable error message
  uid?:    string;       // Firebase UID on success
}

// ─── Firestore user document shape ───────────────────────────────────────────
export interface UserProfile {
  uid:         string;
  firstName:   string;
  lastName:    string;
  email:       string;
  phone:       string;
  interests:   string[];
  state:       string;
  district:    string;
  area:        string;
  photoURL:    string;
  createdAt:   unknown;   // Firestore ServerTimestamp
  updatedAt:   unknown;
  provider:    "email" | "google";
  role:        "user";
  eventsCreated: number;
  eventsJoined:  number;
}

// ─── Helper: map Firebase error codes → friendly messages ────────────────────
function friendlyError(code: string): string {
  const map: Record<string, string> = {
    "auth/email-already-in-use":    "This email is already registered. Try signing in.",
    "auth/invalid-email":           "Please enter a valid email address.",
    "auth/weak-password":           "Password must be at least 6 characters.",
    "auth/user-not-found":          "No account found with this email.",
    "auth/wrong-password":          "Incorrect password. Please try again.",
    "auth/too-many-requests":       "Too many attempts. Please try again later.",
    "auth/network-request-failed":  "Network error. Check your connection.",
    "auth/popup-closed-by-user":    "Google sign-in was cancelled.",
    "auth/cancelled-popup-request": "Google sign-in was cancelled.",
    "auth/invalid-credential":      "Invalid credentials. Please check and try again.",
    "auth/unauthorized-domain":     "This domain is not authorized for Google sign-in. Check Firebase Console → Authentication → Sign-in methods → Authorized domains.",
    "auth/operation-not-allowed":   "Google sign-in is not enabled. Check Firebase Console → Authentication → Sign-in methods.",
    "auth/popup-blocked":           "Popup was blocked by browser. Please allow popups for this site.",
  };
  return map[code] ?? `Something went wrong. Please try again. (${code})`;
}

// ─── Helper: save user profile to Firestore ──────────────────────────────────
async function saveUserToFirestore(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  try {
    logger.debug(`Saving user to Firestore: ${uid}`, data);
    const ref = doc(db, "users", uid);
    await setDoc(
      ref,
      { ...data, updatedAt: serverTimestamp() },
      { merge: true }   // merge:true → won't overwrite existing fields on login
    );
    logger.info(`Successfully saved user ${uid} to Firestore`);
  } catch (error) {
    logger.error(`Failed to save user ${uid} to Firestore:`, error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  1.  SIGN UP WITH EMAIL & PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
export interface SignUpData {
  firstName:  string;
  lastName:   string;
  email:      string;
  password:   string;
  phone?:     string;
  interests?: string[];
  state?:     string;
  district?:  string;
  area?:      string;
}

export async function signUpWithEmail(data: SignUpData): Promise<AuthResult> {
  logger.info("Starting email sign up for:", data.email);
  
  try {
    // 1. Create Firebase Auth user
    logger.debug("Creating Firebase auth user...");
    const credential: UserCredential = await createUserWithEmailAndPassword(
      auth,
      data.email,
      data.password
    );

    const { user } = credential;
    logger.info(`User created successfully with UID: ${user.uid}`);

    // 2. Set displayName on the Auth profile
    logger.debug("Updating display name...");
    await updateProfile(user, {
      displayName: `${data.firstName} ${data.lastName}`.trim(),
    });
    logger.info("Display name updated");

    // 3. Save full profile to Firestore /users/{uid}
    const profile: UserProfile = {
      uid:           user.uid,
      firstName:     data.firstName,
      lastName:      data.lastName,
      email:         data.email,
      phone:         data.phone    ?? "",
      interests:     data.interests ?? [],
      state:         data.state    ?? "",
      district:      data.district ?? "",
      area:          data.area     ?? "",
      photoURL:      user.photoURL ?? "",
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
      provider:      "email",
      role:          "user",
      eventsCreated: 0,
      eventsJoined:  0,
    };

    await saveUserToFirestore(user.uid, profile);

    return { success: true, uid: user.uid };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "";
    const message = (err as { message?: string }).message ?? "";
    logger.error(`Email sign up failed for ${data.email}:`, { code, message, error: err });
    return { success: false, error: friendlyError(code) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  2.  SIGN IN WITH EMAIL & PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
export interface SignInData {
  email:    string;
  password: string;
}

export async function signInWithEmail(data: SignInData): Promise<AuthResult> {
  logger.info("Starting email sign in for:", data.email);
  
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      data.email,
      data.password
    );
    
    logger.info(`User signed in successfully: ${credential.user.uid}`);

    // Update the updatedAt timestamp on each login
    await saveUserToFirestore(credential.user.uid, {
      updatedAt: serverTimestamp(),
    } as Partial<UserProfile>);

    return { success: true, uid: credential.user.uid };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "";
    const message = (err as { message?: string }).message ?? "";
    logger.error(`Email sign in failed for ${data.email}:`, { code, message, error: err });
    return { success: false, error: friendlyError(code) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  3.  SIGN IN / SIGN UP WITH GOOGLE
//      Works for both new and returning users.
// ─────────────────────────────────────────────────────────────────────────────
export async function signInWithGoogle(): Promise<AuthResult> {
  logger.info("Starting Google sign in...");
  
  try {
    // Check Firebase Auth configuration
    logger.debug("Firebase auth instance:", !!auth);
    logger.debug("Current auth state before Google sign in:", {
      currentUser: auth.currentUser?.uid || "none",
      apiKey: auth.config?.apiKey ? "present" : "missing",
      authDomain: auth.config?.authDomain || "missing",
    });
    
    const provider = new GoogleAuthProvider();
    // Ask Google to always show the account picker
    provider.setCustomParameters({ prompt: "select_account" });
    
    logger.debug("Initiating Google popup...");
    const credential = await signInWithPopup(auth, provider);
    const { user } = credential;
    
    logger.info(`Google sign in successful: ${user.email} (${user.uid})`);
    logger.debug("User details:", {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
    });

    // Check if this is a NEW user (no Firestore doc yet)
    logger.debug(`Checking if user ${user.uid} exists in Firestore...`);
    const userRef  = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
      logger.info(`New user ${user.uid}, creating Firestore profile...`);
      
      // First time → create their profile
      const nameParts = (user.displayName ?? "").split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName  = nameParts.slice(1).join(" ");

      logger.debug(`Parsed name: firstName="${firstName}", lastName="${lastName}"`);

      const profile: UserProfile = {
        uid:           user.uid,
        firstName,
        lastName,
        email:         user.email      ?? "",
        phone:         user.phoneNumber ?? "",
        interests:     [],
        state:         "",
        district:      "",
        area:          "",
        photoURL:      user.photoURL   ?? "",
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
        provider:      "google",
        role:          "user",
        eventsCreated: 0,
        eventsJoined:  0,
      };

      await saveUserToFirestore(user.uid, profile);
      logger.info(`New user profile created for ${user.uid}`);
    } else {
      logger.info(`Existing user ${user.uid}, updating timestamp...`);
      const existingData = snapshot.data();
      logger.debug("Existing user data:", existingData);
      
      // Returning user → just update timestamp
      await saveUserToFirestore(user.uid, {
        updatedAt: serverTimestamp(),
      } as Partial<UserProfile>);
      
      logger.info(`Timestamp updated for existing user ${user.uid}`);
    }

    // Verify Firestore data was saved correctly
    logger.debug(`Verifying Firestore data for user ${user.uid}...`);
    const verifySnapshot = await getDoc(userRef);
    if (verifySnapshot.exists()) {
      logger.info(`✅ Firestore verification successful for ${user.uid}`);
    } else {
      logger.warn(`⚠️ Firestore verification failed - no data found for ${user.uid}`);
    }

    return { success: true, uid: user.uid };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "";
    const message = (err as { message?: string }).message ?? "";
    
    // Detailed error logging
    logger.error("Google sign in failed:", {
      code,
      message,
      error: err,
      authState: auth.currentUser ? `User ${auth.currentUser.uid} exists` : "No user",
    });
    
    // Check for specific error conditions
    if (code === "auth/unauthorized-domain") {
      logger.error("Domain not authorized. Check Firebase Console → Authentication → Sign-in methods → Authorized domains");
      logger.error("Current domain:", window.location.origin);
    } else if (code === "auth/operation-not-allowed") {
      logger.error("Google sign-in not enabled. Check Firebase Console → Authentication → Sign-in methods");
    } else if (code === "auth/popup-blocked") {
      logger.error("Popup blocked by browser. Please allow popups for this site.");
    }
    
    return { success: false, error: friendlyError(code) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  4.  FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────────────────────
export async function forgotPassword(email: string): Promise<AuthResult> {
  logger.info("Password reset requested for:", email);
  
  try {
    await sendPasswordResetEmail(auth, email);
    logger.info(`Password reset email sent to ${email}`);
    return { success: true };
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? "";
    const message = (err as { message?: string }).message ?? "";
    logger.error(`Password reset failed for ${email}:`, { code, message, error: err });
    return { success: false, error: friendlyError(code) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  5.  SIGN OUT
// ─────────────────────────────────────────────────────────────────────────────
export async function logOut(): Promise<AuthResult> {
  logger.info("Signing out...");
  
  try {
    const currentUser = auth.currentUser?.uid;
    await signOut(auth);
    logger.info(`User ${currentUser} signed out successfully`);
    return { success: true };
  } catch (error) {
    logger.error("Sign out failed:", error);
    return { success: false, error: "Failed to sign out." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  6.  GET CURRENT USER PROFILE FROM FIRESTORE
// ─────────────────────────────────────────────────────────────────────────────
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  logger.debug(`Fetching user profile for ${uid}`);
  
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) {
      logger.debug(`Profile found for ${uid}`);
      return snap.data() as UserProfile;
    } else {
      logger.warn(`No profile found for ${uid}`);
      return null;
    }
  } catch (error) {
    logger.error(`Failed to fetch profile for ${uid}:`, error);
    return null;
  }
}

// ─── Optional: Add initialization check ────────────────────────────────────
export async function checkFirebaseConfig(): Promise<boolean> {
  logger.info("Checking Firebase configuration...");
  
  const checks = {
    authExists: !!auth,
    apiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  };
  
  logger.info("Firebase config checks:", checks);
  
  const allValid = Object.values(checks).every(v => v === true);
  if (!allValid) {
    logger.error("Firebase configuration is incomplete!", checks);
  }
  
  return allValid;
}