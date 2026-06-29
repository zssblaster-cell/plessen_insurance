import { useState, useEffect, useCallback, useRef } from "react";
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ENTRIES_PER_CHUNK = 400;
const MAX_BYTES_PER_CHUNK   = 700_000; // 700KB — safely under Firestore 1MB limit

function clinicDoc(docId) {
  return doc(db, "plessen", docId);
}

function chunkDocId(payerName, chunkIdx) {
  return "sched_" + payerName.toLowerCase().replace(/[\s/]+/g, "_") + "_" + chunkIdx;
}

// ─── Chunking helpers ─────────────────────────────────────────────────────────

// Split a payer's schedule object into chunks respecting both limits
function chunkSchedule(payerName, scheduleObj) {
  const entries = Object.entries(scheduleObj);
  const chunks  = [];
  let current   = {};
  let currentBytes = 0;

  for (const [cpt, val] of entries) {
    const entryBytes = JSON.stringify({ [cpt]: val }).length;
    const wouldExceedSize    = currentBytes + entryBytes > MAX_BYTES_PER_CHUNK;
    const wouldExceedEntries = Object.keys(current).length >= MAX_ENTRIES_PER_CHUNK;

    if ((wouldExceedSize || wouldExceedEntries) && Object.keys(current).length > 0) {
      chunks.push(current);
      current      = {};
      currentBytes = 0;
    }

    current[cpt]  = val;
    currentBytes += entryBytes;
  }

  if (Object.keys(current).length > 0) chunks.push(current);
  return chunks;
}

// Stitch chunks back into one schedule object
function stitchChunks(chunkDataArray) {
  const result = {};
  for (const chunk of chunkDataArray) {
    Object.assign(result, chunk);
  }
  return result;
}

// ─── Debounce helper ──────────────────────────────────────────────────────────
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ─── Generic clinic document hook ─────────────────────────────────────────────
export function useClinicData(docId, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [ready, setReady] = useState(false);

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

  useEffect(() => {
    const ref = clinicDoc(docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setValue(snap.data().data ?? defaultValue);
        } else {
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

// ─── Chunked schedules hook ───────────────────────────────────────────────────
// Index doc:  plessen/sched_index  → { "Triple S": ["sched_triple_s_0", ...], ... }
// Chunk docs: plessen/sched_triple_s_0 → { data: { CPT: {rate,units}, ... } }
export function useSchedules(payerNames, initSchedules) {
  const [schedules,    setSchedulesState] = useState(initSchedules);
  const [ready,        setReady]          = useState(false);
  // Keep a ref to the current chunk index so we can do targeted chunk writes
  const chunkIndexRef = useRef({});    // { payerName: ["docId0", "docId1", ...] }
  // Keep a ref to which chunk holds which CPT: { payerName: { CPT: chunkDocId } }
  const cptChunkMapRef = useRef({});

  // ── Load: read index then fetch all chunks ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadSchedules() {
      try {
        // 1. Read the index document
        const idxSnap = await getDoc(clinicDoc("sched_index"));
        let index = idxSnap.exists() ? idxSnap.data() : {};

        // 2. For any payer not in the index, seed from initSchedules
        const seedBatch = writeBatch(db);
        let needsSeed = false;

        for (const payerName of payerNames) {
          if (!index[payerName]) {
            const initData = initSchedules[payerName] || {};
            const chunks   = chunkSchedule(payerName, initData);
            const docIds   = [];

            chunks.forEach((chunk, i) => {
              const docId = chunkDocId(payerName, i);
              docIds.push(docId);
              seedBatch.set(clinicDoc(docId), { data: chunk, updatedAt: serverTimestamp() });
            });

            index[payerName] = docIds;
            needsSeed = true;
          }
        }

        if (needsSeed) {
          // Write index + chunk docs
          seedBatch.set(clinicDoc("sched_index"), { ...index, updatedAt: serverTimestamp() });
          await seedBatch.commit();
        }

        if (cancelled) return;
        chunkIndexRef.current = index;

        // 3. Fetch all chunk documents in parallel
        const merged = {};
        const newCptMap = {};

        await Promise.all(
          payerNames.map(async (payerName) => {
            const docIds = index[payerName] || [];
            const chunkSnaps = await Promise.all(docIds.map(id => getDoc(clinicDoc(id))));
            const chunkDataArray = chunkSnaps.map(s => s.exists() ? (s.data().data || {}) : {});
            merged[payerName] = stitchChunks(chunkDataArray);

            // Build CPT → chunkDocId map for targeted writes
            newCptMap[payerName] = {};
            chunkDataArray.forEach((chunk, i) => {
              Object.keys(chunk).forEach(cpt => {
                newCptMap[payerName][cpt] = docIds[i];
              });
            });
          })
        );

        if (cancelled) return;
        cptChunkMapRef.current = newCptMap;
        setSchedulesState(merged);
        setReady(true);
      } catch (err) {
        console.error("useSchedules load error:", err);
        setSchedulesState(initSchedules);
        setReady(true);
      }
    }

    loadSchedules();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Write: re-chunk and persist the entire payer schedule ──────────────────
  // Used when a full payer schedule is replaced (e.g. after upload)
  const writePayerSchedule = useCallback(async (payerName, payerData) => {
    try {
      const chunks   = chunkSchedule(payerName, payerData);
      const docIds   = chunks.map((_, i) => chunkDocId(payerName, i));
      const batch    = writeBatch(db);

      // Write each chunk
      chunks.forEach((chunk, i) => {
        batch.set(clinicDoc(docIds[i]), { data: chunk, updatedAt: serverTimestamp() });
      });

      // Update index
      const newIndex = { ...chunkIndexRef.current, [payerName]: docIds };
      batch.set(clinicDoc("sched_index"), { ...newIndex, updatedAt: serverTimestamp() });

      await batch.commit();

      // Update refs
      chunkIndexRef.current = newIndex;
      const newCptMap = { ...(cptChunkMapRef.current || {}) };
      newCptMap[payerName] = {};
      chunks.forEach((chunk, i) => {
        Object.keys(chunk).forEach(cpt => { newCptMap[payerName][cpt] = docIds[i]; });
      });
      cptChunkMapRef.current = newCptMap;

      console.log(`✓ ${payerName}: wrote ${chunks.length} chunk(s), ${Object.keys(payerData).length} CPT codes`);
    } catch (err) {
      console.error(`writePayerSchedule ${payerName}:`, err);
    }
  }, []);

  // ── setSchedules: called by the app to update schedules ───────────────────
  const setSchedules = useCallback((updaterOrValue) => {
    setSchedulesState(prev => {
      const next = typeof updaterOrValue === "function"
        ? updaterOrValue(prev)
        : updaterOrValue;

      // Find which payers changed and persist only those
      payerNames.forEach(payerName => {
        if (next[payerName] !== prev[payerName]) {
          writePayerSchedule(payerName, next[payerName] || {});
        }
      });

      return next;
    });
  }, [payerNames, writePayerSchedule]);

  return [schedules, setSchedules, ready];
}

// ─── Settings hook ─────────────────────────────────────────────────────────────
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
