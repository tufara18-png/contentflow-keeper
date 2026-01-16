import { useContentCache } from '@/hooks/useContentCache';
import { Loader2, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function CalendarPage() {
  const { content, loading, syncing, lastSync, syncWithAirtable } = useContentCache();

  const formatLastSync = () => {
    if (!lastSync) return 'Jamais';
    return format(lastSync, 'HH:mm:ss', { locale: fr });
  };

  if (loading && content.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-20 px-4 pt-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Calendrier</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncWithAirtable()}
          disabled={syncing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Sync
        </Button>
      </div>

      <p className="sync-status mb-6">
        Dernière sync : {formatLastSync()}
      </p>

      <div className="space-y-3">
        {content.map(item => (
          <div key={item.id} className="task-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{item.content_topic || 'Sans titre'}</p>
                {item.date && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {format(new Date(item.date), 'd MMMM yyyy', { locale: fr })}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 mt-2">
                  {item.status && (
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                      {item.status}
                    </span>
                  )}
                  {item.type.map((t, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 bg-muted rounded">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {content.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Aucun contenu</p>
          <p className="text-sm mt-1">Sync avec Airtable pour charger les données</p>
        </div>
      )}
    </div>
  );
}
