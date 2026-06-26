import { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";

// ─── Firestore structure ──────────────────────────────────────────────────────
// Collection: "plessen"  (4 chars — valid top-level collection)
// Documents:  "items" | "payers" | "schedules" | "settings"
// Full paths (even segments ✓):
//   plessen/items
//   plessen/payers
//   plessen/schedules
//   plessen/settings

function clinicDoc(docId) {
  // doc(db, collection, document) → 2 segments = valid Firestore document ref
  return doc(db, "plessen", docId);
}

// Real-time listener for a clinic document storing { data: T }
export function useClinicData(docId, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ref = clinicDoc(docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setValue(snap.data().data ?? defaultValue);
        } else {
          // First run — seed the document with defaults
          setDoc(ref, { data: defaultValue, updatedAt: serverTimestamp() }).catch(console.error);
          setValue(defaultValue);
        }
        setReady(true);
      },
      (err) => {
        console.error(`Firestore ${docId} error:`, err);
        setValue(defaultValue);
        setReady(true);
      }
    );
    return () => unsub();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (newValue) => {
    setValue(newValue); // optimistic update
    try {
      await setDoc(
        clinicDoc(docId),
        { data: newValue, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error(`Firestore write ${docId}:`, err);
    }
  };

  return [value, persist, ready];
}

// Settings hook — flat fields (targetPct stored directly, not nested under data)
export function useSettings() {
  const [targetPct, setTargetPctState] = useState(30);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ref = clinicDoc("settings");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setTargetPctState(snap.data().targetPct ?? 30);
      } else {
        setDoc(ref, { targetPct: 30, updatedAt: serverTimestamp() }).catch(console.error);
      }
      setReady(true);
    });
    return () => unsub();
  }, []);

  const setTargetPct = async (pct) => {
    setTargetPctState(pct);
    try {
      await setDoc(
        clinicDoc("settings"),
        { targetPct: pct, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error("Firestore settings write:", err);
    }
  };

  return [targetPct, setTargetPct, ready];
}
