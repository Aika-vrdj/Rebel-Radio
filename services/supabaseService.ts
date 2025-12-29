
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';
import { Broadcast, BroadcastMode } from "../types";

const supabaseUrl = 'https://cxgcwtsrzktbmmkcmndg.supabase.co';
const supabaseAnonKey = 'sb_publishable_T24vegMuC2ep_aW4VQH98g_CUcgUI6L';

const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

const LOCAL_STORAGE_KEY = 'rebel_radio_broadcasts_fallback_v2';
const LOCAL_QUOTA_KEY = 'rebel_radio_quota_fallback';

let schemaErrorDetected = false;
let lastCallSuccessful = false;

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

export const getCloudStatus = () => {
  if (!supabase) return 'offline';
  if (schemaErrorDetected) return 'schema_error';
  if (lastCallSuccessful) return 'connected';
  return 'connecting';
};

export const saveBroadcast = async (broadcast: Broadcast): Promise<void> => {
  const clientId = getClientId();
  
  if (supabase && !schemaErrorDetected) {
    try {
      // NEW SCHEMA: client_id, content, audio_base64, mode
      const { error: broadcastError } = await supabase
        .from('broadcasts')
        .insert([{
          client_id: clientId,
          content: broadcast.script,
          audio_base64: broadcast.audioData,
          mode: broadcast.mode.toLowerCase()
        }]);

      if (broadcastError) {
        if (broadcastError.code === 'PGRST205') schemaErrorDetected = true;
        throw broadcastError;
      }

      const quota = await getQuota();
      await supabase
        .from('quotas')
        .upsert({ id: clientId, count: quota.count + 1, resetAt: quota.resetAt });
      
      lastCallSuccessful = true;
    } catch (e) {
      console.warn("Cloud save failed, falling back to minimal local storage.");
      saveToLocal(broadcast);
    }
  } else {
    saveToLocal(broadcast);
  }
};

const saveToLocal = (broadcast: Broadcast) => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    const existing = data ? JSON.parse(data) : [];
    // CRITICAL: Limit to 1 item to prevent QuotaExceededError (Base64 PCM is heavy)
    const updated = [broadcast, ...existing].slice(0, 1);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Local storage fallback failed entirely:", e);
    // If it still fails, try to save without audio just for history tracking
    try {
       const minimal = [{...broadcast, audioData: ''}];
       localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(minimal));
    } catch (err) {}
  }
  
  const qData = localStorage.getItem(LOCAL_QUOTA_KEY);
  const quota = qData ? JSON.parse(qData) : { count: 0, resetAt: Date.now() + 86400000 };
  localStorage.setItem(LOCAL_QUOTA_KEY, JSON.stringify({ ...quota, count: quota.count + 1 }));
};

export const getBroadcasts = async (): Promise<Broadcast[]> => {
  if (supabase && !schemaErrorDetected) {
    try {
      // Fetch new schema columns
      const { data, error } = await supabase
        .from('broadcasts')
        .select('id, content, audio_base64, mode, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        if (error.code === 'PGRST205') schemaErrorDetected = true;
        return getFromLocal();
      }
      lastCallSuccessful = true;
      
      // Map back to UI type
      return (data || []).map(row => ({
        id: row.id.toString(),
        title: "Underground Signal",
        prompt: "Transmitted Data",
        script: row.content,
        audioData: row.audio_base_64 || row.audio_base64 || '', // Handle minor naming drift
        imageUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${row.id}`,
        mode: row.mode ? (row.mode.toUpperCase() as BroadcastMode) : BroadcastMode.CREATIVE,
        createdAt: new Date(row.created_at).getTime()
      }));
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

      lastCallSuccessful = true;
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
