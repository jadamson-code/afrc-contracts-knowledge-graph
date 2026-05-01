# AFRC Contracts Knowledge Graph

🛩️ An interactive knowledge graph visualization of Air Force Reserve Component (AFRC) contracts using [Sigma.js](https://sigmajs.org/) and real data from [USAspending.gov](https://www.usaspending.gov/).

## 🌐 Live Demo

- **Cloud Prototype (StackBlitz):** Coming soon
- **Production Deploy (Vercel):** Coming soon

## Overview

This project visualizes complex relationships in federal contracting for the Air Force's Aircraft Procurement account (057-3010):

- **Nodes**: Contractors, contract industries (NAICS), fiscal years
- **Edges**: Award relationships, funding flows, vendor connections
- **Data Source**: Real AFRC contracts from [USAspending.gov](https://www.usaspending.gov/federal_account/057-3010)

## Features

- 📊 Real-time graph visualization with Sigma.js (WebGL-rendered, handles 1000s of nodes)
- 🔍 Interactive filtering by contractor, contract value, industry type, and time period
- 📈 Network analysis - see which contractors dominate procurement
- 🎨 Color-coded nodes by industry classification (NAICS codes)
- 📱 Responsive design with React
- 🔗 Hover to see contract details in detail panel
- 💾 Toggle between mock data and live API calls
- 📡 Automatic data fetching and caching

## Quick Start

### Local Development (Mac)

```bash
# Clone the repository
git clone https://github.com/jadamson-code/afrc-contracts-knowledge-graph.git
cd afrc-contracts-knowledge-graph

# Install dependencies
npm install

# Start dev server (opens http://localhost:3000)
npm run dev
```

### Fetch Real Data (Optional)

```bash
# Fetch latest AFRC contracts from USAspending API
npm run fetch-data

# Transform data into graph format
npm run transform-data
```

### Build for Production

```bash
npm run build
npm run preview
```

## Architecture

### Data Pipeline

```
┌─────────────────────────────┐
│   USAspending API           │
│  (Real-time contracts)      │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Fetch Service             │
│  (src/services/usaspending) │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Graph Builder             │
│  (src/services/graphBuilder)│
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Graphology Graph Object   │
│  (Nodes + Edges)            │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Sigma.js Visualization    │
│  (WebGL Canvas Rendering)   │
└─────────────────────────────┘
```

### Project Structure

```
.
├── src/
│   ├── components/
│   │   ├── Graph.tsx              # Main Sigma graph component
│   │   ├── Controls.tsx           # Filter controls
│   │   ├── NodeDetails.tsx        # Contract details panel
│   │   └── DataToggle.tsx         # Mock vs Live API toggle
│   ├── services/
│   │   ├── usaspending.ts         # USAspending API client
│   │   ├── graphBuilder.ts        # Graph transformation logic
│   │   ├── filters.ts             # Filter & query utilities
│   │   └── mockData.ts            # Sample AFRC contract data
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   ├── App.tsx                    # Main app component
│   ├── main.tsx                   # Entry point
│   └── index.css                  # Styling
├── scripts/
│   ├── fetch-contracts.ts         # Data fetching script
│   └── transform-to-graph.ts      # Data transformation script
├── data/
│   ├── raw/                       # Raw API responses
│   └── processed/                 # Graph JSON files
├── index.html                     # HTML template
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── vite.config.ts                 # Vite config
├── .env.example                   # Environment variables template
└── README.md                      # This file
```

## Configuration

Create a `.env.local` file in the project root:

```env
VITE_USASPENDING_API_BASE=https://api.usaspending.gov/api/v2
VITE_FEDERAL_ACCOUNT=057-3010
VITE_FISCAL_YEARS=2023,2024,2025
VITE_USE_MOCK_DATA=true
```

## Data Categories

### Node Types
- **Contractor** (Blue): Vendor company or prime contractor
- **NAICS Industry** (Color-coded): Industry classification (red=engineering, teal=IT, etc.)
- **Fiscal Year** (Gray): Funding period

### Edge Types
- **AWARDED_TO**: Contractor receives contract award
- **CLASSIFIED_AS**: Contract classified by industry type
- **FUNDED_BY**: Contract funded by specific fiscal year

## API Integration

This project uses the USAspending API:

- **Endpoint**: `POST /api/v2/search/spending_by_award/`
- **Filters contracts by**:
  - Federal account: 057-3010 (Aircraft Procurement, Air Force)
  - Award type: Contracts (A, B, C, D)
  - Fiscal year range: 2023-2025

### Sample API Query

```json
{
  "filters": {
    "award_type_codes": ["A", "B", "C", "D"],
    "federal_account": "057-3010",
    "fy": [2024, 2025]
  },
  "page": 1,
  "limit": 100
}
```

## Mock Data

The app includes sample AFRC contract data for instant prototyping:
- 50+ mock contracts
- 20+ contractors
- Multiple industries (NAICS codes)
- Realistic spending amounts

Toggle between mock and live data using the UI switch.

## Next Steps

- [x] Core graph visualization
- [x] Mock data support
- [x] Real API integration
- [x] Filter controls
- [ ] Deploy to StackBlitz
- [ ] Deploy to Vercel
- [ ] Export/report generation
- [ ] Timeline animation (fiscal year by year)
- [ ] Spending trend analysis
- [ ] Subcontractor relationships
- [ ] Advanced search/bookmarks

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT

## Resources

- [Sigma.js Documentation](https://www.sigmajs.org/docs)
- [USAspending API Docs](https://api.usaspending.gov/docs/using-the-api)
- [Graphology Documentation](https://graphology.js.org/)
- [React Sigma Documentation](https://sim51.github.io/react-sigma/)

## Questions?

Open an issue on GitHub or contact the maintainer!
