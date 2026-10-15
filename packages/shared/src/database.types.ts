export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      todos: {
        Row: {
          id: number;
          title: string;
          created_at: string;
        };
        Insert: {
          id?: never;
          title: string;
          created_at?: string;
        };
        Update: {
          title?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
