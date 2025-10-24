import { db } from '../database/db';
import { cacheService } from './cacheService';

export interface SalesAnalytics {
  total_reservations: number;
  total_hours: number;
  total_revenue: number;
  period: string;
}

export interface CustomerAnalytics {
  id: number;
  name: string;
  phone_number: string;
  reservation_count: number;
  total_spent?: number;
  cancellation_count?: number;
}

class AnalyticsService {
  async getSalesAnalytics(
    startDate: Date,
    endDate: Date,
    period: string
  ): Promise<SalesAnalytics> {
    const cacheKey = cacheService.getAnalyticsCacheKey(
      'sales',
      startDate.toISOString(),
      endDate.toISOString()
    );

    const cached = await cacheService.get<SalesAnalytics>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await db.getTotalHoursSold(startDate, endDate);

    const analytics: SalesAnalytics = {
      total_reservations: parseInt(result.total_reservations) || 0,
      total_hours: parseFloat(result.total_hours) || 0,
      total_revenue: parseFloat(result.total_revenue) || 0,
      period,
    };

    // Cache for 10 minutes
    await cacheService.set(cacheKey, analytics, 600);

    return analytics;
  }

  async getThisWeekAnalytics(): Promise<SalesAnalytics> {
    const { startDate, endDate } = this.getWeekRange(0);
    return this.getSalesAnalytics(startDate, endDate, 'Bu Hafta');
  }

  async getThisMonthAnalytics(): Promise<SalesAnalytics> {
    const { startDate, endDate } = this.getMonthRange(0);
    return this.getSalesAnalytics(startDate, endDate, 'Bu Ay');
  }

  async getLastMonthAnalytics(): Promise<SalesAnalytics> {
    const { startDate, endDate } = this.getMonthRange(-1);
    return this.getSalesAnalytics(startDate, endDate, 'Geçen Ay');
  }

  async getMostLoyalCustomers(
    limit: number = 10,
    startDate?: Date,
    endDate?: Date
  ): Promise<CustomerAnalytics[]> {
    const cacheKey = startDate && endDate
      ? cacheService.getAnalyticsCacheKey(
          'loyal_customers',
          startDate.toISOString(),
          endDate.toISOString()
        )
      : 'analytics:loyal_customers:all_time';

    const cached = await cacheService.get<CustomerAnalytics[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const customers = await db.getMostLoyalCustomers(limit, startDate, endDate);

    // Cache for 15 minutes
    await cacheService.set(cacheKey, customers, 900);

    return customers;
  }

  async getCustomersWithMostCancellations(limit: number = 10): Promise<CustomerAnalytics[]> {
    const cacheKey = 'analytics:cancellation_customers';

    const cached = await cacheService.get<CustomerAnalytics[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const customers = await db.getCustomersWithMostCancellations(limit);

    // Cache for 15 minutes
    await cacheService.set(cacheKey, customers, 900);

    return customers;
  }

  async getPeakHours(startDate: Date, endDate: Date): Promise<any[]> {
    const cacheKey = cacheService.getAnalyticsCacheKey(
      'peak_hours',
      startDate.toISOString(),
      endDate.toISOString()
    );

    const cached = await cacheService.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const peakHours = await db.getPeakHours(startDate, endDate);

    // Cache for 30 minutes
    await cacheService.set(cacheKey, peakHours, 1800);

    return peakHours;
  }

  formatSalesAnalyticsMessage(analytics: SalesAnalytics): string {
    return `📊 ${analytics.period} Satış Raporu\n\n` +
      `📅 Toplam Rezervasyon: ${analytics.total_reservations}\n` +
      `⏰ Toplam Saat: ${analytics.total_hours.toFixed(1)} saat\n` +
      `💰 Toplam Gelir: ${analytics.total_revenue.toFixed(2)} TL`;
  }

  formatLoyalCustomersMessage(customers: CustomerAnalytics[]): string {
    if (customers.length === 0) {
      return '📊 Henüz sadık müşteri verisi bulunmamaktadır.';
    }

    let message = '🏆 En Sadık Müşteriler\n\n';

    customers.forEach((customer, index) => {
      message += `${index + 1}. ${customer.name}\n`;
      message += `   📞 ${customer.phone_number}\n`;
      message += `   📅 ${customer.reservation_count} rezervasyon\n`;
      if (customer.total_spent) {
        message += `   💰 ${parseFloat(customer.total_spent.toString()).toFixed(2)} TL\n`;
      }
      message += '\n';
    });

    return message;
  }

  formatCancellationCustomersMessage(customers: CustomerAnalytics[]): string {
    if (customers.length === 0) {
      return '📊 İptal kaydı bulunmamaktadır.';
    }

    let message = '⚠️ En Çok İptal Yapan Müşteriler\n\n';

    customers.forEach((customer, index) => {
      message += `${index + 1}. ${customer.name}\n`;
      message += `   📞 ${customer.phone_number}\n`;
      message += `   ❌ ${customer.cancellation_count} iptal\n\n`;
    });

    return message;
  }

  private getWeekRange(weekOffset: number = 0): { startDate: Date; endDate: Date } {
    const now = new Date();
    const currentDay = now.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay;

    const startDate = new Date(now);
    startDate.setDate(now.getDate() + diff + (weekOffset * 7));
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  private getMonthRange(monthOffset: number = 0): { startDate: Date; endDate: Date } {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }
}

export const analyticsService = new AnalyticsService();
