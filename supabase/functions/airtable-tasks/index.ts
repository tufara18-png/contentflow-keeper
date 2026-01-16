import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AIRTABLE_API_TOKEN = Deno.env.get('AIRTABLE_API_TOKEN');
const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
const AIRTABLE_TASKS_TABLE_NAME = Deno.env.get('AIRTABLE_TASKS_TABLE_NAME');

function getAirtableUrl(recordId?: string): string {
  const encodedTableName = encodeURIComponent(AIRTABLE_TASKS_TABLE_NAME || '');
  const base = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTableName}`;
  return recordId ? `${base}/${recordId}` : base;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TASKS_TABLE_NAME) {
    return new Response(
      JSON.stringify({ error: 'Airtable task configuration is missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { action, data } = await req.json();

    if (action !== 'create') {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch(getAirtableUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          title: data?.title ?? null,
          dueDate: data?.dueDate ?? null,
          status: data?.status ?? null,
          createdAt: data?.createdAt ?? null,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable create error: ${errorText}`);
    }

    const record = await response.json();

    return new Response(
      JSON.stringify({ recordId: record.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in airtable-tasks:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
