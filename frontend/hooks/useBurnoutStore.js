"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createRecord,
  deleteRecord as removeRecord,
  getProfile,
  getRecordById,
  getRecords,
  updateProfile as saveProfile,
  updateRecord as saveRecord
} from "@/lib/burnout-api";
import { defaultProfile, defaultRecords, sortRecords } from "@/lib/burnout-data";

const STORE_CHANGE_EVENT = "burnoutsense-store-change";

function emitStoreChange(detail) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORE_CHANGE_EVENT, { detail }));
  }
}

export function useBurnoutStore() {
  const [records, setRecords] = useState(defaultRecords);
  const [profile, setProfile] = useState(defaultProfile);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const initialLoadOptions = { silentUnauthorized: true };
        const [nextRecords, nextProfile] = await Promise.all([
          getRecords(initialLoadOptions),
          getProfile(initialLoadOptions)
        ]);

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

  useEffect(() => {
    function handleStoreChange(event) {
      if (event.detail?.records) {
        setRecords(event.detail.records);
      }

      if (event.detail?.profile) {
        setProfile(event.detail.profile);
      }
    }

    window.addEventListener(STORE_CHANGE_EVENT, handleStoreChange);

    return () => window.removeEventListener(STORE_CHANGE_EVENT, handleStoreChange);
  }, []);

  const addRecord = useCallback(async (record) => {
    try {
      const savedRecord = await createRecord(record);
      const nextRecords = sortRecords([savedRecord, ...records.filter((item) => item.id !== savedRecord.id)]);
      setRecords(nextRecords);
      emitStoreChange({ records: nextRecords });
      setError(null);
      return savedRecord;
    } catch (error) {
      setError("Não foi possível salvar o registro.");
      throw error;
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

  const deleteRecord = useCallback(async (id) => {
    const previousRecords = records;
    const nextRecords = records.filter((record) => record.id !== id);
    setRecords(nextRecords);
    emitStoreChange({ records: nextRecords });

    try {
      await removeRecord(id);
      setError(null);
    } catch (error) {
      setRecords(previousRecords);
      emitStoreChange({ records: previousRecords });
      setError("Não foi possível excluir o registro.");
      throw error;
    }
  }, [records]);

  const updateRecord = useCallback(async (id, record) => {
    const previousRecords = records;

    try {
      const savedRecord = await saveRecord(id, record);
      const nextRecords = sortRecords(records.map((item) => (item.id === id ? savedRecord : item)));
      setRecords(nextRecords);
      emitStoreChange({ records: nextRecords });
      setError(null);
      return savedRecord;
    } catch (error) {
      setRecords(previousRecords);
      emitStoreChange({ records: previousRecords });
      setError("Não foi possível atualizar o registro.");
      throw error;
    }
  }, [records]);

  const updateProfile = useCallback(async (nextProfile) => {
    const previousProfile = profile;
    setProfile(nextProfile);
    emitStoreChange({ profile: nextProfile });

    try {
      const savedProfile = await saveProfile(nextProfile);
      setProfile(savedProfile);
      emitStoreChange({ profile: savedProfile });
      setError(null);
      return savedProfile;
    } catch {
      setProfile(previousProfile);
      emitStoreChange({ profile: previousProfile });
      setError("Não foi possível salvar o perfil.");
      throw new Error("Profile update failed.");
    }
  }, [profile]);

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
    updateRecord,
    updateProfile
  };
}
