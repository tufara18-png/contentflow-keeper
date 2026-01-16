import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AIRTABLE_API_TOKEN = Deno.env.get('AIRTABLE_API_TOKEN');
const AIRTABLE_BASE_ID = Deno.env.get('AIRTABLE_BASE_ID');
const AIRTABLE_TABLE_NAME = Deno.env.get('AIRTABLE_TABLE_NAME');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Field IDs mapping
const FIELD_IDS = {
  content_topic: 'fld0grDppzuqxJWEE',
  date: 'fldXDTAuXOhRIhzdY',
  description: 'fldU4WjU99zfAPyj8',
  distribution_channels: 'fldbhCl3bTPHJAjD1',
  pilier: 'fldPfTswhSxBTu5Ax',
  cible: 'fldlpdRBPuEZVVOXU',
  status: 'fldgW5HiUxclQBBQC',
  todo: 'fldzGa5BB3TUt4t8k',
  asset: 'fldqFCnZyQvzAWoe9',
  texte_copy: 'fld0XxsjR92AfqlUY',
  script: 'fld3rRuIfSyfJMxfb',
  type: 'fldSFfF3NAL50Wc3a',
};

function getAirtableUrl(recordId?: string): string {
  const encodedTableName = encodeURIComponent(AIRTABLE_TABLE_NAME || '');
  const base = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodedTableName}`;
  return recordId ? `${base}/${recordId}` : base;
}

function mapAirtableToCache(record: any) {
  const fields = record.fields || {};
  return {
    airtable_record_id: record.id,
    created_time: record.createdTime,
    content_topic: fields[FIELD_IDS.content_topic] || null,
    date: fields[FIELD_IDS.date] || null,
    description: fields[FIELD_IDS.description] || null,
    distribution_channels: fields[FIELD_IDS.distribution_channels] || [],
    pilier: fields[FIELD_IDS.pilier] || [],
    cible: fields[FIELD_IDS.cible] || [],
    status: fields[FIELD_IDS.status] || null,
    todo: fields[FIELD_IDS.todo] || null,
    asset: fields[FIELD_IDS.asset] || null,
    texte_copy: fields[FIELD_IDS.texte_copy] || null,
    script: fields[FIELD_IDS.script] || null,
    type: fields[FIELD_IDS.type] || [],
  };
}

function mapCacheToAirtable(data: any) {
  const fields: Record<string, any> = {};
  
  if (data.content_topic !== undefined) fields[FIELD_IDS.content_topic] = data.content_topic;
  if (data.date !== undefined) fields[FIELD_IDS.date] = data.date;
  if (data.description !== undefined) fields[FIELD_IDS.description] = data.description;
  if (data.distribution_channels !== undefined) fields[FIELD_IDS.distribution_channels] = data.distribution_channels;
  if (data.pilier !== undefined) fields[FIELD_IDS.pilier] = data.pilier;
  if (data.cible !== undefined) fields[FIELD_IDS.cible] = data.cible;
  if (data.status !== undefined) fields[FIELD_IDS.status] = data.status;
  if (data.todo !== undefined) fields[FIELD_IDS.todo] = data.todo;
  if (data.asset !== undefined) fields[FIELD_IDS.asset] = data.asset;
  if (data.texte_copy !== undefined) fields[FIELD_IDS.texte_copy] = data.texte_copy;
  if (data.script !== undefined) fields[FIELD_IDS.script] = data.script;
  if (data.type !== undefined) fields[FIELD_IDS.type] = data.type;
  
  return fields;
}

async function fetchAllAirtableRecords(): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(getAirtableUrl());
    if (offset) url.searchParams.set('offset', offset);

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Airtable fetch error:', error);
      throw new Error(`Airtable error: ${response.status}`);
    }

    const data = await response.json();
    records.push(...data.records);
    offset = data.offset;
  } while (offset);

  return records;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
    return new Response(
      JSON.stringify({ error: 'Airtable configuration is missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { action, recordId, data } = await req.json();
    console.log('Airtable sync action:', action);

    switch (action) {
      case 'sync': {
        // Fetch all records from Airtable
        const records = await fetchAllAirtableRecords();
        console.log(`Fetched ${records.length} records from Airtable`);

        // Upsert into cache
        for (const record of records) {
          const cacheData = mapAirtableToCache(record);
          
          const { error } = await supabase
            .from('content_cache')
            .upsert(cacheData, { onConflict: 'airtable_record_id' });

          if (error) {
            console.error('Upsert error:', error);
          }
        }

        // Remove records from cache that are no longer in Airtable
        const airtableIds = records.map(r => r.id);
        const { data: cacheRecords } = await supabase
          .from('content_cache')
          .select('airtable_record_id');

        if (cacheRecords) {
          const toDelete = cacheRecords
            .filter(c => !airtableIds.includes(c.airtable_record_id))
            .map(c => c.airtable_record_id);

          if (toDelete.length > 0) {
            await supabase
              .from('content_cache')
              .delete()
              .in('airtable_record_id', toDelete);
          }
        }

        return new Response(
          JSON.stringify({ synced: records.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'create': {
        const fields = mapCacheToAirtable(data);
        
        const response = await fetch(getAirtableUrl(), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Airtable create error: ${error}`);
        }

        const record = await response.json();
        const cacheData = mapAirtableToCache(record);

        await supabase
          .from('content_cache')
          .upsert(cacheData, { onConflict: 'airtable_record_id' });

        return new Response(
          JSON.stringify(cacheData),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'update': {
        if (!recordId) {
          return new Response(
            JSON.stringify({ error: 'recordId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const fields = mapCacheToAirtable(data);

        const response = await fetch(getAirtableUrl(recordId), {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields }),
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Airtable update error: ${error}`);
        }

        const record = await response.json();
        const cacheData = mapAirtableToCache(record);

        await supabase
          .from('content_cache')
          .upsert(cacheData, { onConflict: 'airtable_record_id' });

        return new Response(
          JSON.stringify(cacheData),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        if (!recordId) {
          return new Response(
            JSON.stringify({ error: 'recordId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(getAirtableUrl(recordId), {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_TOKEN}`,
          },
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Airtable delete error: ${error}`);
        }

        await supabase
          .from('content_cache')
          .delete()
          .eq('airtable_record_id', recordId);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error in airtable-sync:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
