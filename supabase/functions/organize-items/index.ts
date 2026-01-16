import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const SYSTEM_PROMPT = `Tu es un assistant spécialisé en organisation de tâches marketing. Tu analyses du texte brut et tu extrais des tâches structurées.

RÈGLES STRICTES:
1. Retourne UNIQUEMENT un JSON valide, sans texte avant ou après
2. Ne jamais inventer de date - utilise null si aucune date n'est mentionnée
3. Si confidence < 0.6, mets status = "Backlog" et priority = "P2"
4. Par défaut: status = "Backlog"
5. Si P0 ou P1 → status = "Next"
6. Si texte contient "en cours", "started", "doing" → status = "Doing"

CATÉGORIES POSSIBLES (utilise exactement ces valeurs):
- "Site web"
- "Publicité"
- "Email marketing"
- "Création de contenu"
- "Réseaux sociaux"
- "Lead magnet"
- "SEO"
- "Branding / Positionnement"
- "Analytics / Tracking"
- "Partenariats & PR"
- "Autre"

FORMAT DE RÉPONSE:
{
  "items": [
    {
      "title": "string court et actionnable",
      "raw_text": "extrait original du texte",
      "type": "Task|Reminder|Question|Note|Waiting",
      "category": "une des catégories ci-dessus",
      "priority": "P0|P1|P2|P3",
      "status": "Next|Backlog|Doing|Done",
      "due_date": "YYYY-MM-DD ou null",
      "confidence": 0.0 à 1.0
    }
  ]
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY is not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Organizing text with AI, length:', text.length);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyse ce texte et extrait les tâches:\n\n${text}` }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required for AI features' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing JSON');

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in organize-items:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
