"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createRecord, getProfile, getRecordById, getRecords, updateProfile as saveProfile } from "@/lib/burnout-api";
import { defaultProfile, defaultRecords, sortRecords } from "@/lib/burnout-data";

export function useBurnoutStore() {
  const [records, setRecords] = useState(defaultRecords);
  const [profile, setProfile] = useState(defaultProfile);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const [nextRecords, nextProfile] = await Promise.all([getRecords(), getProfile()]);

        if (!active) {
          return;
        }

        setRecords(nextRecords);
        setProfile(nextProfile);
        setError(null);
      } catch {
        if (active) {
          setError("Não foi possível carregar os dados.");
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  const addRecord = useCallback(async (record) => {
    const optimisticRecords = sortRecords([record, ...records]);
    setRecords(optimisticRecords);

    try {
      const savedRecord = await createRecord(record);
      setRecords((current) => sortRecords([savedRecord, ...current.filter((item) => item.id !== record.id)]));
      setError(null);
      return savedRecord;
    } catch {
      setError("Não foi possível salvar o registro.");
      return record;
    }
  }, [records]);

  const findRecord = useCallback(async (id) => {
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

  const updateProfile = useCallback(async (nextProfile) => {
    setProfile(nextProfile);

    try {
      const savedProfile = await saveProfile(nextProfile);
      setProfile(savedProfile);
      setError(null);
      return savedProfile;
    } catch {
      setError("Não foi possível salvar o perfil.");
      return nextProfile;
    }
  }, []);

  const orderedRecords = useMemo(() => sortRecords(records), [records]);

  return {
    addRecord,
    error,
    findRecord,
    latestRecord: orderedRecords[0] ?? null,
    profile,
    ready,
    records: orderedRecords,
    updateProfile
  };
}
