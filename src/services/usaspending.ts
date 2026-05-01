/**
 * USAspending API Client
 * Handles all communication with USAspending.gov API
 */

import axios, { AxiosInstance } from 'axios';
import { Award, AwardResponse } from '../types';

const BASE_URL = import.meta.env.VITE_USASPENDING_API_BASE || 'https://api.usaspending.gov/api/v2';
const FEDERAL_ACCOUNT = import.meta.env.VITE_FEDERAL_ACCOUNT || '057-3010';

export class USAspendingClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
    });
  }

  /**
   * Fetch awards/contracts for the AFRC account
   */
  async getAwards(params: {
    fiscalYears?: number[];
    page?: number;
    pageSize?: number;
    minValue?: number;
    maxValue?: number;
    contractorName?: string;
  }): Promise<AwardResponse> {
    const {
      fiscalYears = [2024, 2025],
      page = 1,
      pageSize = 100,
      minValue = 0,
      maxValue = 999999999,
      contractorName,
    } = params;

    const filters: Record<string, unknown> = {
      award_type_codes: ['A', 'B', 'C', 'D'], // All contract types
      federal_account: FEDERAL_ACCOUNT,
      federal_action_obligation: {
        gt: minValue,
        lt: maxValue,
      },
    };

    if (fiscalYears.length > 0) {
      filters.fy = fiscalYears;
    }

    if (contractorName) {
      (filters.recipient_name as any) = contractorName;
    }

    try {
      const response = await this.client.post<AwardResponse>(
        '/search/spending_by_award/',
        {
          filters,
          page,
          limit: pageSize,
          sort: {
            direction: 'desc',
            field: 'federal_action_obligation',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching awards:', error);
      throw error;
    }
  }

  /**
   * Fetch all pages of awards (pagination wrapper)
   */
  async getAllAwards(params: {
    fiscalYears?: number[];
    maxPages?: number;
    minValue?: number;
    maxValue?: number;
  }): Promise<Award[]> {
    const { maxPages = 10, ...otherParams } = params;
    const awards: Award[] = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        const response = await this.getAwards({
          ...otherParams,
          page,
          pageSize: 100,
        });

        awards.push(...response.results);

        if (!response.page_metadata.hasNext) {
          break;
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        break;
      }
    }

    return awards;
  }
}

// Export singleton instance
export const usaspendingClient = new USAspendingClient();
