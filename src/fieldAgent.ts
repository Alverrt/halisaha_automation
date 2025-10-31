import { config } from './config';
import { reservationService } from './services/reservationService';
import { analyticsService } from './services/analyticsService';
import { tableVisualizationService } from './services/tableVisualizationService';
import { WhatsAppClient } from './whatsappClient';
import { db } from './database/db';
import { LLMProvider, ToolDefinition, Message } from './providers/types';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ToolRouter } from './toolRouter';

export class FieldAgent {
  private llmProvider: LLMProvider;
  private whatsappClient: WhatsAppClient;
  private toolRouter: ToolRouter;

  private tools: ToolDefinition[] = [
    {
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
    },
    {
      name: 'show_week_table',
      description: 'Haftalık rezervasyon tablosunu görsel olarak gösterir',
      parameters: {
        type: 'object',
        properties: {
          week_offset: { type: 'number', description: 'Hafta offset (0: bu hafta, -1: geçen hafta, -2: 2 hafta önce)' }
        },
        required: ['week_offset']
      }
    },
    {
      name: 'list_week_reservations',
      description: 'Haftalık rezervasyonları numara ile liste halinde gösterir. Kullanıcı "liste halinde", "listele" derse bunu kullan.',
      parameters: {
        type: 'object',
        properties: {
          week_offset: { type: 'number', description: 'Hafta offset (0: bu hafta, -1: geçen hafta)' }
        },
        required: ['week_offset']
      }
    },
    {
      name: 'get_sales_analytics',
      description: 'Bu hafta veya bu ay kaç saat satıldığını, gelir bilgilerini gösterir',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['week', 'month', 'last_month'], description: 'Dönem (week: bu hafta, month: bu ay, last_month: geçen ay)' }
        },
        required: ['period']
      }
    },
    {
      name: 'get_loyal_customers',
      description: 'En sadık müşterileri listeler',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Kaç müşteri gösterilsin (varsayılan: 10)' }
        }
      }
    },
    {
      name: 'get_cancellation_customers',
      description: 'En çok rezervasyon iptali yapan müşterileri listeler',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Kaç müşteri gösterilsin (varsayılan: 10)' }
        }
      }
    },
    {
      name: 'find_reservations_by_name',
      description: 'Müşteri adına göre aktif rezervasyonları bulur',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Müşteri adı veya soyadı' }
        },
        required: ['customer_name']
      }
    },
    {
      name: 'cancel_reservation',
      description: 'Rezervasyonu iptal eder (önce find_reservations_by_name ile rezervasyon bulunmalı)',
      parameters: {
        type: 'object',
        properties: {
          reservation_id: { type: 'number', description: 'İptal edilecek rezervasyonun ID\'si' }
        },
        required: ['reservation_id']
      }
    },
    {
      name: 'cancel_all_week_reservations',
      description: 'Belirtilen haftanın TÜM rezervasyonlarını iptal eder',
      parameters: {
        type: 'object',
        properties: {
          week_offset: { type: 'number', description: 'Hangi haftanın rezervasyonları iptal edilecek (0: bu hafta, 1: gelecek hafta)' }
        },
        required: ['week_offset']
      }
    },
    {
      name: 'get_current_time',
      description: 'İstanbul saat diliminde (GMT+3) şu anki tarihi ve saati döndürür. Kullanıcı "bugün ayın kaçı?", "saat kaç?", "bugün hangi gün?" gibi sorular sorduğunda veya "bu akşam", "yarın", "bugün" gibi zaman ifadelerini anlamak gerektiğinde kullan.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    {
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
    },
    {
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
  ];

  constructor(whatsappClient: WhatsAppClient) {
    // Initialize the appropriate LLM provider based on config
    if (config.llm.provider === 'openai') {
      this.llmProvider = new OpenAIProvider(
        config.llm.openai.apiKey,
        config.llm.openai.model
      );
    } else {
      this.llmProvider = new GeminiProvider(
        config.llm.gemini.project,
        config.llm.gemini.location,
        config.llm.gemini.model
      );
    }
    this.whatsappClient = whatsappClient;

    // Initialize tool router with LLM provider and tools
    this.toolRouter = new ToolRouter(this.llmProvider, this.tools);
  }

  async processMessage(userId: string, message: string): Promise<string> {
    try {
      // Handle special commands
      if (message.trim().toLowerCase() === '/yenile' || message.trim().toLowerCase() === '/reset') {
        db.clearConversationHistory(userId);
        return '✅ Konuşma geçmişi temizlendi. Yeni bir konuşma başlayabilirsiniz.';
      }

      // Get conversation history for this user
      const history = db.getConversationHistory(userId);

      if (process.env.NODE_ENV === 'development') {
        console.log(`\n=== Processing message for user ${userId} ===`);
        console.log(`History length: ${history.length}`);
        if (history.length > 0) {
          console.log('Last 3 messages from history:');
          history.slice(-3).forEach((msg, i) => {
            console.log(`  ${i + 1}. ${msg.role}: ${msg.content?.substring(0, 100) || '[tool call]'}`);
          });
        }
      }

      // Create messages array - either from history or fresh with system prompt
      let messages: Message[];
      if (history.length > 0) {
        // Continue existing conversation
        messages = [...history];
      } else {
        // Start new conversation with system prompt
        messages = [
          {
            role: 'system',
            content: `Halı saha rezervasyon asistanısın. Rezervasyon oluştur/iptal/düzenle, tablo göster, analiz yap.

KURALLAR:
- Her rezervasyon için isim+TELEFON gerekli. Eksikse sor.
- Kullanıcı bilgi verince (telefon vs.) hemen işlemi tamamla!
- Çoklu işlem yapılabilir: "Ahmet 9-10, Mehmet 10-11" → iki rezervasyon
- Tarih/saat sorularında get_current_time kullan
- "bugün", "yarın" için get_current_time çağır

SAAT:
- "9-10" → akşam 21:00-22:00
- "sabah 9-10" → sabah 09:00-10:00
- time_slot: kullanıcının dediği gibi yaz

TARİH:
- "bugün/yarın" → get_current_time ile günü öğren
- "bugün" → week_offset:0, day_of_week: bugünün günü
- "yarın" → week_offset:0, day_of_week: yarının günü
- "pazartesi" → week_offset:0, day_of_week:pazartesi

Türkçe konuş, profesyonel+samimi ol.`,
          }
        ];
      }

      // Add new user message
      messages.push({
        role: 'user',
        content: message,
      });

      // Stage 1: Smart routing - select relevant tools
      const relevantTools = await this.toolRouter.selectRelevantTools(message, 3);

      if (process.env.NODE_ENV === 'development') {
        console.log(`\n=== Smart Tool Routing ===`);
        console.log(`Selected ${relevantTools.length} tools:`, relevantTools.map(t => t.name));
        console.log(`Reduced from ${this.tools.length} total tools`);
      }

      // Stage 2: Call LLM with only relevant tools
      let response = await this.llmProvider.createCompletion(
        messages,
        relevantTools,
        config.llm.maxTokens
      );

      // Log token usage
      let totalTokens = 0;
      const modelName = config.llm.provider === 'openai' ? config.llm.openai.model : config.llm.gemini.model;

      if (response.usage) {
        totalTokens += response.usage.total_tokens;
        await db.logTokenUsage(
          userId,
          modelName,
          'chat',
          response.usage.prompt_tokens,
          response.usage.completion_tokens,
          response.usage.total_tokens,
          'chat_completion'
        ).catch(err => console.error('Failed to log token usage:', err));
      }

      let assistantMessage = response.message;
      messages.push(assistantMessage);

      if (process.env.NODE_ENV === 'development') {
        console.log('Initial response - content:', assistantMessage.content);
        console.log('Initial response - tool_calls:', assistantMessage.tool_calls?.length || 0);
      }

      const maxIterations = 7;
      let iteration = 0;

      while (assistantMessage.tool_calls && iteration < maxIterations) {
        iteration++;

        if (process.env.NODE_ENV === 'development') {
          console.log(`\n--- Iteration ${iteration} ---`);
        }

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type === 'function' && toolCall.function) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

            console.log(`Executing function: ${functionName}`, functionArgs);

            const functionResult = await this.executeFunction(functionName, functionArgs, userId);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: functionResult,
            });
          }
        }

        response = await this.llmProvider.createCompletion(
          messages,
          relevantTools,
          config.llm.maxTokens
        );

        // Log token usage for tool call iteration
        if (response.usage) {
          totalTokens += response.usage.total_tokens;
          await db.logTokenUsage(
            userId,
            modelName,
            'chat',
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
            response.usage.total_tokens,
            'tool_call_iteration'
          ).catch(err => console.error('Failed to log token usage:', err));
        }

        assistantMessage = response.message;
        messages.push(assistantMessage);

        if (process.env.NODE_ENV === 'development') {
          console.log(`After iteration ${iteration} - content:`, assistantMessage.content);
          console.log(`After iteration ${iteration} - tool_calls:`, assistantMessage.tool_calls?.length || 0);
        }
      }

      let finalResponse = assistantMessage.content || 'Üzgünüm, bir yanıt oluşturamadım.';

      if (process.env.NODE_ENV === 'development') {
        console.log('\nFinal response content:', finalResponse);
      }

      // Save updated conversation history
      db.setConversationHistory(userId, messages);

      // Add token usage info in development
      if (process.env.NODE_ENV !== 'production') {
        finalResponse += `\n\n(Tokens: ${totalTokens})`;
      }

      return finalResponse;
    } catch (error) {
      console.error('Error in Field Agent:', error);
      return 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.';
    }
  }

  private async executeFunction(functionName: string, args: any, userId: string): Promise<string> {
    try {
      // Strip namespace prefix if present (e.g., "default_api.function_name" -> "function_name")
      const cleanFunctionName = functionName.includes('.') ? functionName.split('.').pop()! : functionName;

      switch (cleanFunctionName) {
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

        case 'list_week_reservations': {
          const reservations = await reservationService.getReservationsByWeek(args.week_offset);

          if (reservations.length === 0) {
            return '❌ Bu hafta için rezervasyon bulunamadı.';
          }

          let message = `📋 Bu hafta ${reservations.length} rezervasyon var:\n\n`;

          reservations.forEach((res, index) => {
            const startTime = new Date(res.start_time);
            const endTime = new Date(res.end_time);
            const dayName = startTime.toLocaleDateString('tr-TR', { weekday: 'long' });

            message += `${index + 1}. 🆔 ID: ${res.id}\n`;
            message += `   👤 ${res.customer_name}\n`;
            message += `   📞 ${res.phone_number}\n`;
            message += `   📅 ${dayName}, ${startTime.toLocaleDateString('tr-TR')}\n`;
            message += `   ⏰ ${startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}-${endTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n`;
            if (res.price) message += `   💰 ${res.price} TL\n`;
            if (res.notes) message += `   📝 ${res.notes}\n`;
            message += '\n';
          });

          message += `💡 Rezervasyon iptal etmek için: "X numaralı rezervasyonu iptal et"`;

          return message;
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

        case 'cancel_all_week_reservations': {
          const result = await reservationService.cancelAllWeekReservations(args.week_offset);

          if (result.cancelled === 0) {
            return '❌ Bu hafta için iptal edilecek rezervasyon bulunamadı.';
          }

          let message = `✅ ${result.cancelled} rezervasyon iptal edildi!\n\n`;

          result.reservations.forEach((res, index) => {
            const startTime = new Date(res.start_time);
            message += `${index + 1}. ${res.customer_name} - ${startTime.toLocaleDateString('tr-TR')} ${startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}\n`;
          });

          return message;
        }

        case 'get_current_time': {
          const now = new Date();
          const istanbulTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));

          const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
          const dayName = dayNames[istanbulTime.getDay()];

          return `📅 Şu anki tarih ve saat (İstanbul - GMT+3):\n` +
            `📆 Tarih: ${istanbulTime.toLocaleDateString('tr-TR')}\n` +
            `📆 Gün: ${dayName}\n` +
            `⏰ Saat: ${istanbulTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
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

}
