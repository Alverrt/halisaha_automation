import OpenAI from 'openai';
import { config } from './config';
import { reservationService } from './services/reservationService';
import { analyticsService } from './services/analyticsService';
import { tableVisualizationService } from './services/tableVisualizationService';
import { WhatsAppClient } from './whatsappClient';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export class FieldAgent {
  private openai: OpenAI;
  private conversationHistory: Map<string, { messages: ChatCompletionMessageParam[]; lastActivity: number }>;
  private whatsappClient: WhatsAppClient;
  private readonly SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  private tools: ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'create_reservation',
        description: 'Yeni bir rezervasyon oluşturur',
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: 'Müşteri adı' },
            customer_phone: { type: 'string', description: 'Müşteri telefon numarası' },
            time_slot: { type: 'string', description: 'Saat aralığı (örn: 9-10, 14-15)' },
            week_offset: { type: 'number', description: 'Hafta offset (0: bu hafta, 1: gelecek hafta, -1: geçen hafta)' },
            day_of_week: { type: 'string', description: 'Haftanın günü (pazartesi, salı, çarşamba, perşembe, cuma, cumartesi, pazar)' },
            price: { type: 'number', description: 'Rezervasyon fiyatı (opsiyonel)' },
            notes: { type: 'string', description: 'Ek notlar (opsiyonel)' }
          },
          required: ['customer_name', 'customer_phone', 'time_slot', 'week_offset', 'day_of_week']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'show_week_table',
        description: 'Haftalık rezervasyon tablosunu görsel olarak gösterir',
        parameters: {
          type: 'object',
          properties: {
            week_offset: { type: 'number', description: 'Hafta offset (0: bu hafta, -1: geçen hafta, -2: 2 hafta önce)' }
          },
          required: ['week_offset']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_sales_analytics',
        description: 'Bu hafta veya bu ay kaç saat satıldığını, gelir bilgilerini gösterir',
        parameters: {
          type: 'object',
          properties: {
            period: { type: 'string', enum: ['week', 'month', 'last_month'], description: 'Dönem (week: bu hafta, month: bu ay, last_month: geçen ay)' }
          },
          required: ['period']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_loyal_customers',
        description: 'En sadık müşterileri listeler',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Kaç müşteri gösterilsin (varsayılan: 10)' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_cancellation_customers',
        description: 'En çok rezervasyon iptali yapan müşterileri listeler',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Kaç müşteri gösterilsin (varsayılan: 10)' }
          }
        }
      }
    }
  ];

  constructor(whatsappClient: WhatsAppClient) {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.conversationHistory = new Map();
    this.whatsappClient = whatsappClient;

    setInterval(() => this.cleanupOldSessions(), 60 * 1000);
  }

  private cleanupOldSessions(): void {
    const now = Date.now();
    for (const [userId, session] of this.conversationHistory.entries()) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        this.conversationHistory.delete(userId);
        console.log(`Session expired for user: ${userId}`);
      }
    }
  }

  async processMessage(userId: string, message: string): Promise<string> {
    try {
      const now = Date.now();
      let session = this.conversationHistory.get(userId);

      if (!session || (now - session.lastActivity > this.SESSION_TIMEOUT)) {
        session = {
          messages: [
            {
              role: 'system',
              content: `Sen bir halı saha rezervasyon yönetim asistanısın. WhatsApp üzerinden halı saha sahiplerine yardımcı oluyorsun.

GÖREVLER:
- Rezervasyon oluşturma, güncelleme ve iptal işlemleri
- Haftalık rezervasyon tablolarını gösterme (görsel olarak)
- Satış analizleri (günlük, haftalık, aylık saat satışı ve gelir)
- Müşteri analizleri (en sadık müşteriler, en çok iptal yapanlar)

ÖNEMLİ KURALLAR:
- Her zaman Türkçe konuş
- Profesyonel ama samimi ol
- WhatsApp için kısa ve öz cevaplar ver
- Tarih ve saat bilgilerini dikkatli parse et
- Emoji kullanabilirsin ama abartma

REZERVASYON OLUŞTURMA KURALLARI:
- Müşteri adı ve telefon numarası mutlaka gerekli
- Saat formatı: "9-10", "14-15" gibi
- Haftanın günü: pazartesi, salı, çarşamba, perşembe, cuma, cumartesi, pazar
- "Bu hafta" = week_offset: 0
- "Gelecek hafta" = week_offset: 1
- "Geçen hafta" = week_offset: -1

TABLO GÖSTERME:
- "Bu haftanın tablosu" = week_offset: 0
- "2 hafta önce" = week_offset: -2
- Tablo görseli otomatik olarak WhatsApp'a gönderilir

ÖRNEKLER:
- "Bu hafta pazartesi 9-10 saatlerini Ahmet Yılmaz için rezerve et. Numarası 0545 403 19 19"
  → create_reservation ile customer_name: "Ahmet Yılmaz", customer_phone: "05454031919", time_slot: "9-10", week_offset: 0, day_of_week: "pazartesi"

- "Bu haftanın tablosunu göster"
  → show_week_table ile week_offset: 0

- "Bu ay kaç saat sattım?"
  → get_sales_analytics ile period: "month"

Kullanıcıya her zaman yardımcı ol ve net bilgi ver.`,
            },
          ],
          lastActivity: now,
        };
        this.conversationHistory.set(userId, session);
      }

      session.lastActivity = now;

      session.messages.push({
        role: 'user',
        content: message,
      });

      let response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: session.messages,
        tools: this.tools,
        tool_choice: 'auto',
        max_tokens: 1500,
      });

      let assistantMessage = response.choices[0].message;
      session.messages.push(assistantMessage);

      const maxIterations = 3;
      let iteration = 0;

      while (assistantMessage.tool_calls && iteration < maxIterations) {
        iteration++;

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type === 'function' && toolCall.function) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

            console.log(`Executing function: ${functionName}`, functionArgs);

            const functionResult = await this.executeFunction(functionName, functionArgs, userId);

            session.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: functionResult,
            });
          }
        }

        response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: session.messages,
          tools: this.tools,
          tool_choice: 'auto',
          max_tokens: 1500,
        });

        assistantMessage = response.choices[0].message;
        session.messages.push(assistantMessage);
      }

      if (session.messages.length > 21) {
        session.messages = [session.messages[0], ...session.messages.slice(-20)];
      }

      this.conversationHistory.set(userId, session);

      return assistantMessage.content || 'Üzgünüm, bir yanıt oluşturamadım.';
    } catch (error) {
      console.error('Error in Field Agent:', error);
      return 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.';
    }
  }

  private async executeFunction(functionName: string, args: any, userId: string): Promise<string> {
    try {
      switch (functionName) {
        case 'create_reservation': {
          const dayMap: { [key: string]: number } = {
            'pazartesi': 0, 'salı': 1, 'çarşamba': 2, 'perşembe': 3,
            'cuma': 4, 'cumartesi': 5, 'pazar': 6
          };

          const dayOffset = dayMap[args.day_of_week.toLowerCase()];
          if (dayOffset === undefined) {
            return '❌ Geçersiz gün. Lütfen pazartesi-pazar arası bir gün belirtin.';
          }

          const weekStartDate = reservationService.getWeekStartDate(args.week_offset);
          const reservationDate = new Date(weekStartDate);
          reservationDate.setDate(weekStartDate.getDate() + dayOffset);

          const { startHour, endHour } = reservationService.parseTimeSlot(args.time_slot);

          const startTime = reservationService.createReservationTime(reservationDate, startHour);
          const endTime = reservationService.createReservationTime(reservationDate, endHour);

          const phone = args.customer_phone.replace(/\s+/g, '');

          const reservation = await reservationService.createReservation({
            customerName: args.customer_name,
            customerPhone: phone,
            startTime,
            endTime,
            price: args.price,
            notes: args.notes,
          });

          return `✅ Rezervasyon oluşturuldu!\n\n` +
            `👤 Müşteri: ${reservation.customer_name}\n` +
            `📞 Telefon: ${reservation.phone_number}\n` +
            `📅 Tarih: ${startTime.toLocaleDateString('tr-TR')}\n` +
            `⏰ Saat: ${args.time_slot}\n` +
            `${args.price ? `💰 Fiyat: ${args.price} TL\n` : ''}` +
            `${args.notes ? `📝 Not: ${args.notes}` : ''}`;
        }

        case 'show_week_table': {
          const reservations = await reservationService.getReservationsByWeek(args.week_offset);
          const weekStartDate = reservationService.getWeekStartDate(args.week_offset);

          const imageBuffer = await tableVisualizationService.generateWeekTableWithTitle(
            reservations,
            weekStartDate,
            args.week_offset
          );

          // Send image via WhatsApp
          await this.whatsappClient.sendImage(userId, imageBuffer);

          return `📊 Tablo gönderildi! ${reservations.length} rezervasyon bulundu.`;
        }

        case 'get_sales_analytics': {
          let analytics;
          if (args.period === 'week') {
            analytics = await analyticsService.getThisWeekAnalytics();
          } else if (args.period === 'month') {
            analytics = await analyticsService.getThisMonthAnalytics();
          } else if (args.period === 'last_month') {
            analytics = await analyticsService.getLastMonthAnalytics();
          } else {
            return '❌ Geçersiz dönem. week, month veya last_month kullanın.';
          }

          return analyticsService.formatSalesAnalyticsMessage(analytics);
        }

        case 'get_loyal_customers': {
          const customers = await analyticsService.getMostLoyalCustomers(args.limit || 10);
          return analyticsService.formatLoyalCustomersMessage(customers);
        }

        case 'get_cancellation_customers': {
          const customers = await analyticsService.getCustomersWithMostCancellations(args.limit || 10);
          return analyticsService.formatCancellationCustomersMessage(customers);
        }

        default:
          return `❌ Bilinmeyen fonksiyon: ${functionName}`;
      }
    } catch (error: any) {
      console.error(`Error executing function ${functionName}:`, error);
      return `❌ Hata: ${error.message || 'Fonksiyon çalıştırılamadı'}`;
    }
  }

  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
    console.log(`Conversation history cleared for user: ${userId}`);
  }
}
