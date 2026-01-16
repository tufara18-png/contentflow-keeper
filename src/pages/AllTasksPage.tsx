import { useItems } from '@/hooks/useItems';
import { TaskCard } from '@/components/TaskCard';
import { useState, useMemo } from 'react';
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { ITEM_CATEGORIES, ItemCategory } from '@/types';
import { cn } from '@/lib/utils';

export default function AllTasksPage() {
  const { items, loading, markAsDone, updateItem, deleteItem } = useItems();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(ITEM_CATEGORIES));

  const openItems = useMemo(() => items.filter(i => i.status !== 'Done'), [items]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<ItemCategory, typeof items> = {} as any;
    ITEM_CATEGORIES.forEach(cat => { groups[cat] = []; });
    openItems.forEach(item => { groups[item.category].push(item); });
    return groups;
  }, [openItems]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-20 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">All Tasks</h1>
        <span className="text-sm text-muted-foreground">{openItems.length} ouvertes</span>
      </div>

      <div className="space-y-3">
        {ITEM_CATEGORIES.map(category => {
          const categoryItems = groupedByCategory[category];
          if (categoryItems.length === 0) return null;
          const isExpanded = expandedCategories.has(category);

          return (
            <div key={category}>
              <button
                onClick={() => toggleCategory(category)}
                className="category-header w-full"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="font-medium">{category}</span>
                </div>
                <span className="text-sm text-muted-foreground">{categoryItems.length}</span>
              </button>

              {isExpanded && (
                <div className="mt-2 space-y-2 pl-2">
                  {categoryItems.map(item => (
                    <TaskCard
                      key={item.id}
                      item={item}
                      onMarkDone={markAsDone}
                      onUpdate={updateItem}
                      onDelete={deleteItem}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openItems.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Aucune tâche</p>
        </div>
      )}
    </div>
  );
}
