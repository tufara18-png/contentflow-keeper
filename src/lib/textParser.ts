import { ItemType, ItemCategory, ItemPriority, ItemStatus, AIOrganizedItem } from '@/types';

// Parse raw text into items (simple mode without AI)
export function parseTextToItems(text: string): Omit<AIOrganizedItem, 'confidence'>[] {
  const lines = text.split('\n').filter(line => line.trim());
  const items: Omit<AIOrganizedItem, 'confidence'>[] = [];

  for (const line of lines) {
    const cleanedTitle = cleanLine(line);
    if (cleanedTitle.length < 2) continue;

    items.push({
      title: cleanedTitle,
      raw_text: line.trim(),
      type: 'Task' as ItemType,
      category: 'Autre' as ItemCategory,
      priority: 'P2' as ItemPriority,
      status: 'Backlog' as ItemStatus,
      due_date: null
    });
  }

  return items;
}

// Clean a line from bullet points, checkboxes, etc.
function cleanLine(line: string): string {
  let cleaned = line.trim();
  
  // Remove leading bullets: •, -, *, etc.
  cleaned = cleaned.replace(/^[•\-\*]\s*/, '');
  
  // Remove checkboxes: [ ], [x], ☐, ✅, ☑
  cleaned = cleaned.replace(/^\[[ x]\]\s*/i, '');
  cleaned = cleaned.replace(/^[☐✅☑]\s*/, '');
  
  // Remove numbering: 1), 1., etc.
  cleaned = cleaned.replace(/^\d+[.)]\s*/, '');
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Detect if text has indentation (for parent-child relationships)
export function hasIndentation(line: string): boolean {
  return line.match(/^[\t ]{2,}/) !== null;
}

// Get parent content for indented items
export function getParentContext(lines: string[], currentIndex: number): string | null {
  const currentLine = lines[currentIndex];
  if (!hasIndentation(currentLine)) return null;

  // Look backwards for non-indented line
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (!hasIndentation(lines[i])) {
      return cleanLine(lines[i]);
    }
  }
  return null;
}
