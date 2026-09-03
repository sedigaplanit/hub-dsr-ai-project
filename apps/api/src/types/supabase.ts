export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          email: string
          full_name: string
          pod: string | null
          location: string | null
          capability: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          full_name: string
          pod?: string | null
          location?: string | null
          capability?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['employees']['Insert']>
        Relationships: []
      }
      daily_reports: {
        Row: {
          id: string
          employee_id: string
          report_date: string
          blockers: string | null
          notes: string | null
          cv_status: string
          cv_target_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          report_date: string
          blockers?: string | null
          notes?: string | null
          cv_status: string
          cv_target_date?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['daily_reports']['Insert']>
        Relationships: []
      }
      training_tasks: {
        Row: {
          id: string
          daily_report_id: string
          title: string
          learning_type: string
          status: string
          eta_date: string
          target_date: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          daily_report_id: string
          title: string
          learning_type: string
          status: string
          eta_date: string
          target_date?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['training_tasks']['Insert']>
        Relationships: []
      }
      certification_progress: {
        Row: {
          id: string
          daily_report_id: string
          istqb_done: boolean
          istqb_target_date: string | null
          cae_done: boolean
          cae_target_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          daily_report_id: string
          istqb_done: boolean
          istqb_target_date?: string | null
          cae_done: boolean
          cae_target_date?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['certification_progress']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
