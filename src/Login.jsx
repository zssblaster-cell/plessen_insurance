import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase.js";

export default function Login() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [resetSent,setResetSent]= useState(false);
  const [showReset,setShowReset]= useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const msgs = {
        "auth/invalid-credential":     "Incorrect email or password.",
        "auth/user-not-found":         "No account found with that email.",
        "auth/wrong-password":         "Incorrect password.",
        "auth/too-many-requests":      "Too many attempts. Please wait and try again.",
        "auth/user-disabled":          "This account has been disabled.",
        "auth/invalid-email":          "Please enter a valid email address.",
      };
      setError(msgs[err.code] || "Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email above first."); return; }
    setLoading(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err) {
      setError("Could not send reset email. Check the address and try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{
      fontFamily: "'DM Mono', monospace",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0d1e3a 0%, #1e4080 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d1e3a; }
        .login-input {
          width: 100%; padding: 10px 12px; border-radius: 6px;
          border: 1px solid #dce8f4; background: #f8fafd;
          color: #1a2d4a; font-size: 12px; font-family: 'DM Mono', monospace;
          outline: none; transition: border-color .15s;
        }
        .login-input:focus { border-color: #1e4080; background: #fff; }
        .login-btn {
          width: 100%; padding: 11px 0; border-radius: 7px; border: none;
          background: #1e4080; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: 'DM Mono', monospace;
          transition: background .15s; letter-spacing: .03em;
        }
        .login-btn:hover:not(:disabled) { background: #2255a0; }
        .login-btn:disabled { opacity: .55; cursor: not-allowed; }
      `}</style>

      <div style={{
        background: "#fff",
        borderRadius: 14,
        padding: "44px 38px",
        width: 380,
        maxWidth: "92vw",
        boxShadow: "0 24px 64px rgba(0,0,0,.35)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 12,
            background: "linear-gradient(135deg,#1a3a6a,#1e4080)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 4px 16px rgba(30,64,128,.3)",
          }}>
            <span style={{ color: "#fff", fontSize: 26, fontWeight: 700, fontFamily: "'Libre Baskerville', serif" }}>P</span>
          </div>
          <div style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 19, color: "#1a2d4a", marginBottom: 4 }}>
            Plessen Ophthalmology
          </div>
          <div style={{ fontSize: 11, color: "#7a9ab8" }}>Insurance Reimbursement Tracker</div>
        </div>

        {resetSent ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
            <div style={{ fontSize: 13, color: "#1a2d4a", fontWeight: 600, marginBottom: 8 }}>Reset email sent</div>
            <div style={{ fontSize: 11, color: "#7a9ab8", lineHeight: 1.7, marginBottom: 20 }}>
              Check <strong>{email}</strong> for a password reset link.
            </div>
            <button className="login-btn" onClick={() => { setResetSent(false); setShowReset(false); }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 9, color: "#7a9ab8", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 5 }}>
                Email
              </label>
              <input
                className="login-input"
                type="email"
                placeholder="you@plesseneye.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, color: "#7a9ab8", textTransform: "uppercase", letterSpacing: ".06em", display: "block", marginBottom: 5 }}>
                Password
              </label>
              <input
                className="login-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <button
                type="button"
                onClick={handleReset}
                style={{ background: "none", border: "none", color: "#3a6ab0", fontSize: 10, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <div style={{ marginBottom: 14, fontSize: 10, color: "#c0392b", background: "#fef0ee", borderRadius: 5, padding: "8px 12px", border: "1px solid #f5c6c0" }}>
                {error}
              </div>
            )}

            <button className="login-btn" type="submit" disabled={loading || !email || !password}>
              {loading ? "Signing in…" : "Sign In"}
            </button>

            <div style={{ marginTop: 20, fontSize: 9, color: "#c8d8ec", lineHeight: 1.7, textAlign: "center" }}>
              Access restricted to authorized Plessen Ophthalmology staff.<br />
              Contact your administrator if you need access.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
