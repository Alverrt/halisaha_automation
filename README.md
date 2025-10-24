# ⚽ WhatsApp Football Field Reservation Bot

AI-powered WhatsApp bot for managing football field reservations with natural language in Turkish.

## Features

- 📅 **Smart Reservations**: Create reservations via natural language (text or voice)
- 🖼️ **Visual Week Tables**: Generate and send weekly reservation tables as images
- 📊 **Business Analytics**: Track sales, revenue, customer loyalty
- 🎤 **Voice Support**: Accept Turkish voice messages for reservations
- ⚡ **Fast & Cached**: Redis caching for optimal performance
- 🐳 **Fully Dockerized**: Easy deployment with Docker Compose

## Quick Start

### Prerequisites

- Docker & Docker Compose
- WhatsApp Business API account
- OpenAI API key

### Local Development

1. Clone and install:
```bash
git clone <repository>
cd whatsapp_halisaha_bot
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your credentials
```

3. Start with Docker Compose:
```bash
docker-compose up -d
```

The bot will be available at `http://localhost:3000`

## Deployment to Coolify

### 1. Prepare Your Coolify Server

Ensure Coolify is installed and running on your server.

### 2. Create New Application

1. In Coolify dashboard, create a new **Docker Compose** application
2. Point to this repository
3. Set the following environment variables:

```env
# WhatsApp Configuration
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Database Configuration (Coolify will auto-generate these)
DATABASE_URL=postgresql://postgres:your_password@postgres:5432/halisaha
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=halisaha

# Redis Configuration
REDIS_URL=redis://redis:6379

# Server Configuration
PORT=3000
NODE_ENV=production
```

### 3. Configure WhatsApp Webhook

After deployment, configure your WhatsApp webhook:

```
Webhook URL: https://your-domain.com/webhook
Verify Token: [same as WHATSAPP_VERIFY_TOKEN]
```

### 4. Health Check

Coolify will use the `/health` endpoint to monitor the application.

## Usage Examples

### Create Reservation (Turkish)

```
"Bu hafta pazartesi 9-10 saatlerini Ahmet Yılmaz için rezerve et. Numarası 0545 403 19 19"
```

### View Weekly Table

```
"Bu haftanın tablosunu göster"
"2 hafta önceki tabloyu göster"
```

### Analytics

```
"Bu hafta kaç saat sattım?"
"Bu ay ne kadar kazandım?"
"Bana en sadık müşterilerimi listele"
"En çok iptal yapan müşteriler kimler?"
```

## Architecture

```
┌─────────────────┐
│   WhatsApp API  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Express App   │
│  (Port 3000)    │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌──────────┐
│ OpenAI │  │ Services │
│  GPT   │  │ Layer    │
└────────┘  └─────┬────┘
                  │
         ┌────────┼────────┐
         ▼        ▼        ▼
    ┌────────┐┌────────┐┌────────┐
    │ Redis  ││Postgres││ Canvas │
    │ Cache  ││   DB   ││ Images │
    └────────┘└────────┘└────────┘
```

## Database Schema

### Customers
- id, name, phone_number, created_at, updated_at

### Reservations
- id, customer_id, start_time, end_time, status, price, notes, created_at, updated_at

## API Endpoints

- `GET /webhook` - WhatsApp webhook verification
- `POST /webhook` - Receive WhatsApp messages
- `GET /health` - Health check for monitoring

## Performance

- **Redis Caching**: Week tables cached for 5 minutes
- **Analytics Cache**: Cached for 10-15 minutes
- **Database Indexing**: Optimized queries for fast lookups
- **Canvas Rendering**: Fast image generation for visual tables

## Troubleshooting

### Database Connection Issues

```bash
docker-compose logs postgres
docker-compose restart postgres
```

### Redis Connection Issues

```bash
docker-compose logs redis
docker-compose restart redis
```

### View Application Logs

```bash
docker-compose logs app -f
```

## Development

### Run Migrations

```bash
npm run migrate
```

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## License

ISC

## Support

For issues and questions, please open an issue in the repository.
