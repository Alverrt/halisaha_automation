import { db } from '../database/db';
import { cacheService } from './cacheService';

export interface ReservationInput {
  customerName: string;
  customerPhone: string;
  startTime: Date;
  endTime: Date;
  price?: number;
  notes?: string;
}

export interface ReservationDetails {
  id: number;
  customer_id: number;
  customer_name: string;
  phone_number: string;
  start_time: Date;
  end_time: Date;
  status: string;
  price?: number;
  notes?: string;
  created_at: Date;
}

class ReservationService {
  async createReservation(input: ReservationInput): Promise<ReservationDetails> {
    // Get or create customer
    let customer = await db.getCustomerByPhone(input.customerPhone);

    if (!customer) {
      customer = await db.createCustomer(input.customerName, input.customerPhone);
    } else if (customer.name !== input.customerName) {
      // Update customer name if different
      customer = await db.createCustomer(input.customerName, input.customerPhone);
    }

    // Create reservation
    const reservation = await db.createReservation(
      customer.id,
      input.startTime,
      input.endTime,
      input.price,
      input.notes
    );

    // Invalidate week table cache
    await this.invalidateWeekCache(input.startTime);

    return {
      ...reservation,
      customer_name: customer.name,
      phone_number: customer.phone_number,
    };
  }

  async getReservationsByWeek(weekOffset: number = 0): Promise<ReservationDetails[]> {
    const { startDate, endDate } = this.getWeekRange(weekOffset);

    const cacheKey = cacheService.getWeekTableCacheKey(weekOffset);
    const cached = await cacheService.get<ReservationDetails[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const reservations = await db.getReservationsByDateRange(startDate, endDate);

    // Cache for 5 minutes
    await cacheService.set(cacheKey, reservations, 300);

    return reservations;
  }

  async findReservationsByCustomerName(customerName: string): Promise<ReservationDetails[]> {
    // Search for active reservations by customer name (case-insensitive, partial match)
    const query = `
      SELECT r.*, c.name as customer_name, c.phone_number
      FROM reservations r
      JOIN customers c ON r.customer_id = c.id
      WHERE LOWER(c.name) LIKE LOWER($1)
      AND r.status = 'active'
      AND r.start_time >= NOW()
      ORDER BY r.start_time
    `;

    const result = await db.query(query, [`%${customerName}%`]);
    return result.rows;
  }

  async cancelReservation(reservationId: number): Promise<ReservationDetails> {
    const reservation = await db.getReservationById(reservationId);

    if (!reservation) {
      throw new Error('Rezervasyon bulunamadı');
    }

    if (reservation.status === 'cancelled') {
      throw new Error('Bu rezervasyon zaten iptal edilmiş');
    }

    await db.cancelReservation(reservationId);

    // Invalidate cache
    await this.invalidateWeekCache(new Date(reservation.start_time));

    return reservation;
  }

  async checkDuplicateReservation(
    customerPhone: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    // Check if customer already has a reservation at the same time
    const query = `
      SELECT COUNT(*) as count
      FROM reservations r
      JOIN customers c ON r.customer_id = c.id
      WHERE c.phone_number = $1
      AND r.status = 'active'
      AND tsrange($2::timestamp, $3::timestamp) && tsrange(r.start_time, r.end_time)
    `;

    const result = await db.query(query, [customerPhone, startTime, endTime]);
    return parseInt(result.rows[0].count) > 0;
  }

  private getWeekRange(weekOffset: number = 0): { startDate: Date; endDate: Date } {
    const now = new Date();
    const currentDay = now.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay; // Monday is start of week

    const startDate = new Date(now);
    startDate.setDate(now.getDate() + diff + (weekOffset * 7));
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  private async invalidateWeekCache(date: Date): Promise<void> {
    // Invalidate current week and nearby weeks
    for (let offset = -1; offset <= 1; offset++) {
      const cacheKey = cacheService.getWeekTableCacheKey(offset);
      await cacheService.del(cacheKey);
    }
  }

  getWeekStartDate(weekOffset: number = 0): Date {
    return this.getWeekRange(weekOffset).startDate;
  }

  getWeekEndDate(weekOffset: number = 0): Date {
    return this.getWeekRange(weekOffset).endDate;
  }

  parseTimeSlot(hour: string): { startHour: number; endHour: number } {
    // Parse formats like "9-10", "14-15", "18:00-19:00"
    const match = hour.match(/(\d+)(?::00)?-(\d+)(?::00)?/);
    if (!match) {
      throw new Error('Invalid time format');
    }

    return {
      startHour: parseInt(match[1]),
      endHour: parseInt(match[2]),
    };
  }

  createReservationTime(date: Date, hour: number): Date {
    const result = new Date(date);
    result.setHours(hour, 0, 0, 0);
    return result;
  }
}

export const reservationService = new ReservationService();
