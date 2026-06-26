import { useState, useEffect } from "react";
import {
  doc, collection, onSnapshot, setDoc, getDoc,
  writeBatch, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase.js";

// ─── Clinic-wide singleton documents ─────────────────────────────────────────
// All state lives in /clinic/plessen/{docId}
// items     → /clinic/plessen/items        { data: [...] }
// payers    → /clinic/plessen/payers       { data: [...] }
// schedules → /clinic/plessen/schedules    { data: {...} }
// settings  → /clinic/plessen/settings     { targetPct: 30 }

const CLINIC_PATH = "clinic/plessen";

function clinicDoc(docId) {
  return doc(db, CLINIC_PATH, docId);
}

// Generic hook: real-time listener for a clinic document that stores { data: T }
export function useClinicData(docId, defaultValue) {
  const [value, setValue]   = useState(defaultValue);
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    const ref = clinicDoc(docId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setValue(d.data ?? defaultValue);
      } else {
        // First run — seed with defaults
        setDoc(ref, { data: defaultValue, updatedAt: serverTimestamp() }).catch(console.error);
        setValue(defaultValue);
      }
      setReady(true);
    }, (err) => {
      console.error(`Firestore ${docId} error:`, err);
      setValue(defaultValue);
      setReady(true);
    });
    return () => unsub();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (newValue) => {
    setValue(newValue);
    try {
      await setDoc(clinicDoc(docId), { data: newValue, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.error(`Firestore write ${docId}:`, err);
    }
  };

  return [value, persist, ready];
}

// ─── Settings hook (flat fields, not nested data) ────────────────────────────
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
      await setDoc(clinicDoc("settings"), { targetPct: pct, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.error("Firestore settings write:", err);
    }
  };

  return [targetPct, setTargetPct, ready];
}
