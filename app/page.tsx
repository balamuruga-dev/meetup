"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AuthPages from "./(auth)/Authpages/page";
///import Dashboard from "@/components/app/dashboard/dashboard";

// 🔍 Helper to read cookies
const getCookie = (name: string) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift();
};

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const cookie = getCookie("isLoggedIn");

    if (cookie === "true") {
      setIsLoggedIn(true);
      router.push("/dashboard"); // ✅ redirect
    }

    setLoading(false);
  }, []);

  // ⏳ prevent flicker
  if (loading) return null;

  // ❌ Not logged in → show auth page
  if (!isLoggedIn) {
    return <AuthPages />;
  }

  // (optional fallback if redirect not triggered)
  return <AuthPages />;
}