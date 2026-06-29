import { useState, useEffect, useCallback } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase.js";

// Firestore paths (2 segments each — valid):
//   plessen/items
//   plessen/payers
//   plessen/schedules
//   plessen/settings

function clinicDoc(docId) {
  return doc(db, "plessen", docId);
}

// Debounce helper — waits ms after last call before firing
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function useClinicData(docId, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [ready, setReady] = useState(false);

  // Debounced Firestore write — fires 800ms after last change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const writeToFirestore = useCallback(
    debounce(async (newValue) => {
      try {
        await setDoc(
          clinicDoc(docId),
          { data: newValue, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        console.error(`Firestore write ${docId}:`, err);
      }
    }, 800),
    [docId]
  );

  // Real-time listener — seeds document on first run
  useEffect(() => {
    const ref = clinicDoc(docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setValue(snap.data().data ?? defaultValue);
        } else {
          // First run — seed defaults
          setDoc(ref, { data: defaultValue, updatedAt: serverTimestamp() }).catch(console.error);
          setValue(defaultValue);
        }
        setReady(true);
      },
      (err) => {
        console.error(`Firestore ${docId} listener error:`, err);
        setValue(defaultValue);
        setReady(true);
      }
    );
    return () => unsub();
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  // setData: accepts either a new value OR a functional updater (value => newValue)
  // Mirrors React's useState setter signature exactly
  const setData = useCallback((updaterOrValue) => {
    setValue(prev => {
      const next = typeof updaterOrValue === "function"
        ? updaterOrValue(prev)
        : updaterOrValue;
      writeToFirestore(next);
      return next;
    });
  }, [writeToFirestore]);

  return [value, setData, ready];
}

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

  const setTargetPct = useCallback(async (pct) => {
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
  }, []);

  return [targetPct, setTargetPct, ready];
}
