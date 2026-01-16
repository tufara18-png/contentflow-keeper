import { ItemStatus } from '@/types';

const WEEKDAYS: Record<string, number> = {
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  dimanche: 0
};

const DEFAULT_STATUS: ItemStatus = 'Backlog';

interface ParsedTaskInput {
  title: string;
  dueDate: string | null;
  status: ItemStatus;
  createdAt: string;
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getNextWeekday = (date: Date, weekday: number) => {
  const current = startOfDay(date);
  const currentDay = current.getDay();
  let diff = (weekday - currentDay + 7) % 7;
  if (diff === 0) diff = 7;
  return addDays(current, diff);
};

const cleanTitle = (value: string) => value.replace(/\s{2,}/g, ' ').trim();

const stripLeadingPhrases = (value: string) =>
  value.replace(/^(?:a|à)\s+faire\s+/i, '').replace(/^(?:pour|a|à)\s+/i, '');

export function parseTaskInput(text: string, now = new Date()): ParsedTaskInput {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  let dueDate: string | null = null;
  let cleaned = trimmed;

  const patterns: Array<{ regex: RegExp; getDate: (match: RegExpMatchArray) => Date } | null> = [
    {
      regex: /\bdemain\b/i,
      getDate: () => addDays(now, 1)
    },
    {
      regex: /\bce\s+soir\b/i,
      getDate: () => addDays(now, 0)
    },
    {
      regex: /\bdans\s+(\d+)\s+jours?\b/i,
      getDate: (match) => addDays(now, Number(match[1]))
    },
    {
      regex: /\bla\s+semaine\s+prochaine\b/i,
      getDate: () => addDays(now, 7)
    },
    {
      regex: /\b(?:pour\s+|ce\s+)?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i,
      getDate: (match) => getNextWeekday(now, WEEKDAYS[match[1].toLowerCase()])
    }
  ];

  for (const pattern of patterns) {
    if (!pattern) continue;
    const match = lower.match(pattern.regex);
    if (match) {
      dueDate = formatDate(pattern.getDate(match));
      cleaned = cleanTitle(cleaned.replace(pattern.regex, ' '));
      break;
    }
  }

  const finalTitle = cleanTitle(stripLeadingPhrases(cleaned || trimmed));

  return {
    title: finalTitle || trimmed,
    dueDate,
    status: DEFAULT_STATUS,
    createdAt: new Date().toISOString()
  };
}
