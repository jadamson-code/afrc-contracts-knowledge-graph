/**
 * Fetch AFRC contracts from USAspending API
 * Usage: npm run fetch-data
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { usaspendingClient } from '../src/services/usaspending';

const DATA_DIR = './data/raw';
const FISCAL_YEARS = [2024, 2025];

async function main() {
  try {
    console.log('🔄 Fetching AFRC contracts from USAspending API...');
    console.log(`📅 Fiscal Years: ${FISCAL_YEARS.join(', ')}`);

    // Ensure data directory exists
    mkdirSync(DATA_DIR, { recursive: true });

    // Fetch awards
    const awards = await usaspendingClient.getAllAwards({
      fiscalYears: FISCAL_YEARS,
      maxPages: 10,
    });

    console.log(`✅ Retrieved ${awards.length} contracts`);

    // Save raw data
    const filename = join(
      DATA_DIR,
      `contracts_${new Date().toISOString().split('T')[0]}.json`
    );
    writeFileSync(filename, JSON.stringify(awards, null, 2));
    console.log(`💾 Saved to ${filename}`);

    // Print summary
    const totalSpending = awards.reduce(
      (sum, a) => sum + a.federal_action_obligation,
      0
    );
    const uniqueContractors = new Set(awards.map((a) => a.recipient_name)).size;

    console.log('\n📊 Summary:');
    console.log(`   Total Spending: $${(totalSpending / 1000000).toFixed(1)}M`);
    console.log(`   Unique Contractors: ${uniqueContractors}`);
    console.log(
      `   Average Contract Value: $${(totalSpending / awards.length / 1000).toFixed(0)}K`
    );
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
