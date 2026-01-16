export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      content_cache: {
        Row: {
          airtable_record_id: string
          asset: string | null
          cible: Json | null
          content_topic: string | null
          created_time: string | null
          date: string | null
          description: string | null
          distribution_channels: Json | null
          id: string
          pilier: Json | null
          script: string | null
          status: string | null
          texte_copy: string | null
          todo: string | null
          type: Json | null
          updated_at: string
        }
        Insert: {
          airtable_record_id: string
          asset?: string | null
          cible?: Json | null
          content_topic?: string | null
          created_time?: string | null
          date?: string | null
          description?: string | null
          distribution_channels?: Json | null
          id?: string
          pilier?: Json | null
          script?: string | null
          status?: string | null
          texte_copy?: string | null
          todo?: string | null
          type?: Json | null
          updated_at?: string
        }
        Update: {
          airtable_record_id?: string
          asset?: string | null
          cible?: Json | null
          content_topic?: string | null
          created_time?: string | null
          date?: string | null
          description?: string | null
          distribution_channels?: Json | null
          id?: string
          pilier?: Json | null
          script?: string | null
          status?: string | null
          texte_copy?: string | null
          todo?: string | null
          type?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      dumps: {
        Row: {
          created_at: string
          id: string
          original_text: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_text: string
        }
        Update: {
          created_at?: string
          id?: string
          original_text?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          category: Database["public"]["Enums"]["item_category"]
          confidence: number | null
          created_at: string
          due_date: string | null
          dump_id: string | null
          id: string
          priority: Database["public"]["Enums"]["item_priority"]
          raw_text: string | null
          status: Database["public"]["Enums"]["item_status"]
          title: string
          type: Database["public"]["Enums"]["item_type"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["item_category"]
          confidence?: number | null
          created_at?: string
          due_date?: string | null
          dump_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["item_priority"]
          raw_text?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          title: string
          type?: Database["public"]["Enums"]["item_type"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["item_category"]
          confidence?: number | null
          created_at?: string
          due_date?: string | null
          dump_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["item_priority"]
          raw_text?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          title?: string
          type?: Database["public"]["Enums"]["item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_dump_id_fkey"
            columns: ["dump_id"]
            isOneToOne: false
            referencedRelation: "dumps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      item_category:
        | "Site web"
        | "Publicité"
        | "Email marketing"
        | "Création de contenu"
        | "Réseaux sociaux"
        | "Lead magnet"
        | "SEO"
        | "Branding / Positionnement"
        | "Analytics / Tracking"
        | "Partenariats & PR"
        | "Autre"
      item_priority: "P0" | "P1" | "P2" | "P3"
      item_status: "Next" | "Backlog" | "Doing" | "Done"
      item_type: "Task" | "Reminder" | "Question" | "Note" | "Waiting"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      item_category: [
        "Site web",
        "Publicité",
        "Email marketing",
        "Création de contenu",
        "Réseaux sociaux",
        "Lead magnet",
        "SEO",
        "Branding / Positionnement",
        "Analytics / Tracking",
        "Partenariats & PR",
        "Autre",
      ],
      item_priority: ["P0", "P1", "P2", "P3"],
      item_status: ["Next", "Backlog", "Doing", "Done"],
      item_type: ["Task", "Reminder", "Question", "Note", "Waiting"],
    },
  },
} as const
