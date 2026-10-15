
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "batch_weight_confirmations": {
                  Row: {
                    "answered_at": string | null,"answered_by_phone": string | null,"batch_id": string,"confirmed_by_staff_id": string | null,"created_at": string,"id": string,"measurements": NonNullable<Json>,"prompt_id": string | null,"stage": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answered_at"?: string | null,"answered_by_phone"?: string | null,"batch_id": string,"confirmed_by_staff_id"?: string | null,"created_at"?: string,"id"?: string,"measurements": NonNullable<Json>,"prompt_id"?: string | null,"stage": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "answered_at"?: string | null,"answered_by_phone"?: string | null,"batch_id"?: string,"confirmed_by_staff_id"?: string | null,"created_at"?: string,"id"?: string,"measurements"?: NonNullable<Json>,"prompt_id"?: string | null,"stage"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_weight_confirmations_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_weight_confirmations_confirmed_by_staff_id_fkey"
      columns: ["confirmed_by_staff_id"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_weight_confirmations_prompt_id_fkey"
      columns: ["prompt_id"]
isOneToOne: false
      referencedRelation: "sms_prompts"
      referencedColumns: ["id"]
    }
                  ]
                },"batches": {
                  Row: {
                    "bags": number | null,"batch_no": string,"byproducts": NonNullable<Json>,"client_id": string,"created_at": string,"damaged_pct": number | null,"doc_refs": NonNullable<Json>,"dried_kg": number | null,"dry_end": string | null,"dry_start": string | null,"dryer_id": string | null,"facility_id": string,"foreign_pct": number | null,"id": string,"immature_pct": number | null,"mc": number | null,"mc_out": number | null,"mill_end": string | null,"mill_id": string | null,"mill_in_kg": number | null,"mill_start": string | null,"net_kg": number | null,"ownership": Database["public"]['Enums']["batch_ownership"],"pickup_after_drying": boolean,"queue_entry_id": string | null,"rice_kg": number | null,"stage": Database["public"]['Enums']["batch_stage"],"updated_at": string,"variety_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bags"?: number | null,"batch_no": string,"byproducts"?: NonNullable<Json>,"client_id": string,"created_at"?: string,"damaged_pct"?: number | null,"doc_refs"?: NonNullable<Json>,"dried_kg"?: number | null,"dry_end"?: string | null,"dry_start"?: string | null,"dryer_id"?: string | null,"facility_id": string,"foreign_pct"?: number | null,"id"?: string,"immature_pct"?: number | null,"mc"?: number | null,"mc_out"?: number | null,"mill_end"?: string | null,"mill_id"?: string | null,"mill_in_kg"?: number | null,"mill_start"?: string | null,"net_kg"?: number | null,"ownership": Database["public"]['Enums']["batch_ownership"],"pickup_after_drying"?: boolean,"queue_entry_id"?: string | null,"rice_kg"?: number | null,"stage"?: Database["public"]['Enums']["batch_stage"],"updated_at"?: string,"variety_id"?: string | null
                  }
                  Update: {
                    "bags"?: number | null,"batch_no"?: string,"byproducts"?: NonNullable<Json>,"client_id"?: string,"created_at"?: string,"damaged_pct"?: number | null,"doc_refs"?: NonNullable<Json>,"dried_kg"?: number | null,"dry_end"?: string | null,"dry_start"?: string | null,"dryer_id"?: string | null,"facility_id"?: string,"foreign_pct"?: number | null,"id"?: string,"immature_pct"?: number | null,"mc"?: number | null,"mc_out"?: number | null,"mill_end"?: string | null,"mill_id"?: string | null,"mill_in_kg"?: number | null,"mill_start"?: string | null,"net_kg"?: number | null,"ownership"?: Database["public"]['Enums']["batch_ownership"],"pickup_after_drying"?: boolean,"queue_entry_id"?: string | null,"rice_kg"?: number | null,"stage"?: Database["public"]['Enums']["batch_stage"],"updated_at"?: string,"variety_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batches_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_dryer_id_fkey"
      columns: ["dryer_id"]
isOneToOne: false
      referencedRelation: "machines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_facility_id_fkey"
      columns: ["facility_id"]
isOneToOne: false
      referencedRelation: "facilities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_mill_id_fkey"
      columns: ["mill_id"]
isOneToOne: false
      referencedRelation: "machines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_queue_entry_id_fkey"
      columns: ["queue_entry_id"]
isOneToOne: true
      referencedRelation: "queue_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_variety_id_fkey"
      columns: ["variety_id"]
isOneToOne: false
      referencedRelation: "varieties"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "booked_by_phone": string,"channel": Database["public"]['Enums']["booking_channel"],"client_id": string,"created_at": string,"est_kg": number,"facility_id": string,"flex_days": number,"id": string,"preferred_date": string,"proposed_date": string | null,"ref": string,"scheduled_date": string,"service": Database["public"]['Enums']["service"],"status": Database["public"]['Enums']["booking_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booked_by_phone": string,"channel": Database["public"]['Enums']["booking_channel"],"client_id": string,"created_at"?: string,"est_kg": number,"facility_id": string,"flex_days"?: number,"id"?: string,"preferred_date": string,"proposed_date"?: string | null,"ref": string,"scheduled_date": string,"service": Database["public"]['Enums']["service"],"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string
                  }
                  Update: {
                    "booked_by_phone"?: string,"channel"?: Database["public"]['Enums']["booking_channel"],"client_id"?: string,"created_at"?: string,"est_kg"?: number,"facility_id"?: string,"flex_days"?: number,"id"?: string,"preferred_date"?: string,"proposed_date"?: string | null,"ref"?: string,"scheduled_date"?: string,"service"?: Database["public"]['Enums']["service"],"status"?: Database["public"]['Enums']["booking_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_facility_id_fkey"
      columns: ["facility_id"]
isOneToOne: false
      referencedRelation: "facilities"
      referencedColumns: ["id"]
    }
                  ]
                },"clients": {
                  Row: {
                    "buyer_type": Database["public"]['Enums']["buyer_type"] | null,"coop_id": string | null,"created_at": string,"id": string,"kind": Database["public"]['Enums']["client_kind"],"municipality_id": string | null,"name": string,"phone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buyer_type"?: Database["public"]['Enums']["buyer_type"] | null,"coop_id"?: string | null,"created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["client_kind"],"municipality_id"?: string | null,"name": string,"phone": string,"updated_at"?: string
                  }
                  Update: {
                    "buyer_type"?: Database["public"]['Enums']["buyer_type"] | null,"coop_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["client_kind"],"municipality_id"?: string | null,"name"?: string,"phone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_coop_id_fkey"
      columns: ["coop_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "clients_municipality_id_fkey"
      columns: ["municipality_id"]
isOneToOne: false
      referencedRelation: "municipalities"
      referencedColumns: ["id"]
    }
                  ]
                },"dispatches": {
                  Row: {
                    "batch_id": string,"buyer_id": string,"created_at": string,"dispatched_at": string,"id": string,"kg": number,"or_ref": string | null,"price_minor_per_kg": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"buyer_id": string,"created_at"?: string,"dispatched_at"?: string,"id"?: string,"kg": number,"or_ref"?: string | null,"price_minor_per_kg": number,"updated_at"?: string
                  }
                  Update: {
                    "batch_id"?: string,"buyer_id"?: string,"created_at"?: string,"dispatched_at"?: string,"id"?: string,"kg"?: number,"or_ref"?: string | null,"price_minor_per_kg"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispatches_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispatches_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"facilities": {
                  Row: {
                    "base_load_kw": number,"buy_budget_minor": number,"buy_budget_start": string | null,"created_at": string,"dry_yield_pct": number,"id": string,"idle_threshold_pct": number,"labor_minor_per_hour": number,"name": string,"notify_ahead_n": number,"operating_hours_per_day": number,"storage_capacity_kg": number,"tariff_minor_per_kwh": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_load_kw"?: number,"buy_budget_minor"?: number,"buy_budget_start"?: string | null,"created_at"?: string,"dry_yield_pct"?: number,"id"?: string,"idle_threshold_pct"?: number,"labor_minor_per_hour"?: number,"name": string,"notify_ahead_n"?: number,"operating_hours_per_day": number,"storage_capacity_kg": number,"tariff_minor_per_kwh"?: number,"updated_at"?: string
                  }
                  Update: {
                    "base_load_kw"?: number,"buy_budget_minor"?: number,"buy_budget_start"?: string | null,"created_at"?: string,"dry_yield_pct"?: number,"id"?: string,"idle_threshold_pct"?: number,"labor_minor_per_hour"?: number,"name"?: string,"notify_ahead_n"?: number,"operating_hours_per_day"?: number,"storage_capacity_kg"?: number,"tariff_minor_per_kwh"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"forecast_arrivals": {
                  Row: {
                    "created_at": string,"date": string,"id": string,"kg_high": number,"kg_low": number,"kg_mid": number,"municipality_id": string,"source": Database["public"]['Enums']["forecast_source"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"date": string,"id"?: string,"kg_high": number,"kg_low": number,"kg_mid": number,"municipality_id": string,"source": Database["public"]['Enums']["forecast_source"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"date"?: string,"id"?: string,"kg_high"?: number,"kg_low"?: number,"kg_mid"?: number,"municipality_id"?: string,"source"?: Database["public"]['Enums']["forecast_source"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "forecast_arrivals_municipality_id_fkey"
      columns: ["municipality_id"]
isOneToOne: false
      referencedRelation: "municipalities"
      referencedColumns: ["id"]
    }
                  ]
                },"forecast_metrics": {
                  Row: {
                    "created_at": string,"id": string,"metrics": NonNullable<Json>,"trained_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"metrics": NonNullable<Json>,"trained_on": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"metrics"?: NonNullable<Json>,"trained_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"machines": {
                  Row: {
                    "active": boolean,"capacity_kg": number | null,"code": string,"created_at": string,"cycle_hours": number | null,"facility_id": string,"id": string,"kg_per_hour": number | null,"rated_kw": number,"type": Database["public"]['Enums']["machine_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"capacity_kg"?: number | null,"code": string,"created_at"?: string,"cycle_hours"?: number | null,"facility_id": string,"id"?: string,"kg_per_hour"?: number | null,"rated_kw"?: number,"type": Database["public"]['Enums']["machine_type"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"capacity_kg"?: number | null,"code"?: string,"created_at"?: string,"cycle_hours"?: number | null,"facility_id"?: string,"id"?: string,"kg_per_hour"?: number | null,"rated_kw"?: number,"type"?: Database["public"]['Enums']["machine_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "machines_facility_id_fkey"
      columns: ["facility_id"]
isOneToOne: false
      referencedRelation: "facilities"
      referencedColumns: ["id"]
    }
                  ]
                },"municipalities": {
                  Row: {
                    "created_at": string,"id": string,"lat": number | null,"lng": number | null,"name": string,"psgc_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name": string,"psgc_code": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"lat"?: number | null,"lng"?: number | null,"name"?: string,"psgc_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"prescription_decisions": {
                  Row: {
                    "created_at": string,"decided_by": string,"id": string,"key": string,"kind": Database["public"]['Enums']["prescription_kind"],"status": Database["public"]['Enums']["prescription_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_by": string,"id"?: string,"key": string,"kind": Database["public"]['Enums']["prescription_kind"],"status": Database["public"]['Enums']["prescription_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"decided_by"?: string,"id"?: string,"key"?: string,"kind"?: Database["public"]['Enums']["prescription_kind"],"status"?: Database["public"]['Enums']["prescription_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prescription_decisions_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "staff"
      referencedColumns: ["id"]
    }
                  ]
                },"prices": {
                  Row: {
                    "buy_base_minor_per_kg": number,"buy_reference_mc": number,"buy_rules": NonNullable<Json>,"created_at": string,"drying_fee_minor_per_kg": number,"effective_date": string,"facility_id": string,"id": string,"milling_fee_minor_per_kg": number,"rice_minor_per_kg": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "buy_base_minor_per_kg": number,"buy_reference_mc"?: number,"buy_rules"?: NonNullable<Json>,"created_at"?: string,"drying_fee_minor_per_kg": number,"effective_date": string,"facility_id": string,"id"?: string,"milling_fee_minor_per_kg": number,"rice_minor_per_kg": number,"updated_at"?: string
                  }
                  Update: {
                    "buy_base_minor_per_kg"?: number,"buy_reference_mc"?: number,"buy_rules"?: NonNullable<Json>,"created_at"?: string,"drying_fee_minor_per_kg"?: number,"effective_date"?: string,"facility_id"?: string,"id"?: string,"milling_fee_minor_per_kg"?: number,"rice_minor_per_kg"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prices_facility_id_fkey"
      columns: ["facility_id"]
isOneToOne: false
      referencedRelation: "facilities"
      referencedColumns: ["id"]
    }
                  ]
                },"purchases": {
                  Row: {
                    "batch_id": string,"client_id": string,"created_at": string,"deductions": NonNullable<Json>,"id": string,"net_kg": number,"override_reason": string | null,"paid_kg": number,"price_date": string,"price_minor_per_kg": number,"total_minor": number,"updated_at": string,"voucher_ref": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"client_id": string,"created_at"?: string,"deductions"?: NonNullable<Json>,"id"?: string,"net_kg": number,"override_reason"?: string | null,"paid_kg": number,"price_date": string,"price_minor_per_kg": number,"total_minor": number,"updated_at"?: string,"voucher_ref"?: string | null
                  }
                  Update: {
                    "batch_id"?: string,"client_id"?: string,"created_at"?: string,"deductions"?: NonNullable<Json>,"id"?: string,"net_kg"?: number,"override_reason"?: string | null,"paid_kg"?: number,"price_date"?: string,"price_minor_per_kg"?: number,"total_minor"?: number,"updated_at"?: string,"voucher_ref"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchases_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: true
      referencedRelation: "batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchases_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    }
                  ]
                },"queue_entries": {
                  Row: {
                    "booking_id": string | null,"checked_in_at": string,"client_id": string,"created_at": string,"est_kg": number | null,"facility_id": string,"finished_at": string | null,"id": string,"offer_id": string | null,"ownership": Database["public"]['Enums']["batch_ownership"] | null,"service": Database["public"]['Enums']["service"],"started_at": string | null,"status": Database["public"]['Enums']["queue_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booking_id"?: string | null,"checked_in_at"?: string,"client_id": string,"created_at"?: string,"est_kg"?: number | null,"facility_id": string,"finished_at"?: string | null,"id"?: string,"offer_id"?: string | null,"ownership"?: Database["public"]['Enums']["batch_ownership"] | null,"service": Database["public"]['Enums']["service"],"started_at"?: string | null,"status"?: Database["public"]['Enums']["queue_status"],"updated_at"?: string
                  }
                  Update: {
                    "booking_id"?: string | null,"checked_in_at"?: string,"client_id"?: string,"created_at"?: string,"est_kg"?: number | null,"facility_id"?: string,"finished_at"?: string | null,"id"?: string,"offer_id"?: string | null,"ownership"?: Database["public"]['Enums']["batch_ownership"] | null,"service"?: Database["public"]['Enums']["service"],"started_at"?: string | null,"status"?: Database["public"]['Enums']["queue_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "queue_entries_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "queue_entries_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "queue_entries_facility_id_fkey"
      columns: ["facility_id"]
isOneToOne: false
      referencedRelation: "facilities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "queue_entries_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "sell_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"request_attempts": {
                  Row: {
                    "created_at": string,"id": string,"ip": string,"phone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"ip": string,"phone": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"ip"?: string,"phone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rice_orders": {
                  Row: {
                    "booked_by_phone": string,"client_id": string,"created_at": string,"dispatch_id": string | null,"facility_id": string,"id": string,"kg": number,"pickup_date": string,"ref": string,"status": Database["public"]['Enums']["rice_order_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booked_by_phone": string,"client_id": string,"created_at"?: string,"dispatch_id"?: string | null,"facility_id": string,"id"?: string,"kg": number,"pickup_date": string,"ref": string,"status"?: Database["public"]['Enums']["rice_order_status"],"updated_at"?: string
                  }
                  Update: {
                    "booked_by_phone"?: string,"client_id"?: string,"created_at"?: string,"dispatch_id"?: string | null,"facility_id"?: string,"id"?: string,"kg"?: number,"pickup_date"?: string,"ref"?: string,"status"?: Database["public"]['Enums']["rice_order_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rice_orders_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rice_orders_dispatch_id_fkey"
      columns: ["dispatch_id"]
isOneToOne: false
      referencedRelation: "dispatches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rice_orders_facility_id_fkey"
      columns: ["facility_id"]
isOneToOne: false
      referencedRelation: "facilities"
      referencedColumns: ["id"]
    }
                  ]
                },"sell_offers": {
                  Row: {
                    "booked_by_phone": string,"client_id": string,"created_at": string,"est_kg": number,"facility_id": string,"harvest_date": string,"id": string,"ref": string,"status": Database["public"]['Enums']["sell_offer_status"],"updated_at": string,"variety_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "booked_by_phone": string,"client_id": string,"created_at"?: string,"est_kg": number,"facility_id": string,"harvest_date": string,"id"?: string,"ref": string,"status"?: Database["public"]['Enums']["sell_offer_status"],"updated_at"?: string,"variety_id"?: string | null
                  }
                  Update: {
                    "booked_by_phone"?: string,"client_id"?: string,"created_at"?: string,"est_kg"?: number,"facility_id"?: string,"harvest_date"?: string,"id"?: string,"ref"?: string,"status"?: Database["public"]['Enums']["sell_offer_status"],"updated_at"?: string,"variety_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sell_offers_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sell_offers_facility_id_fkey"
      columns: ["facility_id"]
isOneToOne: false
      referencedRelation: "facilities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sell_offers_variety_id_fkey"
      columns: ["variety_id"]
isOneToOne: false
      referencedRelation: "varieties"
      referencedColumns: ["id"]
    }
                  ]
                },"sms_messages": {
                  Row: {
                    "body": string,"created_at": string,"direction": Database["public"]['Enums']["sms_direction"],"gateway_id": string | null,"id": string,"parsed": Json | null,"phone": string,"status": Database["public"]['Enums']["sms_status"],"updated_at": string,"via_ai": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"direction": Database["public"]['Enums']["sms_direction"],"gateway_id"?: string | null,"id"?: string,"parsed"?: Json | null,"phone": string,"status": Database["public"]['Enums']["sms_status"],"updated_at"?: string,"via_ai"?: boolean
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"direction"?: Database["public"]['Enums']["sms_direction"],"gateway_id"?: string | null,"id"?: string,"parsed"?: Json | null,"phone"?: string,"status"?: Database["public"]['Enums']["sms_status"],"updated_at"?: string,"via_ai"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"sms_prompts": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"kind": Database["public"]['Enums']["sms_prompt_kind"],"payload": NonNullable<Json>,"phone": string,"ref": string,"status": Database["public"]['Enums']["sms_prompt_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["sms_prompt_kind"],"payload"?: NonNullable<Json>,"phone": string,"ref": string,"status"?: Database["public"]['Enums']["sms_prompt_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["sms_prompt_kind"],"payload"?: NonNullable<Json>,"phone"?: string,"ref"?: string,"status"?: Database["public"]['Enums']["sms_prompt_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff": {
                  Row: {
                    "auth_user_id": string,"created_at": string,"id": string,"name": string,"role": Database["public"]['Enums']["staff_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth_user_id": string,"created_at"?: string,"id"?: string,"name": string,"role": Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Update: {
                    "auth_user_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"role"?: Database["public"]['Enums']["staff_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"track_attempts": {
                  Row: {
                    "created_at": string,"id": string,"phone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"phone": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"phone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"varieties": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "answer_batch_weight":
{ Args: { "p_phone": string,"p_prompt_id": string,"p_yes": boolean }; Returns: boolean
                           },
"confirm_batch_weight_in_person":
{ Args: { "p_batch_id": string,"p_confirmation_updated_at": string,"p_staff_id": string,"p_stage": string }; Returns: boolean
                           },
"dispatch_from_batch":
{ Args: { "p_batch_id": string,"p_buyer_id": string,"p_kg": number,"p_or_ref": string,"p_price_minor_per_kg": number }; Returns: {
              "batch_id": string,
"buyer_id": string,
"created_at": string,
"dispatched_at": string,
"id": string,
"kg": number,
"or_ref": string | null,
"price_minor_per_kg": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "dispatches"
        isOneToOne: true
        isSetofReturn: false
      } },
"finish_batch_drying":
{ Args: { "p_batch_id": string,"p_fields": Json,"p_ready_for_pickup": boolean,"p_ref": string }; Returns: Json
                           },
"import_forecast":
{ Args: { "p_arrivals": Json,"p_metrics": Json,"p_trained_on": string }; Returns: undefined
                           },
"record_batch_measurement":
{ Args: { "p_batch_id": string,"p_fields": Json,"p_ref": string,"p_stage": string }; Returns: Json
                           }
          }
          Enums: {
            "batch_ownership": "custom"|"irpc","batch_stage": "received"|"drying"|"stored"|"milling"|"milled"|"dispatched","booking_channel": "sms"|"staff","booking_status": "confirmed"|"reschedule_proposed"|"arrived"|"cancelled"|"no_show","buyer_type": "wholesaler"|"retailer"|"institutional"|"cooperative"|"drop_point"|"subsidy_program","client_kind": "farmer"|"coop"|"trader"|"buyer","forecast_source": "opa-2025"|"demo-synthetic","machine_type": "dryer"|"mill","prescription_kind": "move_bookings"|"fill_idle"|"mill_full_loads"|"store_mill_later","prescription_status": "accepted"|"dismissed","queue_status": "waiting"|"serving"|"done"|"left","rice_order_status": "requested"|"accepted"|"declined"|"cancelled"|"picked_up","sell_offer_status": "offered"|"accepted"|"declined"|"arrived"|"withdrawn","service": "drying"|"milling","sms_direction": "inbound"|"outbound","sms_prompt_kind": "ai_confirm"|"reschedule"|"weight_confirm"|"ai_fill","sms_prompt_status": "open"|"accepted"|"declined"|"expired","sms_status": "received"|"processed"|"queued"|"sent"|"failed","staff_role": "encoder"|"manager"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "batch_ownership": ["custom", "irpc"],"batch_stage": ["received", "drying", "stored", "milling", "milled", "dispatched"],"booking_channel": ["sms", "staff"],"booking_status": ["confirmed", "reschedule_proposed", "arrived", "cancelled", "no_show"],"buyer_type": ["wholesaler", "retailer", "institutional", "cooperative", "drop_point", "subsidy_program"],"client_kind": ["farmer", "coop", "trader", "buyer"],"forecast_source": ["opa-2025", "demo-synthetic"],"machine_type": ["dryer", "mill"],"prescription_kind": ["move_bookings", "fill_idle", "mill_full_loads", "store_mill_later"],"prescription_status": ["accepted", "dismissed"],"queue_status": ["waiting", "serving", "done", "left"],"rice_order_status": ["requested", "accepted", "declined", "cancelled", "picked_up"],"sell_offer_status": ["offered", "accepted", "declined", "arrived", "withdrawn"],"service": ["drying", "milling"],"sms_direction": ["inbound", "outbound"],"sms_prompt_kind": ["ai_confirm", "reschedule", "weight_confirm", "ai_fill"],"sms_prompt_status": ["open", "accepted", "declined", "expired"],"sms_status": ["received", "processed", "queued", "sent", "failed"],"staff_role": ["encoder", "manager"]
          }
        }
} as const
