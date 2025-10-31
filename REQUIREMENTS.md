# Requirements - Football Field Reservation Management Bot

## Overview
Multi-tenant WhatsApp AI bot for football field owners to manage reservations through natural language interactions in Turkish. Each tenant (field owner) operates independently with their own WhatsApp Business phone number and isolated data.

## Multi-Tenancy Architecture

### Tenant Identification
- **Primary Identifier**: WhatsApp Business phone number
- **Tenant Isolation**: Each tenant has completely isolated data (reservations, customers, analytics)
- **Tenant Configuration**: Each tenant has their own settings, pricing, and business hours
- **Scalability**: System supports unlimited tenants on single deployment

### Tenant Management
- **Onboarding**: New tenants registered with their WhatsApp Business phone number
- **Data Segregation**: All database queries filtered by tenant phone number
- **Independent Operations**: Each tenant operates independently without visibility to other tenants
- **Configuration**: Per-tenant settings stored separately:
  - Business hours
  - Pricing rules
  - Field capacity
  - Custom messages/templates
  - AI model preferences

### Tenant Data Model
Each tenant's data is isolated by their phone number:
- Reservations scoped to tenant
- Customer lists scoped to tenant
- Analytics scoped to tenant
- Cache keys prefixed with tenant identifier

## Core Features

### 1. Reservation Table Overview (Flexible Timeframe)
- **Requirement**: Business owner can request reservation table for any timeframe
- **Timeframe Options**:
  - Current week
  - Historical data (e.g., "2 hafta önce" / 2 weeks ago)
  - Custom date ranges
