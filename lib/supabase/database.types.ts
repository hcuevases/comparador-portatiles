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
          asin: string | null
          checked_at: string | null
          created_at: string
          id: string
          laptop_id: string
          last_status: number | null
          retailer_id: string
          unavailable_at: string | null
          url: string
        }
        Insert: {
          active?: boolean
          asin?: string | null
          checked_at?: string | null
          created_at?: string
          id?: string
          laptop_id: string
          last_status?: number | null
          retailer_id: string
          unavailable_at?: string | null
          url: string
        }
        Update: {
          active?: boolean
          asin?: string | null
          checked_at?: string | null
          created_at?: string
          id?: string
          laptop_id?: string
          last_status?: number | null
          retailer_id?: string
          unavailable_at?: string | null
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
      benchmark_overrides: {
        Row: {
          kind: string
          nanoreview_slug: string
          source_key: string
        }
        Insert: {
          kind: string
          nanoreview_slug: string
          source_key: string
        }
        Update: {
          kind?: string
          nanoreview_slug?: string
          source_key?: string
        }
        Relationships: []
      }
      compare_selections: {
        Row: {
          laptop_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          laptop_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          laptop_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      cpu_benchmarks: {
        Row: {
          component_key: string
          cores: number | null
          geekbench_multi: number | null
          geekbench_single: number | null
          name: string | null
          nanoreview_slug: string | null
          release_year: number | null
          score: number | null
          scraped_at: string
          status: string
          tdp_w: number | null
          threads: number | null
        }
        Insert: {
          component_key: string
          cores?: number | null
          geekbench_multi?: number | null
          geekbench_single?: number | null
          name?: string | null
          nanoreview_slug?: string | null
          release_year?: number | null
          score?: number | null
          scraped_at?: string
          status?: string
          tdp_w?: number | null
          threads?: number | null
        }
        Update: {
          component_key?: string
          cores?: number | null
          geekbench_multi?: number | null
          geekbench_single?: number | null
          name?: string | null
          nanoreview_slug?: string | null
          release_year?: number | null
          score?: number | null
          scraped_at?: string
          status?: string
          tdp_w?: number | null
          threads?: number | null
        }
        Relationships: []
      }
      gpu_benchmarks: {
        Row: {
          component_key: string
          g3dmark: number | null
          name: string | null
          nanoreview_slug: string | null
          score: number | null
          scraped_at: string
          status: string
          tdp_w: number | null
          vram_gb: number | null
        }
        Insert: {
          component_key: string
          g3dmark?: number | null
          name?: string | null
          nanoreview_slug?: string | null
          score?: number | null
          scraped_at?: string
          status?: string
          tdp_w?: number | null
          vram_gb?: number | null
        }
        Update: {
          component_key?: string
          g3dmark?: number | null
          name?: string | null
          nanoreview_slug?: string | null
          score?: number | null
          scraped_at?: string
          status?: string
          tdp_w?: number | null
          vram_gb?: number | null
        }
        Relationships: []
      }
      laptops: {
        Row: {
          brand: string
          created_at: string
          description: string | null
          discontinued_at: string | null
          ean: string | null
          featured_rank: number | null
          id: string
          image_url: string | null
          model: string
          mpn: string | null
          refurbished: boolean
          series_key: string | null
          series_locked: boolean
          slug: string
          updated_at: string
          year: number | null
        }
        Insert: {
          brand: string
          created_at?: string
          description?: string | null
          discontinued_at?: string | null
          ean?: string | null
          featured_rank?: number | null
          id?: string
          image_url?: string | null
          model: string
          mpn?: string | null
          refurbished?: boolean
          series_key?: string | null
          series_locked?: boolean
          slug: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          brand?: string
          created_at?: string
          description?: string | null
          discontinued_at?: string | null
          ean?: string | null
          featured_rank?: number | null
          id?: string
          image_url?: string | null
          model?: string
          mpn?: string | null
          refurbished?: boolean
          series_key?: string | null
          series_locked?: boolean
          slug?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          baseline_price_eur: number
          created_at: string
          id: string
          laptop_id: string
          last_notified_price_eur: number | null
          user_id: string
        }
        Insert: {
          baseline_price_eur: number
          created_at?: string
          id?: string
          laptop_id: string
          last_notified_price_eur?: number | null
          user_id: string
        }
        Update: {
          baseline_price_eur?: number
          created_at?: string
          id?: string
          laptop_id?: string
          last_notified_price_eur?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_laptop_id_fkey"
            columns: ["laptop_id"]
            isOneToOne: false
            referencedRelation: "laptops"
            referencedColumns: ["id"]
          },
        ]
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
          cpu_key: string | null
          enriched_at: string | null
          gpu: string | null
          gpu_key: string | null
          gpu_vram_gb: number | null
          keyboard_lang: string | null
          laptop_id: string
          os: string | null
          ports: string[] | null
          product_line: string | null
          ram_gb: number | null
          screen_brightness_nits: number | null
          screen_color_gamut: string | null
          screen_hdr: string | null
          screen_inches: number | null
          screen_panel_type: string | null
          screen_refresh_hz: number | null
          screen_resolution: string | null
          screen_response_ms: number | null
          screen_touch: boolean | null
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
          cpu_key?: string | null
          enriched_at?: string | null
          gpu?: string | null
          gpu_key?: string | null
          gpu_vram_gb?: number | null
          keyboard_lang?: string | null
          laptop_id: string
          os?: string | null
          ports?: string[] | null
          product_line?: string | null
          ram_gb?: number | null
          screen_brightness_nits?: number | null
          screen_color_gamut?: string | null
          screen_hdr?: string | null
          screen_inches?: number | null
          screen_panel_type?: string | null
          screen_refresh_hz?: number | null
          screen_resolution?: string | null
          screen_response_ms?: number | null
          screen_touch?: boolean | null
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
          cpu_key?: string | null
          enriched_at?: string | null
          gpu?: string | null
          gpu_key?: string | null
          gpu_vram_gb?: number | null
          keyboard_lang?: string | null
          laptop_id?: string
          os?: string | null
          ports?: string[] | null
          product_line?: string | null
          ram_gb?: number | null
          screen_brightness_nits?: number | null
          screen_color_gamut?: string | null
          screen_hdr?: string | null
          screen_inches?: number | null
          screen_panel_type?: string | null
          screen_refresh_hz?: number | null
          screen_resolution?: string | null
          screen_response_ms?: number | null
          screen_touch?: boolean | null
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
      affiliate_links_to_check: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          url: string
        }[]
      }
      compute_series_key: { Args: { p_model: string }; Returns: string }
      current_min_prices: {
        Args: { p_ids: string[] }
        Returns: {
          laptop_id: string
          min_price: number
        }[]
      }
      distinct_brands: {
        Args: never
        Returns: {
          brand: string
        }[]
      }
      distinct_product_lines: {
        Args: never
        Returns: {
          n: number
          product_line: string
        }[]
      }
      home_deals: {
        Args: {
          p_limit?: number
          p_min_drop_pct?: number
          p_window_days?: number
        }
        Returns: {
          brand: string
          cpu: string
          current_price_eur: number
          drop_pct: number
          id: string
          image_url: string
          model: string
          old_price_eur: number
          ram_gb: number
          screen_inches: number
          slug: string
        }[]
      }
      home_featured: {
        Args: { p_limit?: number }
        Returns: {
          brand: string
          cpu: string
          current_price_eur: number
          id: string
          image_url: string
          model: string
          ram_gb: number
          screen_inches: number
          slug: string
        }[]
      }
      home_novedades: {
        Args: { p_limit?: number }
        Returns: {
          brand: string
          cpu: string
          current_price_eur: number
          id: string
          image_url: string
          model: string
          ram_gb: number
          screen_inches: number
          slug: string
        }[]
      }
      prune_discontinued: {
        Args: { p_days?: number }
        Returns: {
          discontinued: number
          restored: number
        }[]
      }
      search_laptops: {
        Args: {
          p_ai?: boolean
          p_battery_min?: number
          p_brands?: string[]
          p_gaming?: boolean
          p_limit?: number
          p_offset?: number
          p_oled?: boolean
          p_price_max?: number
          p_product_line?: string
          p_q?: string
          p_ram_min?: number
          p_refresh_min?: number
          p_refurbished?: boolean
          p_screen_max?: number
          p_screen_min?: number
          p_sort?: string
          p_vram_min?: number
          p_weight_max?: number
        }
        Returns: {
          brand: string
          config_count: number
          cpus: string[]
          id: string
          image_url: string
          min_price: number
          model: string
          ram_max: number
          ram_min: number
          rep_cpu: string
          screen_max: number
          screen_min: number
          series_key: string
          slug: string
          storage_max: number
          storage_min: number
          total_count: number
          year: number
        }[]
      }
      series_configs: {
        Args: {
          p_ai?: boolean
          p_battery_min?: number
          p_brand: string
          p_gaming?: boolean
          p_oled?: boolean
          p_price_max?: number
          p_product_line?: string
          p_q?: string
          p_ram_min?: number
          p_refresh_min?: number
          p_refurbished?: boolean
          p_screen_max?: number
          p_screen_min?: number
          p_series_key: string
          p_vram_min?: number
          p_weight_max?: number
        }
        Returns: {
          brand: string
          cpu: string
          id: string
          image_url: string
          min_price: number
          model: string
          ram_gb: number
          screen_inches: number
          slug: string
          storage_gb: number
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
