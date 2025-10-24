# Project Structure

Clean and organized structure for the Football Field Reservation Bot.

## Directory Structure

```
whatsapp_halisaha_bot/
├── src/
│   ├── database/
│   │   ├── db.ts                    # Database service layer with queries
│   │   ├── migrate.ts               # Database migration runner
│   │   └── schema.sql               # PostgreSQL schema definition
│   │
│   ├── services/
│   │   ├── analyticsService.ts      # Business analytics & reporting
│   │   ├── cacheService.ts          # Redis caching layer
│   │   ├── reservationService.ts    # Reservation business logic
│   │   └── tableVisualizationService.ts  # Canvas image generation
│   │
│   ├── audioService.ts              # WhatsApp voice message processing
│   ├── config.ts                    # Environment configuration
│   ├── fieldAgent.ts                # AI agent for reservation management
│   ├── index.ts                     # Main application entry point
│   └── whatsappClient.ts            # WhatsApp API client
│
├── .dockerignore                    # Docker build exclusions
├── .env                             # Environment variables (not in git)
├── .env.example                     # Environment template
├── .gitignore                       # Git exclusions
├── BUSINESS_REQUIREMENTS.md         # Feature requirements document
├── COOLIFY_DEPLOYMENT.md           # Coolify deployment guide
├── docker-compose.yml              # Multi-container configuration
├── Dockerfile                       # Production container image
├── package.json                     # Node.js dependencies
├── PROJECT_STRUCTURE.md            # This file
├── README.md                        # Main documentation
├── TRANSFORMATION_SUMMARY.md       # Project transformation details
└── tsconfig.json                    # TypeScript configuration

```

## File Descriptions

### Core Application Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Express app, webhook handlers, application startup |
| `src/config.ts` | Centralized configuration from environment variables |
| `src/fieldAgent.ts` | OpenAI-powered AI agent for Turkish NLP |
| `src/whatsappClient.ts` | WhatsApp Business API integration |
| `src/audioService.ts` | Voice message transcription via OpenAI |

### Database Layer

| File | Purpose |
|------|---------|
| `src/database/db.ts` | PostgreSQL connection pool and query methods |
| `src/database/migrate.ts` | Automatic migration runner on startup |
| `src/database/schema.sql` | Tables, indexes, constraints, triggers |

### Service Layer

| File | Purpose |
|------|---------|
| `src/services/reservationService.ts` | Reservation CRUD, validation, time parsing |
| `src/services/analyticsService.ts` | Sales metrics, customer analytics |
| `src/services/cacheService.ts` | Redis operations, cache strategies |
| `src/services/tableVisualizationService.ts` | PNG image generation with Canvas |

### Configuration Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Multi-container orchestration (app, postgres, redis) |
| `Dockerfile` | Optimized production container build |
| `.env.example` | Template for environment variables |
| `tsconfig.json` | TypeScript compiler configuration |
| `package.json` | Dependencies and npm scripts |

### Documentation

| File | Purpose |
|------|---------|
| `README.md` | Quick start, usage examples, architecture |
| `BUSINESS_REQUIREMENTS.md` | Feature specs and business logic |
| `COOLIFY_DEPLOYMENT.md` | Step-by-step deployment to Coolify |
| `TRANSFORMATION_SUMMARY.md` | What changed from old project |
| `PROJECT_STRUCTURE.md` | This file - project organization |

## Key Technologies

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 16
- **Cache**: Redis 7
- **AI**: OpenAI GPT-4o-mini
- **Image**: Canvas (node-canvas)
- **Deployment**: Docker + Coolify

## Data Flow

```
WhatsApp User
    ↓
WhatsApp Business API
    ↓
Webhook (src/index.ts)
    ↓
FieldAgent (src/fieldAgent.ts) ← OpenAI GPT
    ↓
Services Layer (src/services/)
    ↓
Database Layer (src/database/)
    ↓
PostgreSQL / Redis
```

## Development Workflow

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start with Docker Compose**
   ```bash
   docker-compose up -d
   ```

4. **Or run locally**
   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## Clean Architecture

### Layer Separation
- **Presentation**: Express routes, WhatsApp webhook handlers
- **Business Logic**: Services (reservation, analytics)
- **Data Access**: Database layer (db.ts)
- **Infrastructure**: Cache, WhatsApp API, OpenAI

### Dependencies
```
index.ts → fieldAgent.ts → services/ → database/db.ts → PostgreSQL
                        ↘ cacheService.ts → Redis
```

## Environment Variables

All configuration is done via environment variables (see [.env.example](.env.example)):

- `WHATSAPP_*` - WhatsApp Business API
- `OPENAI_API_KEY` - OpenAI API
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `PORT` - Server port

## Testing Strategy

While tests are not yet implemented, recommended structure:

```
tests/
├── unit/
│   ├── services/
│   ├── database/
│   └── utils/
├── integration/
│   ├── api/
│   └── database/
└── e2e/
    └── whatsapp-flows/
```

## Code Style

- TypeScript strict mode enabled
- ESLint + Prettier (optional, not yet configured)
- Clear naming conventions
- Comments for complex logic
- Error handling throughout

## Performance Considerations

- **Caching**: Redis for frequently accessed data
- **Connection Pooling**: PostgreSQL pool (20 connections)
- **Indexes**: Database indexes on frequently queried columns
- **Image Optimization**: Canvas PNG compression
- **Async/Await**: Non-blocking operations throughout

## Security

- ✅ Environment variables for secrets
- ✅ Non-root Docker user
- ✅ PostgreSQL password protection
- ✅ WhatsApp webhook verification
- ✅ No hardcoded credentials
- ✅ Input validation in services

## Monitoring

- Health check endpoint: `GET /health`
- Docker health checks configured
- Console logging (can be extended to structured logging)
- Coolify built-in monitoring

## Scalability

- Stateless application design
- Horizontal scaling ready
- Redis for distributed caching
- PostgreSQL connection pooling
- Docker orchestration support

---

Last updated: 2025-01-24
