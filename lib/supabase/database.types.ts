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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affiliate_links: {
        Row: {
          active: boolean
          created_at: string
          id: string
          laptop_id: string
          retailer_id: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          laptop_id: string
          retailer_id: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          laptop_id?: string
          retailer_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_links_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: false
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_links_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      comparisons: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          laptop_ids: string[]
          name: string | null
          slug: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          laptop_ids: string[]
          name?: string | null
          slug?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          laptop_ids?: string[]
          name?: string | null
          slug?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      laptops: {
        Row: {
          brand: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          model: string
          refurbished: boolean
          slug: string
          updated_at: string
          year: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          model: string
          refurbished?: boolean
          slug: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          model?: string
          refurbished?: boolean
          slug?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      prices_history: {
        Row: {
          currency: string
          id: number
          in_stock: boolean | null
          laptop_id: string
          observed_at: string
          price_eur: number
          retailer_id: string
        }
        Insert: {
          currency?: string
          id?: number
          in_stock?: boolean | null
          laptop_id: string
          observed_at?: string
          price_eur: number
          retailer_id: string
        }
        Update: {
          currency?: string
          id?: number
          in_stock?: boolean | null
          laptop_id?: string
          observed_at?: string
          price_eur?: number
          retailer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_history_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: false
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_history_retailer_id_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "retailers"
            referencedColumns: ["id"]
          },
        ]
      }
      retailers: {
        Row: {
          active: boolean
          affiliate_id: string | null
          base_url: string | null
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          affiliate_id?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          affiliate_id?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      specs: {
        Row: {
          ai_optimized: boolean | null
          battery_wh: number | null
          cpu: string | null
          cpu_cores: number | null
          gpu: string | null
          gpu_vram_gb: number | null
          keyboard_lang: string | null
          laptop_id: string
          os: string | null
          ports: string[] | null
          product_line: string | null
          ram_gb: number | null
          screen_inches: number | null
          screen_panel_type: string | null
          screen_refresh_hz: number | null
          screen_resolution: string | null
          storage_gb: number | null
          storage_type: string | null
          updated_at: string
          usage_type: string | null
          weight_kg: number | null
        }
        Insert: {
          ai_optimized?: boolean | null
          battery_wh?: number | null
          cpu?: string | null
          cpu_cores?: number | null
          gpu?: string | null
          gpu_vram_gb?: number | null
          keyboard_lang?: string | null
          laptop_id: string
          os?: string | null
          ports?: string[] | null
          product_line?: string | null
          ram_gb?: number | null
          screen_inches?: number | null
          screen_panel_type?: string | null
          screen_refresh_hz?: number | null
          screen_resolution?: string | null
          storage_gb?: number | null
          storage_type?: string | null
          updated_at?: string
          usage_type?: string | null
          weight_kg?: number | null
        }
        Update: {
          ai_optimized?: boolean | null
          battery_wh?: number | null
          cpu?: string | null
          cpu_cores?: number | null
          gpu?: string | null
          gpu_vram_gb?: number | null
          keyboard_lang?: string | null
          laptop_id?: string
          os?: string | null
          ports?: string[] | null
          product_line?: string | null
          ram_gb?: number | null
          screen_inches?: number | null
          screen_panel_type?: string | null
          screen_refresh_hz?: number | null
          screen_resolution?: string | null
          storage_gb?: number | null
          storage_type?: string | null
          updated_at?: string
          usage_type?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "specs_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: true
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      distinct_brands: {
        Args: never
        Returns: {
          brand: string
        }[]
      }
      search_laptops: {
        Args: {
          p_ai?: boolean
          p_brands?: string[]
          p_gaming?: boolean
          p_limit?: number
          p_offset?: number
          p_oled?: boolean
          p_price_max?: number
          p_q?: string
          p_ram_min?: number
          p_refurbished?: boolean
          p_screen_max?: number
          p_screen_min?: number
          p_sort?: string
        }
        Returns: {
          brand: string
          id: string
          image_url: string
          min_price: number
          model: string
          slug: string
          total_count: number
          year: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
