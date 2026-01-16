import { useItems } from '@/hooks/useItems';
import { TaskCard } from '@/components/TaskCard';
import { Loader2, AlertCircle, Clock, CalendarDays, Zap } from 'lucide-react';
import { useMemo } from 'react';

export default function FocusPage() {
  const { items, loading, error, markAsDone, updateItem, deleteItem } = useItems();

  const { topPriority, today, overdue, thisWeek, doing } = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const openItems = items.filter(i => i.status !== 'Done');

    return {
      topPriority: openItems
        .filter(i => (i.priority === 'P0' || i.priority === 'P1') && i.status === 'Next')
        .slice(0, 3),
      today: openItems.filter(i => {
        if (!i.due_date) return false;
        const d = new Date(i.due_date);
        return d.toDateString() === now.toDateString();
      }),
      overdue: openItems.filter(i => {
        if (!i.due_date) return false;
        return new Date(i.due_date) < now;
      }),
      thisWeek: openItems.filter(i => {
        if (!i.due_date) return false;
        const d = new Date(i.due_date);
        return d > now && d <= weekEnd;
      }),
      doing: openItems.filter(i => i.status === 'Doing')
    };
  }, [items]);

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

  const Section = ({ title, icon: Icon, items: sectionItems, variant = 'default' }: any) => {
    if (sectionItems.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={`w-5 h-5 ${variant === 'danger' ? 'text-destructive' : 'text-primary'}`} />
          <h2 className="font-semibold">{title}</h2>
          <span className="text-sm text-muted-foreground">({sectionItems.length})</span>
        </div>
        <div className="space-y-2">
          {sectionItems.map((item: any) => (
            <TaskCard
              key={item.id}
              item={item}
              onMarkDone={markAsDone}
              onUpdate={updateItem}
              onDelete={deleteItem}
              compact
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="pb-20 px-4 pt-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Focus</h1>

      <Section title="À faire maintenant" icon={Zap} items={topPriority} />
      <Section title="En retard" icon={AlertCircle} items={overdue} variant="danger" />
      <Section title="Aujourd'hui" icon={Clock} items={today} />
      <Section title="Cette semaine" icon={CalendarDays} items={thisWeek} />
      <Section title="En cours" icon={Loader2} items={doing} />

      {topPriority.length === 0 && today.length === 0 && overdue.length === 0 && doing.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Aucune tâche prioritaire</p>
          <p className="text-sm mt-1">Ajoutez des tâches via Capture</p>
        </div>
      )}
    </div>
  );
}
