# Installation Guide

Quick guide to set up the Football Field Reservation Bot locally or on a server.

## Local Development (macOS)

### 1. Install System Dependencies

#### macOS (Homebrew required)

```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

These are required for the `canvas` library to generate images.

#### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

#### Linux (RHEL/CentOS/Fedora)

```bash
sudo yum install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel
```

### 2. Install Node.js Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=your_custom_verify_token

# OpenAI API
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# Database (for local development)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/halisaha
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=halisaha

# Redis
REDIS_URL=redis://localhost:6379

# Server
PORT=3000
NODE_ENV=development
```

### 4. Start Services with Docker

```bash
docker-compose up -d
```

This starts:
- PostgreSQL database
- Redis cache
- Application server

Or start services individually:

```bash
# Start only database and redis
docker-compose up -d postgres redis

# Run app in dev mode
npm run dev
```

### 5. Verify Installation

```bash
# Check health endpoint
curl http://localhost:3000/health

# Should return: {"status":"ok"}
```

## Production Deployment (Docker Only)

### Option 1: Docker Compose (Recommended)

```bash
# Set environment variables
export WHATSAPP_PHONE_NUMBER_ID=xxx
export WHATSAPP_ACCESS_TOKEN=xxx
export WHATSAPP_VERIFY_TOKEN=xxx
export OPENAI_API_KEY=sk-xxx
export POSTGRES_PASSWORD=secure_password

# Deploy
docker-compose up -d

# Check logs
docker-compose logs -f app
```

### Option 2: Coolify

See [COOLIFY_DEPLOYMENT.md](COOLIFY_DEPLOYMENT.md) for detailed Coolify deployment instructions.

## Troubleshooting

### Canvas Installation Fails

**macOS:**
```bash
# Install dependencies
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman

# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Then reinstall
rm -rf node_modules package-lock.json
npm install
```

### Database Connection Fails

Check if PostgreSQL is running:
```bash
docker-compose ps postgres
docker-compose logs postgres
```

Verify connection string:
```bash
# Test connection
docker exec -it halisaha_postgres psql -U postgres -d halisaha
```

### Redis Connection Fails

Check if Redis is running:
```bash
docker-compose ps redis
docker-compose logs redis

# Test connection
docker exec -it halisaha_redis redis-cli ping
# Should return: PONG
```

### Port Already in Use

Change the PORT in `.env`:
```env
PORT=3001
```

And restart:
```bash
docker-compose down
docker-compose up -d
```

### Build Fails

```bash
# Clean build
rm -rf dist
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run database migration
npm run migrate

# Docker commands
docker-compose up -d          # Start all services
docker-compose down           # Stop all services
docker-compose logs -f app    # View app logs
docker-compose restart app    # Restart app
```

## Verifying WhatsApp Webhook

1. Start your server (must be publicly accessible)
2. Go to [Meta for Developers](https://developers.facebook.com/)
3. Select your WhatsApp Business app
4. Navigate to **WhatsApp > Configuration**
5. Configure webhook:
   - **Callback URL**: `https://your-domain.com/webhook`
   - **Verify Token**: Same as `WHATSAPP_VERIFY_TOKEN` in `.env`
6. Subscribe to these webhook fields:
   - ✅ messages
   - ✅ message_status (optional)

## Testing the Bot

Send a test message to your WhatsApp Business number:

```
Merhaba
```

You should receive a response from the bot!

Try creating a reservation:

```
Bu hafta pazartesi 9-10 saatlerini Ahmet Yılmaz için rezerve et. Numarası 0545 403 19 19
```

Try viewing the week table:

```
Bu haftanın tablosunu göster
```

## System Requirements

- **Node.js**: 20.x or higher
- **Docker**: 24.x or higher (for containerized deployment)
- **PostgreSQL**: 16.x
- **Redis**: 7.x
- **RAM**: Minimum 512MB (recommended 1GB+)
- **Storage**: 1GB minimum

## Security Checklist

Before going to production:

- [ ] Change `POSTGRES_PASSWORD` to a strong password
- [ ] Use a secure `WHATSAPP_VERIFY_TOKEN`
- [ ] Never commit `.env` file to git
- [ ] Use HTTPS for webhook endpoint
- [ ] Keep `OPENAI_API_KEY` secret
- [ ] Enable firewall on production server
- [ ] Regularly update dependencies

## Next Steps

- Read [BUSINESS_REQUIREMENTS.md](BUSINESS_REQUIREMENTS.md) for features
- Read [README.md](README.md) for usage examples
- Deploy to production via [COOLIFY_DEPLOYMENT.md](COOLIFY_DEPLOYMENT.md)

## Getting Help

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables
3. Check database connection
4. Test health endpoint
5. Review error messages carefully

Happy coding! ⚽🚀
