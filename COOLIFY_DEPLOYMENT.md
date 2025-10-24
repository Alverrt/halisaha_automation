# Coolify Deployment Guide

Complete guide for deploying the WhatsApp Football Field Reservation Bot to Coolify.

## Prerequisites

✅ Coolify instance running on your server
✅ Domain name pointed to your Coolify server
✅ WhatsApp Business API credentials
✅ OpenAI API key

## Step-by-Step Deployment

### 1. Create New Application in Coolify

1. Login to your Coolify dashboard
2. Click **+ New Resource**
3. Select **Docker Compose**
4. Choose your server
5. Connect to your Git repository (or use this one)

### 2. Configure Docker Compose

Coolify will automatically detect the `docker-compose.yml` file in your repository.

Make sure these services are configured:
- ✅ **app** (Node.js application)
- ✅ **postgres** (PostgreSQL database)
- ✅ **redis** (Redis cache)

### 3. Set Environment Variables

In Coolify, go to **Environment Variables** and add:

#### Required Variables

```env
# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxx
WHATSAPP_VERIFY_TOKEN=your_custom_verify_token_here

# OpenAI API
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# Database (auto-configured by Coolify)
DATABASE_URL=postgresql://postgres:PASSWORD@postgres:5432/halisaha
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=halisaha

# Redis
REDIS_URL=redis://redis:6379

# Server
PORT=3000
NODE_ENV=production
```

> **Note**: Coolify can auto-generate secure passwords for `POSTGRES_PASSWORD`. Use the "Generate" button.

### 4. Configure Domain & SSL

1. In Coolify, go to **Domains**
2. Add your domain: `bot.yourdomain.com`
3. Coolify will automatically provision SSL via Let's Encrypt
4. Wait for DNS propagation (~5 minutes)

### 5. Configure Health Checks

Coolify will automatically use the health check defined in `docker-compose.yml`:

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

You can also configure in Coolify UI:
- **Health Check Path**: `/health`
- **Health Check Interval**: 30s
- **Health Check Retries**: 3

### 6. Deploy

1. Click **Deploy** button in Coolify
2. Wait for build and deployment (~3-5 minutes)
3. Monitor logs in real-time

### 7. Verify Deployment

Check if all services are running:

```bash
# Via Coolify logs or SSH into server
docker ps | grep halisaha

# Should see 3 containers:
# - whatsapp_halisaha_bot (app)
# - halisaha_postgres (database)
# - halisaha_redis (cache)
```

Test the health endpoint:
```bash
curl https://bot.yourdomain.com/health
# Should return: {"status":"ok"}
```

### 8. Configure WhatsApp Webhook

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Select your WhatsApp Business app
3. Go to **WhatsApp > Configuration**
4. Set webhook:
   - **Callback URL**: `https://bot.yourdomain.com/webhook`
   - **Verify Token**: `[same as WHATSAPP_VERIFY_TOKEN in env]`
5. Subscribe to webhook fields:
   - ✅ messages
   - ✅ message_status (optional)

### 9. Test Your Bot

Send a test message to your WhatsApp Business number:

```
"Merhaba"
```

You should receive a response from the bot!

## Monitoring

### View Logs

In Coolify:
1. Go to your application
2. Click **Logs** tab
3. Select service (app, postgres, redis)
4. View real-time logs

### Check Database

```bash
# SSH into Coolify server
docker exec -it halisaha_postgres psql -U postgres -d halisaha

# List tables
\dt

# Check reservations
SELECT * FROM reservations LIMIT 10;
```

### Check Redis Cache

```bash
docker exec -it halisaha_redis redis-cli

# Check keys
KEYS *

# Check a specific cache
GET week_table:0
```

## Troubleshooting

### Issue: Application won't start

**Solution**: Check logs for database connection errors
```bash
docker logs whatsapp_halisaha_bot
```

Ensure `DATABASE_URL` is correctly formatted:
```
postgresql://[user]:[password]@postgres:5432/[database]
```

### Issue: WhatsApp webhook verification fails

**Solution**:
1. Ensure `WHATSAPP_VERIFY_TOKEN` matches in both Coolify and Meta dashboard
2. Check if domain SSL is working: `https://bot.yourdomain.com/health`
3. Verify webhook URL is accessible publicly

### Issue: Images not sending

**Solution**: Check WhatsApp API permissions and file upload limits
```bash
# Check app logs
docker logs whatsapp_halisaha_bot | grep "Image sent"
```

### Issue: Database migration fails

**Solution**: Run migration manually
```bash
docker exec -it whatsapp_halisaha_bot npm run migrate
```

## Scaling

### Increase Database Performance

Update `docker-compose.yml`:
```yaml
postgres:
  environment:
    POSTGRES_MAX_CONNECTIONS: 100
  command: postgres -c shared_buffers=256MB -c max_connections=100
```

### Add Redis Memory Limit

```yaml
redis:
  command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

## Backup & Restore

### Backup Database

```bash
docker exec halisaha_postgres pg_dump -U postgres halisaha > backup.sql
```

### Restore Database

```bash
cat backup.sql | docker exec -i halisaha_postgres psql -U postgres -d halisaha
```

### Backup Redis (if needed)

```bash
docker exec halisaha_redis redis-cli SAVE
docker cp halisaha_redis:/data/dump.rdb ./redis_backup.rdb
```

## Updates & Maintenance

### Update Application

1. Push changes to Git repository
2. In Coolify, click **Redeploy**
3. Coolify will rebuild and restart containers

### Database Migrations

New migrations run automatically on container start via `src/database/migrate.ts`

### Zero-Downtime Deployment

Coolify supports zero-downtime deployments:
1. Enable **Rolling Update** in Coolify settings
2. Set **Health Check** properly
3. Coolify will start new container before stopping old one

## Performance Optimization

### Enable Coolify CDN

If using Coolify's built-in CDN:
1. Go to **Settings > CDN**
2. Enable CDN for static assets
3. Configure cache rules

### Connection Pooling

Already configured in `src/database/db.ts`:
```typescript
max: 20,
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 2000,
```

### Redis Optimization

Monitor Redis memory:
```bash
docker exec halisaha_redis redis-cli INFO memory
```

## Security Best Practices

✅ Use strong passwords for `POSTGRES_PASSWORD`
✅ Rotate `WHATSAPP_VERIFY_TOKEN` periodically
✅ Keep `OPENAI_API_KEY` secret
✅ Enable Coolify's built-in firewall
✅ Use SSL/HTTPS (auto-configured by Coolify)
✅ Regularly update dependencies

## Cost Optimization

- **Database**: PostgreSQL running in same server (no extra cost)
- **Redis**: In-memory cache (minimal resources)
- **Coolify**: Self-hosted (only server cost)
- **WhatsApp API**: Free tier available
- **OpenAI**: Pay-per-use (gpt-4o-mini is cost-effective)

## Support

If you encounter issues:
1. Check Coolify logs
2. Check application logs
3. Verify environment variables
4. Test health endpoint
5. Review [Coolify documentation](https://coolify.io/docs)

Happy deploying! ⚽🚀
