// Item types
export type ItemType = 'Task' | 'Reminder' | 'Question' | 'Note' | 'Waiting';

export type ItemCategory = 
  | 'Site web'
  | 'Publicité'
  | 'Email marketing'
  | 'Création de contenu'
  | 'Réseaux sociaux'
  | 'Lead magnet'
  | 'SEO'
  | 'Branding / Positionnement'
  | 'Analytics / Tracking'
  | 'Partenariats & PR'
  | 'Autre';

export type ItemPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type ItemStatus = 'Next' | 'Backlog' | 'Doing' | 'Done';

export interface Item {
  id: string;
  dump_id?: string | null;
  title: string;
  raw_text?: string | null;
  type: ItemType;
  category: ItemCategory;
  priority: ItemPriority;
  status: ItemStatus;
  due_date?: string | null;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface Dump {
  id: string;
  original_text: string;
  created_at: string;
}

// Airtable content types
export interface ContentCache {
  id: string;
  airtable_record_id: string;
  created_time?: string | null;
  content_topic?: string | null;
  date?: string | null;
  description?: string | null;
  distribution_channels: string[];
  pilier: string[];
  cible: string[];
  status?: string | null;
  todo?: string | null;
  asset?: string | null;
  texte_copy?: string | null;
  script?: string | null;
  type: string[];
  updated_at: string;
}

// AI response types
export interface AIOrganizedItem {
  title: string;
  raw_text: string;
  type: ItemType;
  category: ItemCategory;
  priority: ItemPriority;
  status: ItemStatus;
  due_date: string | null;
  confidence: number;
}

export interface AIOrganizeResponse {
  items: AIOrganizedItem[];
}

// Constants
export const ITEM_TYPES: ItemType[] = ['Task', 'Reminder', 'Question', 'Note', 'Waiting'];

export const ITEM_CATEGORIES: ItemCategory[] = [
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
];

export const ITEM_PRIORITIES: ItemPriority[] = ['P0', 'P1', 'P2', 'P3'];

export const ITEM_STATUSES: ItemStatus[] = ['Next', 'Backlog', 'Doing', 'Done'];

export const DISTRIBUTION_CHANNELS = [
  'Facebook',
  'Instagram',
  'LinkedIn',
  'YouTube',
  'Hubspot',
  'Website',
  'Sales',
  'LinkedIn de Dom'
];

export const PILIERS = [
  'Pilier 1 - Pain',
  'Pilier 2 - Produit',
  'Pilier 3 - Preuve',
  'Expertise',
  'Pilier 4 - Humain'
];

export const CIBLES = ['Client', 'Non client'];

export const CONTENT_STATUSES = ['To do', 'In progess', 'Done'];

export const CONTENT_TYPES = [
  'Blog post',
  'Socials',
  'Website',
  'Email',
  'Lead Magnet',
  'Case Study'
];
