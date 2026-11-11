"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  createRecord,
  deleteRecord as removeRecord,
  getProfile,
  getRecordById,
  getRecords,
  updateProfile as saveProfile
} from "@/lib/burnout-api";
import { defaultProfile, defaultRecords, sortRecords } from "@/lib/burnout-data";
import type { CreateAssessment, Profile } from "@/lib/types";

function useStoreState() {
  const [records, setRecords] = useState(defaultRecords);
  const [profile, setProfile] = useState(defaultProfile);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      const sequence = ++loadSequence.current;
      try {
        const initialLoadOptions = { silentUnauthorized: true };
        const [nextRecords, nextProfile] = await Promise.allSettled([
          getRecords(initialLoadOptions),
          getProfile(initialLoadOptions)
        ]);

        if (!active || sequence !== loadSequence.current) {
          return;
        }

        if (nextRecords.status === "fulfilled") setRecords(nextRecords.value);
        if (nextProfile.status === "fulfilled") setProfile(nextProfile.value);
        setError(nextRecords.status === "rejected" || nextProfile.status === "rejected" ? "Não foi possível carregar todos os dados. Tente novamente." : null);
      } catch {
        if (active && sequence === loadSequence.current) {
          setError("Não foi possível carregar os dados.");
        }
      } finally {
        if (active && sequence === loadSequence.current) {
          setReady(true);
        }
      }
    }

    loadInitialData();
    window.addEventListener("burnoutsense-esbeu-change", loadInitialData);

    return () => {
      active = false;
      window.removeEventListener("burnoutsense-esbeu-change", loadInitialData);
    };
  }, []);

  const addRecord = useCallback(async (record: CreateAssessment) => {
    try {
      const savedRecord = await createRecord(record);
      const nextRecords = sortRecords([savedRecord, ...records.filter((item) => item.id !== savedRecord.id)]);
      setRecords(nextRecords);
      setError(null);
      return savedRecord;
    } catch (error) {
      setError("Não foi possível salvar o registro.");
      throw error;
    }
  }, [records]);

  const findRecord = useCallback(async (id: string) => {
    const localRecord = records.find((record) => record.id === id);

    if (localRecord) {
      return localRecord;
    }

    try {
      return await getRecordById(id);
    } catch {
      setError("Não foi possível carregar o registro.");
      return null;
    }
  }, [records]);

  const deleteRecord = useCallback(async (id: string) => {
    const previousRecords = records;
    const nextRecords = records.filter((record) => record.id !== id);
    setRecords(nextRecords);

    try {
      await removeRecord(id);
      setError(null);
    } catch (error) {
      setRecords(previousRecords);
      setError("Não foi possível excluir o registro.");
      throw error;
    }
  }, [records]);

  const updateProfile = useCallback(async (nextProfile: Profile) => {
    ++loadSequence.current;

    try {
      const savedProfile = await saveProfile(nextProfile);
      setProfile(savedProfile);
      setError(null);
      return savedProfile;
    } catch {
      setError("Não foi possível salvar o perfil.");
      throw new Error("Profile update failed.");
    }
  }, []);

  const orderedRecords = useMemo(() => sortRecords(records), [records]);

  return {
    addRecord,
    deleteRecord,
    error,
    findRecord,
    latestRecord: orderedRecords[0] ?? null,
    profile,
    ready,
    records: orderedRecords,
    updateProfile
  };
}

const BurnoutContext = createContext<ReturnType<typeof useStoreState> | null>(null);

export function BurnoutStoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreState();
  return createElement(BurnoutContext.Provider, { value: store }, children);
}

export function useBurnoutStore() {
  const store = useContext(BurnoutContext);
  if (!store) throw new Error("BurnoutStoreProvider is required.");
  return store;
}
