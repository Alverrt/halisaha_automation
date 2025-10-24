# Business Requirements - Football Field Reservation Management Bot

## Overview
WhatsApp AI bot for football field owners to manage reservations through natural language interactions in Turkish.

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
- WhatsApp Business API integration
- OpenAI API for NLP (Turkish language support)
- Canvas for image generation
- Redis for caching layer
- PostgreSQL or SQLite for reservation and customer data
- Node.js 20 runtime
- Turkish language support throughout

## Future Enhancements (Nice to Have)
- Automated reminder messages to customers
- Payment tracking
- Multi-field management
- Customer self-service booking
- Recurring reservations
- Weather-based suggestions

---
*Note: This document will be updated as requirements evolve*
