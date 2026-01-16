import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Mic, MicOff, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useItems } from '@/hooks/useItems';
import { supabase } from '@/integrations/supabase/client';
import { parseTextToItems } from '@/lib/textParser';
import { AIOrganizedItem, ItemType, ItemCategory, ItemPriority, ItemStatus } from '@/types';

export function CaptureForm() {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [aiOrganize, setAiOrganize] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedItems, setDetectedItems] = useState<number>(0);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();
  const { createItems } = useItems();

  // Estimate number of items from text
  useEffect(() => {
    if (!text.trim()) {
      setDetectedItems(0);
      return;
    }
    const lines = text.split('\n').filter(line => line.trim().length > 1);
    setDetectedItems(lines.length);
  }, [text]);

  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast({
        title: 'Non supporté',
        description: 'La dictée vocale n\'est pas supportée par ce navigateur.',
        variant: 'destructive'
      });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'fr-FR';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText(prev => prev + (prev ? '\n' : '') + transcript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la dictée vocale.',
        variant: 'destructive'
      });
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const handleOrganize = async () => {
    if (!text.trim()) {
      toast({
        title: 'Texte vide',
        description: 'Entrez du texte à organiser.',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);

    try {
      let items: Omit<AIOrganizedItem, 'confidence'>[] | AIOrganizedItem[];

      if (aiOrganize) {
        // Use AI to organize
        const { data, error } = await supabase.functions.invoke('organize-items', {
          body: { text }
        });

        if (error) throw error;

        if (data.error) {
          throw new Error(data.error);
        }

        items = data.items;
      } else {
        // Simple parsing
        items = parseTextToItems(text);
      }

      if (!items || items.length === 0) {
        toast({
          title: 'Aucun élément',
          description: 'Aucun élément n\'a pu être extrait du texte.',
          variant: 'destructive'
        });
        return;
      }

      // Save dump
      const { data: dump } = await supabase
        .from('dumps')
        .insert({ original_text: text })
        .select()
        .single();

      // Create items
      const itemsToCreate = items.map(item => ({
        dump_id: dump?.id || null,
        title: item.title,
        raw_text: item.raw_text,
        type: item.type as ItemType,
        category: item.category as ItemCategory,
        priority: item.priority as ItemPriority,
        status: item.status as ItemStatus,
        due_date: item.due_date,
        confidence: 'confidence' in item ? item.confidence : 0.5
      }));

      await createItems(itemsToCreate);

      toast({
        title: 'Organisé !',
        description: `${items.length} éléments créés avec succès.`
      });

      setText('');
    } catch (error) {
      console.error('Error organizing:', error);
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur lors de l\'organisation.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Drop everything... 
Collez vos notes, listes de tâches, idées.
Ou utilisez le micro pour dicter."
          className="capture-textarea min-h-[250px]"
        />
        
        {isRecording && (
          <div className="absolute top-3 right-3">
            <div className="recording-indicator">
              Recording...
            </div>
          </div>
        )}
      </div>

      {detectedItems > 0 && (
        <p className="text-sm text-muted-foreground">
          ~{detectedItems} élément{detectedItems > 1 ? 's' : ''} détecté{detectedItems > 1 ? 's' : ''}
        </p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Switch
            id="ai-organize"
            checked={aiOrganize}
            onCheckedChange={setAiOrganize}
          />
          <Label htmlFor="ai-organize" className="flex items-center gap-2 cursor-pointer">
            <Sparkles className="w-4 h-4 text-primary" />
            AI organize
          </Label>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={isRecording ? stopRecording : startRecording}
          className={isRecording ? 'bg-destructive/10 text-destructive border-destructive' : ''}
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handleOrganize}
          disabled={!text.trim() || isProcessing}
          className="flex-1"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Organisation...
            </>
          ) : (
            'Organiser'
          )}
        </Button>

        <Button
          variant="outline"
          onClick={() => setText('')}
          disabled={!text || isProcessing}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Add type declaration for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
