-- Create enum types
CREATE TYPE public.item_type AS ENUM ('Task', 'Reminder', 'Question', 'Note', 'Waiting');
CREATE TYPE public.item_category AS ENUM (
  'Site web',
  'Publicité',
  'Email marketing',
  'Création de contenu',
  'Réseaux sociaux',
  'Lead magnet',
  'SEO',
  'Branding / Positionnement',
  'Analytics / Tracking',
  'Partenariats & PR',
  'Autre'
);
CREATE TYPE public.item_priority AS ENUM ('P0', 'P1', 'P2', 'P3');
CREATE TYPE public.item_status AS ENUM ('Next', 'Backlog', 'Doing', 'Done');

-- Create dumps table
CREATE TABLE public.dumps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create items table
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dump_id UUID REFERENCES public.dumps(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  raw_text TEXT,
  type public.item_type NOT NULL DEFAULT 'Task',
  category public.item_category NOT NULL DEFAULT 'Autre',
  priority public.item_priority NOT NULL DEFAULT 'P2',
  status public.item_status NOT NULL DEFAULT 'Backlog',
  due_date DATE,
  confidence NUMERIC(3,2) DEFAULT 0.5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create content_cache table for Airtable sync
CREATE TABLE public.content_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  airtable_record_id TEXT NOT NULL UNIQUE,
  created_time TIMESTAMP WITH TIME ZONE,
  content_topic TEXT,
  date DATE,
  description TEXT,
  distribution_channels JSONB DEFAULT '[]'::jsonb,
  pilier JSONB DEFAULT '[]'::jsonb,
  cible JSONB DEFAULT '[]'::jsonb,
  status TEXT,
  todo TEXT,
  asset TEXT,
  texte_copy TEXT,
  script TEXT,
  type JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_items_updated_at
BEFORE UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_cache_updated_at
BEFORE UPDATE ON public.content_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS (public access for this private app - PIN protected at app level)
ALTER TABLE public.dumps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_cache ENABLE ROW LEVEL SECURITY;

-- Create public access policies (app is PIN protected, not user-authenticated)
CREATE POLICY "Allow public access to dumps" ON public.dumps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to items" ON public.items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to content_cache" ON public.content_cache FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_items_status ON public.items(status);
CREATE INDEX idx_items_priority ON public.items(priority);
CREATE INDEX idx_items_category ON public.items(category);
CREATE INDEX idx_items_due_date ON public.items(due_date);
CREATE INDEX idx_content_cache_airtable_id ON public.content_cache(airtable_record_id);
CREATE INDEX idx_content_cache_date ON public.content_cache(date);

-- Enable realtime for items
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_cache;