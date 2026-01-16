import { useState, useEffect, useCallback } from 'react';

const PIN_STORAGE_KEY = 'app_pin_verified';

export function usePinGate() {
  const [isVerified, setIsVerified] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already verified in this session
    const stored = sessionStorage.getItem(PIN_STORAGE_KEY);
    if (stored === 'true') {
      setIsVerified(true);
      setLoading(false);
      return;
    }

    // Check if PIN is configured
    checkPinRequired();
  }, []);

  const checkPinRequired = async () => {
    try {
      // We'll check via an edge function if PIN is required
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({ action: 'check' })
      });

      const data = await response.json();
      
      if (data.pinRequired) {
        setPinRequired(true);
      } else {
        setIsVerified(true);
      }
    } catch (err) {
      // If check fails, assume no PIN required
      setIsVerified(true);
    } finally {
      setLoading(false);
    }
  };

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`
        },
        body: JSON.stringify({ action: 'verify', pin })
      });

      const data = await response.json();
      
      if (data.valid) {
        sessionStorage.setItem(PIN_STORAGE_KEY, 'true');
        setIsVerified(true);
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  }, []);

  return {
    isVerified,
    pinRequired,
    loading,
    verifyPin
  };
}
