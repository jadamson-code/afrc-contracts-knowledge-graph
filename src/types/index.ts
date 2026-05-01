/**
 * Type definitions for AFRC Contracts Knowledge Graph
 */

// ============ USAspending API Types ============

export interface AwardResponse {
  results: Award[];
  page_metadata: {
    current_page: number;
    hasNext: boolean;
    hasPrevious: boolean;
    next: number | null;
    page_size: number;
    previous: number | null;
    total_matched_set: number;
  };
}

export interface Award {
  id: number;
  generated_internal_id: string;
  award_id: string;
  description: string;
  award_type: string;
  award_type_code: string;
  recipient_id: string;
  recipient_name: string;
  recipient_unique_id: string | null;
  recipient_dba_name: string | null;
  action_date: string;
  action_type: string;
  action_type_code: string;
  federal_action_obligation: number;
  potential_total_value_of_award: number;
  funding_agency_id: string;
  funding_agency_name: string;
  naics_code: string;
  naics_description: string;
  psc_code: string;
  psc_description: string;
  prime_award_base_transaction_id: string;
  business_types: string[];
  generated_unique_award_id: string;
}

// ============ Graph Node/Edge Types ============

export interface GraphNode {
  id: string;
  label: string;
  type: 'contractor' | 'contract_type' | 'naics' | 'period';
  size: number;
  color: string;
  x?: number;
  y?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'awarded_to' | 'funded_by' | 'classified_as';
  weight?: number;
  value?: number;
  metadata?: Record<string, unknown>;
}

export interface ContractData {
  id: string;
  contractorName: string;
  contractorId: string;
  awardValue: number;
  actionDate: string;
  fiscalYear: number;
  naicsCode: string;
  naicsDescription: string;
  pscCode: string;
  pscDescription: string;
  actionType: string;
  description: string;
  businessTypes: string[];
}

// ============ Filter Types ============

export interface FilterState {
  contractorName: string;
  minValue: number;
  maxValue: number;
  naicsCode?: string;
  fiscalYear?: number;
  actionType?: string;
}

export interface NodeSelectionState {
  nodeId: string | null;
  nodeData: Partial<GraphNode> | null;
}

// ============ Statistics Types ============

export interface ContractStats {
  totalContracts: number;
  totalSpending: number;
  uniqueContractors: number;
  uniqueNAICS: number;
  averageContractValue: number;
  medianContractValue: number;
  topContractors: Array<{
    name: string;
    count: number;
    spending: number;
  }>;
  topNAICS: Array<{
    code: string;
    description: string;
    count: number;
    spending: number;
  }>;
}
