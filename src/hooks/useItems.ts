import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Item, ItemStatus, ItemPriority, ItemCategory, ItemType } from '@/types';

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('priority', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setItems((data || []).map(item => ({
        ...item,
        type: item.type as ItemType,
        category: item.category as ItemCategory,
        priority: item.priority as ItemPriority,
        status: item.status as ItemStatus,
        confidence: Number(item.confidence)
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('items-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
        () => {
          fetchItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  const createItem = async (item: Omit<Item, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error } = await supabase
        .from('items')
        .insert([item])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw err;
    }
  };

  const createItems = async (newItems: Omit<Item, 'id' | 'created_at' | 'updated_at'>[]) => {
    try {
      const { data, error } = await supabase
        .from('items')
        .insert(newItems)
        .select();

      if (error) throw error;
      return data;
    } catch (err) {
      throw err;
    }
  };

  const updateItem = async (id: string, updates: Partial<Item>) => {
    try {
      const { data, error } = await supabase
        .from('items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw err;
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      throw err;
    }
  };

  const markAsDone = async (id: string) => {
    return updateItem(id, { status: 'Done' });
  };

  return {
    items,
    loading,
    error,
    createItem,
    createItems,
    updateItem,
    deleteItem,
    markAsDone,
    refetch: fetchItems
  };
}
