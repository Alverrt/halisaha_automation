import OpenAI from 'openai';
import { config } from './config';
import { reservationService } from './services/reservationService';
import { analyticsService } from './services/analyticsService';
import { tableVisualizationService } from './services/tableVisualizationService';
import { WhatsAppClient } from './whatsappClient';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { db } from './database/db';

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
        description: 'Yeni bir rezervasyon oluşturur. ZORUNLU: customer_name ve customer_phone. Soyisim opsiyonel, sadece isim yeterli.',
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: 'Müşteri adı (soyisim opsiyonel, sadece isim de olabilir)' },
            customer_phone: { type: 'string', description: 'Müşteri telefon numarası (ZORUNLU - yoksa kullanıcıya sor)' },
            time_slot: { type: 'string', description: 'Saat aralığı. ÖNEMLI: Eğer kullanıcı "sabah" derse "sabah 9-10" yaz, yoksa sadece "9-10" yaz. Örnekler: "9-10", "sabah 9-10", "14-15"' },
            week_offset: { type: 'number', description: 'Hafta offset (0: bu hafta/bugün, 1: gelecek hafta/yarın, -1: geçen hafta/dün). "bugün"=0, "yarın"=0 (bugünün ertesi günü için day_of_week kullan)' },
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
            time_slot: { type: 'string', description: 'Yeni saat aralığı. ÖNEMLI: Eğer kullanıcı "sabah" derse "sabah 9-10" yaz, yoksa sadece "9-10" yaz - opsiyonel' },
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
- Kullanıcı TEK MESAJDA ÇOKLU İŞLEM yapabilir (oluştur, iptal, düzenle karışık)
  Örnekler:
  * "bugün 9-10'a Ahmet yaz, yarın 10-11'e Mehmet yaz" (2 oluşturma)
  * "Ahmet'i sil, Mehmet'in saatini 8-9'a çek" (1 iptal + 1 düzenleme)
  * "bugün 9-10'a Ali yaz, Veli'yi iptal et, Ayşe'nin telefonunu 0532 123 45 67 yap" (1 oluşturma + 1 iptal + 1 düzenleme)
- Her rezervasyon için MUTLAKA TELEFON NUMARASI gerekli. İsim ve telefon yoksa kullanıcıya sor.
- Soyisim opsiyoneldir. Sadece isim yeterli.
- Telefon numarası eksikse: "X kişisi için telefon numarası nedir?" diye sor
- Eksik bilgi tamamlanınca TÜM işlemleri yap (aynı anda birden fazla tool call yapabilirsin)
- Her zaman Türkçe konuş, profesyonel ama samimi ol
- Tarih ve saat bilgilerini dikkatli parse et

GENEL İŞLEM AKIŞI:
1. Kullanıcının mesajını analiz et, kaç tane ne tür işlem istediğini belirle (oluştur/iptal/düzenle)
2. Her işlem için gerekli bilgileri kontrol et:
   - Oluşturma: isim + telefon gerekli
   - İptal/Düzenleme: kişi adı yeterli (find_reservations_by_name ile bulunur)
3. Eksik bilgi varsa kullanıcıya sor, işlemi DURDUR
4. Tüm bilgiler tamsa TÜM işlemleri AYNI ANDA yap (paralel tool calls)
5. Tüm sonuçları toplu bildir

ÇOKLU İŞLEM ÖRNEKLERİ:

Örnek 1 - Çoklu oluşturma:
Kullanıcı: "bugün 9-10'a Ahmet yaz, yarın 10-11'e Mehmet yaz"
→ Telefon eksik, sor: "Ahmet ve Mehmet için telefon numaralarını verir misiniz?"
Kullanıcı: "Ahmet 0532 111 22 33, Mehmet 0532 444 55 66"
→ İki create_reservation çağrısı yap (paralel)
→ "✅ 2 rezervasyon oluşturuldu: Ahmet (bugün 21:00-22:00), Mehmet (yarın 22:00-23:00)"

Örnek 2 - Karışık işlemler:
Kullanıcı: "Ahmet'i sil, Mehmet'in saatini 8-9'a çek"
→ find_reservations_by_name("Ahmet") + find_reservations_by_name("Mehmet") çağır
→ cancel_reservation(ahmet_id) + update_reservation_time(mehmet_id, "8-9") çağır (paralel)
→ "✅ Ahmet iptal edildi. Mehmet'in saati 20:00-21:00 olarak güncellendi."

