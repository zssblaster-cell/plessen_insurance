import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import Login from "./Login.jsx";
import Tracker from "./Tracker.jsx";

export default function App() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSignOut = () => signOut(auth);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0d1e3a 0%, #1e4080 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Mono', monospace",
      }}>
        <div style={{ textAlign: "center", color: "rgba(255,255,255,.7)" }}>
          <div style={{ fontSize: 28, marginBottom: 10, display: "inline-block", animation: "spin 1.2s linear infinite" }}>⟳</div>
          <div style={{ fontSize: 11 }}>Loading…</div>
        </div>
        <style>{"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}"}</style>
      </div>
    );
  }

  if (!user) return <Login />;

  return <Tracker user={user} onSignOut={handleSignOut} />;
}
