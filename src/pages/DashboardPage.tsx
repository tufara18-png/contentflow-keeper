import { useMemo } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useItems } from '@/hooks/useItems';
import { QuickAddTaskForm } from '@/components/QuickAddTaskForm';
import { TaskCard } from '@/components/TaskCard';

export default function DashboardPage() {
  const { items, loading, error, markAsDone, updateItem, deleteItem } = useItems();

  const openItems = useMemo(
    () => items.filter((item) => item.status !== 'Done'),
    [items]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive gap-2">
        <AlertCircle className="w-5 h-5" />
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="pb-20 px-4 pt-6 max-w-lg mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Vos tâches sont triées par priorité et date d'échéance.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ajouter une tâche</h2>
        <QuickAddTaskForm />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">À faire</h2>
          <span className="text-sm text-muted-foreground">{openItems.length}</span>
        </div>

        <div className="space-y-2">
          {openItems.map((item) => (
            <TaskCard
              key={item.id}
              item={item}
              onMarkDone={markAsDone}
              onUpdate={updateItem}
              onDelete={deleteItem}
            />
          ))}
        </div>

        {openItems.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>Aucune tâche à faire.</p>
            <p className="text-sm mt-1">Ajoutez une tâche pour démarrer.</p>
          </div>
        )}
      </section>
    </div>
  );
}
