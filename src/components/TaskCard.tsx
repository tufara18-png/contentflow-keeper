import { Item, ItemPriority, ItemStatus } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ITEM_PRIORITIES, ITEM_STATUSES } from '@/types';

interface TaskCardProps {
  item: Item;
  onMarkDone: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Item>) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}

export function TaskCard({ item, onMarkDone, onUpdate, onDelete, compact = false }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== item.title) {
      onUpdate(item.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  const getPriorityClass = (priority: ItemPriority) => {
    switch (priority) {
      case 'P0': return 'priority-p0';
      case 'P1': return 'priority-p1';
      case 'P2': return 'priority-p2';
      case 'P3': return 'priority-p3';
    }
  };

  const getStatusClass = (status: ItemStatus) => {
    switch (status) {
      case 'Next': return 'status-next';
      case 'Doing': return 'status-doing';
      case 'Backlog': return 'status-backlog';
      case 'Done': return 'status-done';
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    
    const diff = Math.floor((dateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return { text: 'En retard', isOverdue: true };
    if (diff === 0) return { text: "Aujourd'hui", isOverdue: false };
    if (diff === 1) return { text: 'Demain', isOverdue: false };
    if (diff <= 7) return { text: `Dans ${diff} jours`, isOverdue: false };
    return { text: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), isOverdue: false };
  };

  const dueInfo = formatDate(item.due_date);

  if (compact) {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors group">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => onMarkDone(item.id)}
        >
          <Check className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{item.title}</p>
        </div>
        <span className={cn('priority-badge text-[10px]', getPriorityClass(item.priority))}>
          {item.priority}
        </span>
      </div>
    );
  }

  return (
    <div className="task-card">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 mt-0.5"
          onClick={() => onMarkDone(item.id)}
        >
          <Check className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setEditTitle(item.title);
                  setIsEditing(false);
                }
              }}
              className="h-8"
              autoFocus
            />
          ) : (
            <p 
              className="font-medium cursor-pointer hover:text-primary transition-colors"
              onClick={() => setIsEditing(true)}
            >
              {item.title}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={cn('priority-badge', getPriorityClass(item.priority))}>
              {item.priority}
            </span>
            <span className={cn('status-badge', getStatusClass(item.status))}>
              {item.status}
            </span>
            <span className="text-xs text-muted-foreground">{item.type}</span>
            {dueInfo && (
              <span className={cn(
                'text-xs',
                dueInfo.isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'
              )}>
                {dueInfo.text}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Select
            value={item.status}
            onValueChange={(value) => onUpdate(item.id, { status: value as ItemStatus })}
          >
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={item.priority}
            onValueChange={(value) => onUpdate(item.id, { priority: value as ItemPriority })}
          >
            <SelectTrigger className="h-8 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priority}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
