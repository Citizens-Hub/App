import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useLocale, type EmailLocale } from '@/contexts/LocaleContext';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

type EmailLocaleSyncTarget = {
  userId: string;
  token: string;
  emailLocale: EmailLocale;
};

export default function EmailLocaleSync() {
  const { emailLocale } = useLocale();
  const { user } = useSelector((state: RootState) => state.user);
  const lastSyncedRef = useRef<string | null>(null);
  const targetRef = useRef<EmailLocaleSyncTarget | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    const flushSyncQueue = async () => {
      if (syncingRef.current) {
        return;
      }

      syncingRef.current = true;
      try {
        while (targetRef.current) {
          const target = targetRef.current;
          const syncKey = `${target.userId}:${target.emailLocale}`;
          if (lastSyncedRef.current === syncKey) {
            break;
          }

          try {
            const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${target.token}`,
              },
              body: JSON.stringify({
                emailLocale: target.emailLocale,
              }),
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            if (targetRef.current === target) {
              lastSyncedRef.current = syncKey;
              break;
            }
          } catch (error) {
            if (targetRef.current === target) {
              lastSyncedRef.current = null;
              console.warn('Failed to sync email locale preference.', error);
              break;
            }
          }
        }
      } finally {
        syncingRef.current = false;

        const target = targetRef.current;
        if (target && lastSyncedRef.current !== `${target.userId}:${target.emailLocale}`) {
          void flushSyncQueue();
        }
      }
    };

    if (!user.token) {
      lastSyncedRef.current = null;
      targetRef.current = null;
      return;
    }

    targetRef.current = {
      userId: user.id || 'current',
      token: user.token,
      emailLocale,
    };
    void flushSyncQueue();
  }, [emailLocale, user.id, user.token]);

  return null;
}