Örnek 3 - Oluştur + İptal + Düzenle:
Kullanıcı: "bugün 9-10'a Ali yaz, Veli'yi iptal et, Ayşe'nin telefonunu 0532 123 45 67 yap"
→ Ali için telefon sor: "Ali için telefon numarası nedir?"
Kullanıcı: "0532 999 88 77"
→ create_reservation(Ali) + find+cancel(Veli) + find+update_customer_info(Ayşe) çağır (paralel)
→ "✅ Ali oluşturuldu, Veli iptal edildi, Ayşe'nin telefonu güncellendi."

KURALLAR:
- Saat formatı: "9-10", "14-15", "18-19" gibi
- ÇOK ÖNEMLİ - SAAT KURALI:
  * Halı saha maçları genelde akşam oynanır
  * Kullanıcı "9-10" derse bu AKŞAM 21:00-22:00 demektir (otomatik +12 saat eklenir)
  * Kullanıcı "sabah 9-10" derse bu SABAH 09:00-10:00 demektir
  * Eğer kullanıcı "sabah" kelimesini kullandıysa time_slot parametresine "sabah 9-10" şeklinde yaz
  * Kullanıcı sabah dememişse sadece "9-10" yaz, sistem otomatik akşam saatine çevirecek
  * Örnekler:
    - "9-10'a rezervasyon yap" → time_slot: "9-10" (sistem bunu 21:00-22:00 yapar)
    - "sabah 9-10'a rezervasyon yap" → time_slot: "sabah 9-10" (sistem bunu 09:00-10:00 yapar)
    - "14-15'e rezervasyon yap" → time_slot: "14-15" (14:00-15:00 olarak kalır)

- TARİH KURALI:
  * "bugün" veya "bu gün" → Bugünün haftanın hangi günü olduğunu hesapla, week_offset: 0, day_of_week: o gün
  * "yarın" → Yarının haftanın hangi günü olduğunu hesapla, week_offset: 0, day_of_week: yarının günü
  * "pazartesi", "salı" vs → week_offset: 0 (bu hafta), day_of_week: belirtilen gün
  * "gelecek hafta pazartesi" → week_offset: 1, day_of_week: pazartesi

- Haftanın günleri: pazartesi, salı, çarşamba, perşembe, cuma, cumartesi, pazar

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
        max_tokens: 3000,
      });

      // Log token usage
      if (response.usage) {
        await db.logTokenUsage(
          userId,
          'gpt-4o-mini',
          'chat',
          response.usage.prompt_tokens,
          response.usage.completion_tokens,
          response.usage.total_tokens,
          'chat_completion'
        ).catch(err => console.error('Failed to log token usage:', err));
      }

      let assistantMessage = response.choices[0].message;
      session.messages.push(assistantMessage);

      const maxIterations = 7;
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
          max_tokens: 3000,
        });

        // Log token usage for tool call iteration
        if (response.usage) {
          await db.logTokenUsage(
            userId,
            'gpt-4o-mini',
            'chat',
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
            'tool_call_iteration'
          ).catch(err => console.error('Failed to log token usage:', err));
        }

        assistantMessage = response.choices[0].message;
        session.messages.push(assistantMessage);
      }

      if (session.messages.length > 21) {
        const systemMessage = session.messages[0];
        let recentMessages = session.messages.slice(-20);

        // Remove orphaned tool messages (tool messages without preceding tool_calls)
        recentMessages = this.cleanOrphanedToolMessages(recentMessages);

        session.messages = [systemMessage, ...recentMessages];
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

  private cleanOrphanedToolMessages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
    const cleaned: ChatCompletionMessageParam[] = [];
    const validToolCallIds = new Set<string>();

    // First pass: collect all tool_call_ids from assistant messages
    for (const msg of messages) {
      if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
        for (const toolCall of msg.tool_calls) {
          validToolCallIds.add(toolCall.id);
        }
      }
    }

    // Second pass: only keep tool messages that have a valid tool_call_id
    for (const msg of messages) {
      if (msg.role === 'tool') {
        // Only keep tool messages that reference a valid tool_call_id
        if ('tool_call_id' in msg && validToolCallIds.has(msg.tool_call_id)) {
          cleaned.push(msg);
        }
      } else {
        cleaned.push(msg);
      }
    }

    return cleaned;
  }
}
