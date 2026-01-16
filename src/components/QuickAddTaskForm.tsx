import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useItems } from '@/hooks/useItems';
import { parseTaskInput } from '@/lib/taskInputParser';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus } from 'lucide-react';
import { Item } from '@/types';

export function QuickAddTaskForm() {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { createItem, deleteItem } = useItems();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!text.trim()) {
      toast({
        title: 'Texte manquant',
        description: 'Ajoutez une tâche avant de valider.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    const parsed = parseTaskInput(text);
    let createdItem: Item | null = null;

    try {
      createdItem = await createItem({
        title: parsed.title,
        raw_text: text.trim(),
        type: 'Task',
        category: 'Autre',
        priority: 'P2',
        status: parsed.status,
        due_date: parsed.dueDate,
        confidence: 1
      });

      const { error } = await supabase.functions.invoke('airtable-tasks', {
        body: {
          action: 'create',
          data: {
            title: parsed.title,
            dueDate: parsed.dueDate,
            status: parsed.status,
            createdAt: parsed.createdAt
          }
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Tâche ajoutée',
        description: parsed.dueDate
          ? `Échéance le ${parsed.dueDate}`
          : 'Aucune date détectée.'
      });

      setText('');
    } catch (error) {
      console.error('Failed to add task:', error);
      toast({
        title: 'Erreur Airtable',
        description: "L'enregistrement dans Airtable a échoué. La tâche n'a pas été conservée.",
        variant: 'destructive'
      });

      if (createdItem?.id) {
        try {
          await deleteItem(createdItem.id);
        } catch (cleanupError) {
          console.error('Failed to cleanup task after Airtable error:', cleanupError);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ajouter une tâche (ex: payer facture demain)"
      />
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Ajout...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4 mr-2" />
            Ajouter la tâche
          </>
        )}
      </Button>
    </form>
  );
}
