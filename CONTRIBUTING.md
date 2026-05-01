# Contributing

Thanks for your interest in contributing to the AFRC Contracts Knowledge Graph!

## Getting Started

1. Fork and clone the repository
2. `npm install`
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Make your changes
5. Test: `npm run type-check`
6. Commit and push
7. Open a pull request

## Development Guidelines

- **TypeScript**: All code must be properly typed
- **Style**: Code is auto-formatted on save
- **Components**: Use functional components with React hooks
- **Testing**: Add tests for new features
- **Documentation**: Update README for user-facing changes

## Project Structure

- `/src/components` - React components
- `/src/services` - Business logic (API, graph building, filters)
- `/src/types` - TypeScript interfaces
- `/scripts` - Data processing scripts
- `/data` - Data files (raw API responses, processed graphs)

## Common Tasks

### Fetch Fresh Data
```bash
npm run fetch-data
```

### Transform Data
```bash
npm run transform-data
```

### Build for Production
```bash
npm run build
```

## Questions?

Open an issue or reach out to the maintainers!
