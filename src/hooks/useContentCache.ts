import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ContentCache } from '@/types';

export function useContentCache() {
  const [content, setContent] = useState<ContentCache[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchContent = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('content_cache')
        .select('*')
        .order('date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      setContent((data || []).map(item => ({
        ...item,
        distribution_channels: Array.isArray(item.distribution_channels) 
          ? item.distribution_channels as string[]
          : [],
        pilier: Array.isArray(item.pilier) ? item.pilier as string[] : [],
        cible: Array.isArray(item.cible) ? item.cible as string[] : [],
        type: Array.isArray(item.type) ? item.type as string[] : []
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch content');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncWithAirtable = useCallback(async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('airtable-sync', {
        body: { action: 'sync' }
      });

      if (error) throw error;
      
      setLastSync(new Date());
      await fetchContent();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync with Airtable');
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [fetchContent]);

  const createContent = async (contentData: Partial<ContentCache>) => {
    try {
      const { data, error } = await supabase.functions.invoke('airtable-sync', {
        body: { action: 'create', data: contentData }
      });

      if (error) throw error;
      await fetchContent();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const updateContent = async (airtableRecordId: string, updates: Partial<ContentCache>) => {
    try {
      const { data, error } = await supabase.functions.invoke('airtable-sync', {
        body: { action: 'update', recordId: airtableRecordId, data: updates }
      });

      if (error) throw error;
      await fetchContent();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const deleteContent = async (airtableRecordId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('airtable-sync', {
        body: { action: 'delete', recordId: airtableRecordId }
      });

      if (error) throw error;
      await fetchContent();
      return data;
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    fetchContent();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('content-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'content_cache' },
        () => {
          fetchContent();
        }
      )
      .subscribe();

    // Set up polling for Airtable sync (every 60 seconds)
    const pollInterval = setInterval(() => {
      syncWithAirtable().catch(console.error);
    }, 60000);

    // Initial sync
    syncWithAirtable().catch(console.error);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [fetchContent, syncWithAirtable]);

  return {
    content,
    loading,
    error,
    lastSync,
    syncing,
    syncWithAirtable,
    createContent,
    updateContent,
    deleteContent,
    refetch: fetchContent
  };
}
