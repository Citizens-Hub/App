import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { getSavedEmailLocale, hasSavedEmailLocalePreference, useLocale } from '@/contexts/LocaleContext';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function EmailLocaleSync() {
  const { emailLocale } = useLocale();
  const { user } = useSelector((state: RootState) => state.user);
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user.token) {
      lastSyncedRef.current = null;
      return;
    }

    if (!hasSavedEmailLocalePreference()) {
      return;
    }

    const nextEmailLocale = getSavedEmailLocale();
    const syncKey = `${user.id || 'current'}:${nextEmailLocale}`;
    if (lastSyncedRef.current === syncKey) {
      return;
    }

    lastSyncedRef.current = syncKey;
    void fetch(`${API_BASE_URL}/api/user/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.token}`,
      },
      body: JSON.stringify({
        emailLocale: nextEmailLocale,
      }),
    }).catch((error) => {
      lastSyncedRef.current = null;
      console.warn('Failed to sync email locale preference.', error);
    });
  }, [emailLocale, user.id, user.token]);

  return null;
}
