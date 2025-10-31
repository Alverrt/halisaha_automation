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
- **LLM Provider** (choose one):
  - OpenAI API key, OR
  - Google Cloud Project with Vertex AI enabled (for Gemini)

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

3. **For Vertex AI/Gemini users**: Set up authentication (see [Vertex AI Setup](#vertex-ai-authentication) below)

4. Start with Docker Compose:
```bash
docker-compose up -d
```

The bot will be available at `http://localhost:3000`

## Vertex AI Authentication

If using `LLM_PROVIDER=gemini`, you need to authenticate with Google Cloud Vertex AI:

### Step 1: Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **IAM & Admin** > **Service Accounts**
3. Click **Create Service Account**
4. Give it a name (e.g., `whatsapp-bot-vertexai`)
5. Grant the following roles:
   - **Vertex AI User** (`roles/aiplatform.user`)
6. Click **Done**

### Step 2: Create and Download Key

1. Click on the created service account
2. Go to the **Keys** tab
3. Click **Add Key** > **Create new key**
4. Select **JSON** format
5. Download the key file and save it as `service-account-key.json` in your project root

### Step 3: Configure Environment

Update your `.env` file:

```env
# LLM Provider - choose 'openai' or 'gemini'
LLM_PROVIDER=gemini

# Vertex AI Configuration
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GEMINI_MODEL=gemini-2.0-flash

# Path to service account key (for Docker)
GOOGLE_APPLICATION_CREDENTIALS_HOST=./service-account-key.json
```

### Step 4: Verify Setup

The service account key will be mounted into the Docker container at `/app/.gcloud/service-account-key.json` and used automatically for authentication.

**Security Note**: Never commit `service-account-key.json` to version control. It's already added to `.gitignore`.

## Deployment to Coolify

Coolify deployment supports both OpenAI and Vertex AI (Gemini). Choose the method that best fits your setup.

### 1. Prepare Your Coolify Server

Ensure Coolify is installed and running on your server.

### 2. Setup for Vertex AI Authentication (Choose One Method)

If using Gemini/Vertex AI, choose the easiest method for your setup:

**Method 1: Using Environment Variable (Easiest - No File Upload!)**

Simply encode your service account key as a base64 string and pass it as an environment variable:

```bash
# On your local machine, encode the key
cat service-account-key.json | base64
```

Then in Coolify, add this environment variable:
```env
GOOGLE_SERVICE_ACCOUNT_KEY_BASE64=<paste-the-base64-string-here>
```

The application will automatically decode it at runtime. ✨ **No file uploads needed!**

**Method 2: Using Docker Secrets (Recommended for Production)**

Add your service account key content to Coolify's **Secrets** feature:

1. Copy the entire contents of `service-account-key.json`
2. In Coolify → Your App → **Environment Variables** → Add new variable:
   - **Key**: `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`
   - **Value**: Paste the entire JSON content
   - **Is Secret**: ✓ Check this box

The app will create the file from this variable at startup.

**Method 3: Manual Upload (If you prefer traditional approach)**

1. SSH into your Coolify server and create credentials directory:
   ```bash
   sudo mkdir -p /opt/app-credentials
   sudo chmod 700 /opt/app-credentials
   ```

2. Upload your service account key:
   ```bash
   # From your local machine
   scp service-account-key.json user@your-coolify-server:/tmp/

   # On server
   sudo mv /tmp/service-account-key.json /opt/app-credentials/
   sudo chmod 600 /opt/app-credentials/service-account-key.json
   ```

3. In Coolify → **Storages** tab → Add storage:
   - **Source Path**: `/opt/app-credentials`
   - **Destination Path**: `/app/.gcloud`

### 3. Create New Application

1. In Coolify dashboard, create a new **Docker Compose** application
2. Point to this repository
3. Set the following environment variables:

```env
# WhatsApp Configuration
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token

# LLM Provider Configuration
LLM_PROVIDER=gemini  # or 'openai'
LLM_MAX_TOKENS=3000

# OpenAI Configuration (if using LLM_PROVIDER=openai)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Vertex AI Configuration (if using LLM_PROVIDER=gemini)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GEMINI_MODEL=gemini-2.0-flash

# Choose ONE of these methods for authentication:
# Method 1: Base64 encoded key (easiest)
GOOGLE_SERVICE_ACCOUNT_KEY_BASE64=<your-base64-encoded-key>

# Method 2: JSON string (alternative)
# GOOGLE_SERVICE_ACCOUNT_KEY_JSON={"type":"service_account",...}

# Method 3: File mount (if using storage volumes)
# GOOGLE_APPLICATION_CREDENTIALS_HOST=/opt/app-credentials/service-account-key.json

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

### 4. Configure WhatsApp Webhook

After deployment, configure your WhatsApp webhook:

```
Webhook URL: https://your-domain.com/webhook
Verify Token: [same as WHATSAPP_VERIFY_TOKEN]
```

### 5. Health Check

Coolify will use the `/health` endpoint to monitor the application.

### 6. Verify Vertex AI Connection (Optional)

To verify that Vertex AI authentication is working in Coolify:

1. Check application logs in Coolify dashboard
2. Look for successful initialization messages
3. Test the bot with a simple message

If you encounter authentication errors, check:
- Service account key file is correctly mounted
- `GOOGLE_APPLICATION_CREDENTIALS` path is correct
- Service account has `Vertex AI User` role
- Vertex AI API is enabled in your GCP project

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
