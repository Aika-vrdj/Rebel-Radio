
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { Broadcast } from "../types";

/**
 * SQL SCHEMA FOR SUPABASE (Run this in your Supabase SQL Editor):
 * 
 * create table broadcasts (
 *   id text primary key,
 *   title text,
 *   prompt text,
 *   script text,
 *   audioData text,
 *   imageUrl text,
 *   mode text,
 *   createdAt int8
 * );
 * 
 * create table quotas (
 *   id text primary key,
 *   count int4,
 *   resetAt int8
 * );
 * 
 * -- Enable RLS or disable for testing
 * alter table broadcasts enable row level security;
 * create policy "Public Access" on broadcasts for select using (true);
 * create policy "Public Insert" on broadcasts for insert with check (true);
 * 
 * alter table quotas enable row level security;
 * create policy "Public Access" on quotas for select using (true);
 * create policy "Public Upsert" on quotas for upsert with check (true);
 */

const supabaseUrl = 'https://cxgcwtsrzktbmmkcmndg.supabase.co';
const supabaseAnonKey = 'sb_publishable_T24vegMuC2ep_aW4VQH98g_CUcgUI6L';

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

const LOCAL_STORAGE_KEY = 'rebel_radio_broadcasts_fallback';
const LOCAL_QUOTA_KEY = 'rebel_radio_quota_fallback';

// Track if we've detected a missing schema to avoid repeated failed calls
let schemaErrorDetected = false;

export interface QuotaData {
  count: number;
  resetAt: number;
}

const getClientId = () => {
  let id = localStorage.getItem('rebel_radio_client_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('rebel_radio_client_id', id);
  }
  return id;
};

export const isSchemaValid = () => !schemaErrorDetected;

export const saveBroadcast = async (broadcast: Broadcast): Promise<void> => {
  if (supabase && !schemaErrorDetected) {
    try {
      const { error: broadcastError } = await supabase
        .from('broadcasts')
        .insert([{
          id: broadcast.id,
          title: broadcast.title,
          prompt: broadcast.prompt,
          script: broadcast.script,
          audioData: broadcast.audioData,
          imageUrl: broadcast.imageUrl,
          mode: broadcast.mode,
          createdAt: broadcast.createdAt
        }]);

      if (broadcastError) {
        if (broadcastError.code === 'PGRST205') schemaErrorDetected = true;
        console.error("Supabase Save Error:", broadcastError.message);
        throw broadcastError;
      }

      const quota = await getQuota();
      const clientId = getClientId();
      const { error: quotaError } = await supabase
        .from('quotas')
        .upsert({ id: clientId, count: quota.count + 1, resetAt: quota.resetAt });

      if (quotaError) console.error("Quota Update Error:", quotaError.message);
    } catch (e) {
      console.warn("Switching to local storage due to cloud error.");
      saveToLocal(broadcast);
    }
  } else {
    saveToLocal(broadcast);
  }
};

const saveToLocal = (broadcast: Broadcast) => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  const existing = data ? JSON.parse(data) : [];
  const updated = [broadcast, ...existing].slice(0, 10);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  
  const qData = localStorage.getItem(LOCAL_QUOTA_KEY);
  const quota = qData ? JSON.parse(qData) : { count: 0, resetAt: Date.now() + 86400000 };
  localStorage.setItem(LOCAL_QUOTA_KEY, JSON.stringify({ ...quota, count: quota.count + 1 }));
};

export const getBroadcasts = async (): Promise<Broadcast[]> => {
  if (supabase && !schemaErrorDetected) {
    try {
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .order('createdAt', { ascending: false })
        .limit(30);

      if (error) {
        if (error.code === 'PGRST205') {
          console.warn("Broadcasts table not found. Falling back to local storage.");
          schemaErrorDetected = true;
        } else {
          console.error("Fetch Error:", error.message);
        }
        return getFromLocal();
      }
      return (data as Broadcast[]) || [];
    } catch (err) {
      return getFromLocal();
    }
  }
  return getFromLocal();
};

const getFromLocal = (): Broadcast[] => {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const getQuota = async (): Promise<QuotaData> => {
  const now = Date.now();
  const oneDay = 86400000;

  if (supabase && !schemaErrorDetected) {
    try {
      const clientId = getClientId();
      const { data, error } = await supabase
        .from('quotas')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) {
        if (error.code === 'PGRST205') schemaErrorDetected = true;
        return { count: 0, resetAt: now + oneDay };
      }

      const quota: QuotaData = { count: data.count, resetAt: data.resetAt };
      if (now > quota.resetAt) {
        const refreshed = { count: 0, resetAt: now + oneDay };
        supabase.from('quotas').upsert({ id: clientId, ...refreshed }).then();
        return refreshed;
      }
      return quota;
    } catch (err) {
      return getLocalQuota(now, oneDay);
    }
  }
  return getLocalQuota(now, oneDay);
};

const getLocalQuota = (now: number, oneDay: number): QuotaData => {
  const data = localStorage.getItem(LOCAL_QUOTA_KEY);
  if (!data) return { count: 0, resetAt: now + oneDay };
  const quota = JSON.parse(data);
  if (now > quota.resetAt) {
    const refreshed = { count: 0, resetAt: now + oneDay };
    localStorage.setItem(LOCAL_QUOTA_KEY, JSON.stringify(refreshed));
    return refreshed;
  }
  return quota;
};
