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
    },
    {
      type: 'function',
      function: {
        name: 'find_reservations_by_name',
        description: 'Müşteri adına göre aktif rezervasyonları bulur',
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: 'Müşteri adı veya soyadı' }
          },
          required: ['customer_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'cancel_reservation',
        description: 'Rezervasyonu iptal eder (önce find_reservations_by_name ile rezervasyon bulunmalı)',
        parameters: {
          type: 'object',
          properties: {
            reservation_id: { type: 'number', description: 'İptal edilecek rezervasyonun ID\'si' }
          },
          required: ['reservation_id']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_customer_info',
        description: 'Rezervasyonun müşteri bilgilerini (ad, soyad, telefon) günceller',
        parameters: {
          type: 'object',
          properties: {
            reservation_id: { type: 'number', description: 'Güncellenecek rezervasyonun ID\'si' },
            new_name: { type: 'string', description: 'Yeni ad soyad (opsiyonel)' },
            new_phone: { type: 'string', description: 'Yeni telefon numarası (opsiyonel)' }
          },
          required: ['reservation_id']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_reservation_time',
        description: 'Rezervasyonun tarih, saat veya fiyatını günceller',
        parameters: {
          type: 'object',
          properties: {
            reservation_id: { type: 'number', description: 'Güncellenecek rezervasyonun ID\'si' },
            time_slot: { type: 'string', description: 'Yeni saat aralığı (örn: 14-15) - opsiyonel' },
            week_offset: { type: 'number', description: 'Yeni hafta offset - opsiyonel' },
            day_of_week: { type: 'string', description: 'Yeni haftanın günü - opsiyonel' },
            price: { type: 'number', description: 'Yeni fiyat - opsiyonel' }
          },
          required: ['reservation_id']
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
- Rezervasyon oluşturma, iptal, düzenleme işlemleri
- Haftalık rezervasyon tablolarını gösterme (görsel olarak)
- Satış analizleri (günlük, haftalık, aylık saat satışı ve gelir)
- Müşteri analizleri (en sadık müşteriler, en çok iptal yapanlar)

ÖNEMLİ KURALLAR:
- İşlemleri doğrudan yap, onay alma
- Her zaman Türkçe konuş, profesyonel ama samimi ol
- Tarih ve saat bilgilerini dikkatli parse et
- Kullanıcıya işlem sonucunu net bir şekilde bildir

REZERVASYON İPTAL AKIŞI:
1. Kullanıcı "Ahmet Yılmaz için rezervasyonu iptal et" derse
2. Önce find_reservations_by_name ile rezervasyonu bul
3. Bulduğun rezervasyonları listele ve doğru rezervasyonu belirle
4. cancel_reservation ile iptal et
5. Sonucu bildir

REZERVASYON OLUŞTURMA AKIŞI:
1. Kullanıcı bilgileri verdiğinde create_reservation çağır
2. Sonucu bildir

REZERVASYON DÜZENLEME AKIŞI:
1. Kullanıcı "Ahmet Yılmaz'ın telefon numarasını değiştir" derse
2. Önce find_reservations_by_name ile rezervasyonu bul
3. Doğru rezervasyonu belirle
4. Müşteri bilgileri (ad, telefon) değişiyorsa: update_customer_info çağır
5. Tarih, saat, fiyat değişiyorsa: update_reservation_time çağır
6. Sonucu bildir

KURALLAR:
- Saat formatı: "9-10", "14-15", "18-19" gibi
- Haftanın günü: pazartesi, salı, çarşamba, perşembe, cuma, cumartesi, pazar
- "Bu hafta" = week_offset: 0, "Gelecek hafta" = week_offset: 1

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

          // Check for duplicate reservation
          const isDuplicate = await reservationService.checkDuplicateReservation(
            phone,
            startTime,
            endTime
          );

          if (isDuplicate) {
            return `⚠️ Bu müşterinin aynı saatte zaten bir rezervasyonu var!\n\n` +
              `Müşteri: ${args.customer_name}\n` +
              `Telefon: ${phone}\n` +
              `Tarih: ${startTime.toLocaleDateString('tr-TR')}\n` +
              `Saat: ${args.time_slot}\n\n` +
              `❌ Rezervasyon oluşturulamadı.`;
          }

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

        case 'find_reservations_by_name': {
          const reservations = await reservationService.findReservationsByCustomerName(args.customer_name);

          if (reservations.length === 0) {
            return `❌ "${args.customer_name}" adına aktif rezervasyon bulunamadı.`;
          }

          let message = `📋 "${args.customer_name}" için bulunan rezervasyonlar:\n\n`;

          reservations.forEach((res, index) => {
            const startTime = new Date(res.start_time);
            const endTime = new Date(res.end_time);

            message += `${index + 1}. ID: ${res.id}\n`;
            message += `   👤 ${res.customer_name}\n`;
            message += `   📞 ${res.phone_number}\n`;
            message += `   📅 ${startTime.toLocaleDateString('tr-TR')}\n`;
            message += `   ⏰ ${startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-${endTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n`;
            if (res.price) message += `   💰 ${res.price} TL\n`;
            message += '\n';
          });

          return message;
        }

        case 'cancel_reservation': {
          const reservation = await reservationService.cancelReservation(args.reservation_id);

          const startTime = new Date(reservation.start_time);
          const endTime = new Date(reservation.end_time);

          return `✅ Rezervasyon iptal edildi!\n\n` +
            `👤 Müşteri: ${reservation.customer_name}\n` +
            `📞 Telefon: ${reservation.phone_number}\n` +
            `📅 Tarih: ${startTime.toLocaleDateString('tr-TR')}\n` +
            `⏰ Saat: ${startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-${endTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n` +
            `${reservation.price ? `💰 Fiyat: ${reservation.price} TL\n` : ''}`;
        }

        case 'update_customer_info': {
          const reservation = await reservationService.updateCustomerInfo(
            args.reservation_id,
            args.new_name,
            args.new_phone
          );

          const startTime = new Date(reservation.start_time);
          const endTime = new Date(reservation.end_time);

          return `✅ Müşteri bilgileri güncellendi!\n\n` +
            `👤 Yeni Ad: ${reservation.customer_name}\n` +
            `📞 Yeni Telefon: ${reservation.phone_number}\n` +
            `📅 Tarih: ${startTime.toLocaleDateString('tr-TR')}\n` +
            `⏰ Saat: ${startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-${endTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n` +
            `${reservation.price ? `💰 Fiyat: ${reservation.price} TL` : ''}`;
        }

        case 'update_reservation_time': {
          let newStartTime: Date | undefined;
          let newEndTime: Date | undefined;

          if (args.time_slot && args.day_of_week !== undefined && args.week_offset !== undefined) {
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

            newStartTime = reservationService.createReservationTime(reservationDate, startHour);
            newEndTime = reservationService.createReservationTime(reservationDate, endHour);
          }

          const reservation = await reservationService.updateReservationTime(
            args.reservation_id,
            newStartTime,
            newEndTime,
            args.price
          );

          const startTime = new Date(reservation.start_time);
          const endTime = new Date(reservation.end_time);

          return `✅ Rezervasyon güncellendi!\n\n` +
            `👤 Müşteri: ${reservation.customer_name}\n` +
            `📞 Telefon: ${reservation.phone_number}\n` +
            `📅 Yeni Tarih: ${startTime.toLocaleDateString('tr-TR')}\n` +
            `⏰ Yeni Saat: ${startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-${endTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n` +
            `${reservation.price ? `💰 Fiyat: ${reservation.price} TL` : ''}`;
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