- **Output**: Visual table showing reserved and available time slots
- **Delivery**: Image generated using canvas (for quick viewing in WhatsApp)
- **Performance**: Must be fast - implement caching mechanism
- **Example Queries**:
  - "Bu haftanın tablosunu göster" (Show this week's table)
  - "2 hafta önceki tabloyu göster" (Show the table from 2 weeks ago)
  - "Geçen ayın tablosunu göster" (Show last month's table)

### 2. Natural Language Reservation Management
- **Input Methods**:
  - Text messages
  - Voice recordings
- **Language**: Turkish
- **AI Model**: OpenAI (similar to current project implementation)
- **Example Commands**:
  - "Bu hafta 9-10 saatlerini Ahmet Aydın için rezerve et. Numarası da 0545 403 19 19"
  - (Reserve 9-10 hours this week for Ahmet Aydın. Phone number 0545 403 19 19)
- **Extracted Information**:
  - Time slot
  - Customer name
  - Customer phone number
  - Date/week reference

### 3. Business Analytics & Reporting (Adjustable Timeframe)
- **Sales Analytics**:
  - "Bu hafta kaç saat sattım?" (How many hours did I sell this week?)
  - "Bu ay kaç saat sattım?" (How many hours did I sell this month?)
  - "Geçen ay ne kadar kazandım?" (How much did I earn last month?)
  - Timeframe: Adjustable (week, month, custom range)
  - Metrics: total hours sold, revenue, occupancy rate

- **Customer Loyalty Analysis**:
  - "Bana en sadık müşterilerimi listele" (List my most loyal customers)
  - Metrics: reservation frequency, total bookings, lifetime value
  - Timeframe: Adjustable

- **Cancellation Tracking**:
  - "En çok rezervasyon iptali yapan müşteriler hangileri" (Which customers cancel most frequently)
  - Metrics: cancellation rate, cancellation count
  - Timeframe: Adjustable

- **Additional Analytics**:
  - Peak hours analysis by timeframe
  - Revenue tracking (daily, weekly, monthly)
  - Occupancy rate trends
  - Customer retention metrics
  - Popular time slots by period
  - Comparative analytics (week-over-week, month-over-month)

### 4. Reservation Operations
- Create reservations
- Update/modify reservations
- Cancel reservations
- Query reservation status
- Customer information management

## Technical Requirements

### Agent Architecture (LangChain-based)
- **Agent Type**: ReAct (Reasoning and Acting) pattern for decision-making
- **Tool System**: LangChain tools for all business operations
  - Reservation management tools (create, update, cancel, query)
  - Analytics and reporting tools
  - Customer management tools
  - Table generation tools
- **Memory**: ConversationBufferMemory for context retention
- **Prompt Engineering**:
  - System prompts optimized for Turkish language
  - Few-shot examples for common reservation scenarios
  - Dynamic prompt templates per tenant
- **Agent Executor**: Custom execution flow with error handling and retries
- **Observability & Testing**: LangSmith integration
  - Automatic tracing of all agent interactions
  - Conversation replay and debugging
  - Tool call inspection and error tracking
  - Performance metrics and latency monitoring
  - Test suite with Vitest/Jest integration
  - Evaluation datasets for Turkish conversation patterns
  - A/B testing for prompt variations
  - Production monitoring and alerts

### Multi-Tenancy Implementation
- **Tenant Context**: Request middleware extracts tenant from WhatsApp phone number
- **Database Schema**: All tables include `tenant_phone` column for data isolation
- **Row-Level Security**: Database policies enforce tenant-based data access
- **Cache Strategy**: Redis keys prefixed with tenant identifier (e.g., `tenant:+905551234567:reservations:week:0`)
- **Query Filtering**: All queries automatically filtered by tenant context
- **Tenant Registry**: Central table mapping phone numbers to tenant configurations
- **Migration Support**: Database migrations handle multi-tenant schema
- **Agent Isolation**: Each tenant gets isolated agent instance with tenant-scoped tools

### Deployment & Infrastructure
- **Deployment Platform**: Coolify
- **Fully Dockerized**: Complete Docker containerization for easy deployment
- **Docker Compose**: Multi-container orchestration (app, database, redis cache)
- **Environment Variables**: All configuration via .env files (Coolify-managed)
- **Health Check Endpoint**: `/health` endpoint for Coolify monitoring
- **Persistent Storage**: Volumes for database and uploaded files
- **Port Configuration**: Configurable via PORT environment variable
- **Auto-restart**: Container restart policies for reliability

### Coolify-Specific Requirements
- Dockerfile optimized for Coolify deployment
- Multi-stage build for smaller image size
- Health check configuration in docker-compose.yml
- Volume mounts for data persistence
- Redis for caching (separate container)
- PostgreSQL/SQLite for database (separate container if PostgreSQL)
- All secrets and API keys managed via Coolify environment variables
- Webhook endpoint exposed for WhatsApp Business API

### Technology Stack
- **Agent Framework**: LangChain for agent orchestration and engineering
  - Structured agent workflows with LangChain Agent Executor
  - Tool/function calling abstraction layer
  - Memory management for conversation context
  - Prompt templates and chain composition
  - Multi-model support (OpenAI, Google Gemini) through unified interface
  - Streaming responses support
  - Agent observability and debugging
- **Testing & Evaluation**: LangSmith platform
  - `LANGSMITH_API_KEY` and `LANGSMITH_TRACING=true` for automatic tracing
  - Vitest integration with `langsmith/vitest` for test-driven evaluation
  - `@traceable` decorator for function-level tracing
  - `wrapOpenAI()` for LLM call tracing
  - Evaluation datasets synced from test cases
  - Custom evaluators for Turkish language accuracy
  - Test caching for deterministic testing
  - Production trace monitoring
- WhatsApp Business API integration (multi-tenant webhook handling)
- OpenAI API / Google Gemini for NLP (Turkish language support)
- Canvas for image generation
- Redis for multi-tenant caching layer
- PostgreSQL for multi-tenant reservation and customer data
- Turkish language support throughout
- Row-level security for tenant isolation

## Testing & Quality Assurance

### Conversation Testing Strategy
- **Test Framework**: Vitest with LangSmith integration
- **Test Structure**:
  - Unit tests for individual tools (`.test.ts` files)
  - Evaluation tests for conversation flows (`.eval.ts` files)
  - Integration tests with WhatsApp webhook simulation
- **Test Coverage Areas**:
  - Turkish language understanding and response generation
  - Tool selection and parameter extraction
  - Multi-turn conversation context retention
  - Error handling and recovery
  - Tenant isolation verification
- **Evaluation Datasets**:
  - Common reservation scenarios (create, update, cancel)
  - Edge cases (ambiguous dates, incomplete information)
  - Analytics queries in Turkish
  - Multi-step conversations
- **Quality Metrics**:
  - Tool calling accuracy (correct tool selection rate)
  - Response correctness (assertion-based)
  - Latency tracking (P50, P95, P99)
  - Turkish language fluency scores

### LangSmith Test Configuration
```typescript
// vitest.config.ts
test: {
  include: ["**/*.eval.ts"],
  reporters: ["langsmith/vitest/reporter"],
  setupFiles: ["dotenv/config"],
}
```

### Environment Variables for Testing
```env
LANGSMITH_API_KEY=<your-key>
LANGSMITH_TRACING=true
OPENAI_API_KEY=<your-key>
GOOGLE_CLOUD_PROJECT=<your-project>
```

## Future Enhancements (Nice to Have)
- Automated reminder messages to customers
- Payment tracking
- Multi-field management (per tenant)
- Customer self-service booking
- Recurring reservations
- Weather-based suggestions
- Tenant dashboard/portal for configuration
- Usage-based pricing/billing per tenant
- Tenant analytics and insights
- White-label branding per tenant
- Advanced conversation analytics with LangSmith
- Automated regression testing for prompt changes
- Synthetic data generation for evaluation datasets

---
*Note: This document will be updated as requirements evolve*
