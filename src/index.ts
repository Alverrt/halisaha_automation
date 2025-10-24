import express, { Request, Response } from 'express';
import { config } from './config';
import { WhatsAppClient } from './whatsappClient';
import { FieldAgent } from './fieldAgent';
import { AudioService } from './audioService';
import { runMigration } from './database/migrate';
import { db } from './database/db';

const app = express();
app.use(express.json());

const whatsappClient = new WhatsAppClient();
const fieldAgent = new FieldAgent(whatsappClient);
const audioService = new AudioService();

// Run database migration on startup
runMigration()
  .then(() => console.log('✅ Database is ready'))
  .catch((err) => console.error('❌ Database migration failed:', err));

// Webhook verification endpoint (GET)
app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed');
    res.sendStatus(403);
  }
});

// Webhook endpoint to receive messages (POST)
app.post('/webhook', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Check if it's a WhatsApp message
    if (body.object === 'whatsapp_business_account') {
      // Process each entry
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'messages') {
            const value = change.value;

            // Process messages
            if (value.messages && value.messages.length > 0) {
              for (const message of value.messages) {
                const from = message.from; // Sender's phone number
                const messageId = message.id;
                const messageType = message.type;

                // Mark message as read
                await whatsappClient.markAsRead(messageId);

                let messageText = '';

                // Process text messages
                if (messageType === 'text') {
                  messageText = message.text.body;
                  console.log(`Received text from ${from}: ${messageText}`);
                }
                // Process voice/audio messages
                else if (messageType === 'audio' || messageType === 'voice') {
                  const mediaId = message.audio?.id || message.voice?.id;

                  if (mediaId) {
                    console.log(`Received voice message from ${from}, media ID: ${mediaId}`);

                    try {
                      // Send "typing" indicator
                      await whatsappClient.sendMessage(from, '🎤 Ses kaydınızı dinliyorum...');

                      // Transcribe audio
                      messageText = await audioService.processVoiceMessage(mediaId);
                      console.log(`Transcribed text from ${from}: ${messageText}`);

                      if (!messageText || messageText.trim() === '') {
                        await whatsappClient.sendMessage(from, 'Üzgünüm, ses kaydınızı anlayamadım. Lütfen tekrar deneyin veya yazılı mesaj gönderin.');
                        continue;
                      }
                    } catch (error) {
                      console.error('Error processing voice message:', error);
                      await whatsappClient.sendMessage(from, 'Ses kaydınızı işlerken bir hata oluştu. Lütfen tekrar deneyin.');
                      continue;
                    }
                  } else {
                    console.log(`Voice message from ${from} has no media ID`);
                    continue;
                  }
                }
                // Ignore other message types
                else {
                  console.log(`Ignoring message type: ${messageType} from ${from}`);
                  continue;
                }

                // Get Field Agent response for the text (either from text message or transcribed audio)
                if (messageText && messageText.trim() !== '') {
                  const agentResponse = await fieldAgent.processMessage(from, messageText);
                  await whatsappClient.sendMessage(from, agentResponse);
                }
              }
            }

            // Handle message status updates (optional)
            if (value.statuses && value.statuses.length > 0) {
              console.log('Message status update:', value.statuses);
            }
          }
        }
      }

      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.sendStatus(500);
  }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Token usage analytics endpoint
app.get('/token-usage', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, group_by } = req.query;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (start_date && typeof start_date === 'string') {
      startDate = new Date(start_date);
    }

    if (end_date && typeof end_date === 'string') {
      endDate = new Date(end_date);
    }

    // Get overall statistics
    const totalStats = await db.getTotalTokenUsage(startDate, endDate);

    // Get breakdown by model and type
    const modelStats = await db.getTokenUsageStats(startDate, endDate);

    // Get breakdown by user if requested
    let userStats = null;
    if (group_by === 'user') {
      userStats = await db.getTokenUsageByUser(startDate, endDate);
    }

    res.status(200).json({
      period: {
        start: startDate || 'all_time',
        end: endDate || 'now',
      },
      total: {
        requests: parseInt(totalStats.total_requests) || 0,
        prompt_tokens: parseInt(totalStats.total_prompt_tokens) || 0,
        completion_tokens: parseInt(totalStats.total_completion_tokens) || 0,
        total_tokens: parseInt(totalStats.total_tokens) || 0,
      },
      by_model: modelStats.map((stat: any) => ({
        model: stat.model,
        model_type: stat.model_type,
        requests: parseInt(stat.request_count),
        prompt_tokens: parseInt(stat.total_prompt_tokens) || 0,
        completion_tokens: parseInt(stat.total_completion_tokens) || 0,
        total_tokens: parseInt(stat.total_tokens),
      })),
      ...(userStats && {
        by_user: userStats.map((stat: any) => ({
          user_id: stat.user_id,
          requests: parseInt(stat.request_count),
          prompt_tokens: parseInt(stat.total_prompt_tokens) || 0,
          completion_tokens: parseInt(stat.total_completion_tokens) || 0,
          total_tokens: parseInt(stat.total_tokens),
        })),
      }),
    });
  } catch (error) {
    console.error('Error fetching token usage:', error);
    res.status(500).json({ error: 'Failed to fetch token usage statistics' });
  }
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`⚽ WhatsApp Football Field Reservation Bot is running on port ${PORT}`);
  console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});
