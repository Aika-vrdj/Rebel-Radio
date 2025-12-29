
import { Broadcast } from "../types";

const STORAGE_KEY = 'rebel_radio_broadcasts';
const QUOTA_KEY = 'rebel_radio_quota';

export interface QuotaData {
  count: number;
  resetAt: number;
}

/**
 * In a real app, you would use:
 * import { createClient } from '@supabase/supabase-js'
 * const supabase = createClient(URL, KEY)
 */

export const saveBroadcast = async (broadcast: Broadcast): Promise<void> => {
  const existing = await getBroadcasts();
  const updated = [broadcast, ...existing];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  
  // Consume quota upon successful save
  const quota = getQuota();
  quota.count += 1;
  localStorage.setItem(QUOTA_KEY, JSON.stringify(quota));
};

export const getBroadcasts = async (): Promise<Broadcast[]> => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const getQuota = (): QuotaData => {
  const data = localStorage.getItem(QUOTA_KEY);
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  if (!data) {
    const newQuota = { count: 0, resetAt: now + oneDay };
    localStorage.setItem(QUOTA_KEY, JSON.stringify(newQuota));
    return newQuota;
  }

  try {
    const quota: QuotaData = JSON.parse(data);
    if (now > quota.resetAt) {
      const refreshedQuota = { count: 0, resetAt: now + oneDay };
      localStorage.setItem(QUOTA_KEY, JSON.stringify(refreshedQuota));
      return refreshedQuota;
    }
    return quota;
  } catch {
    const fallbackQuota = { count: 0, resetAt: now + oneDay };
    localStorage.setItem(QUOTA_KEY, JSON.stringify(fallbackQuota));
    return fallbackQuota;
  }
};
