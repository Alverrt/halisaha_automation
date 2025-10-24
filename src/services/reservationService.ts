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
    endTime: Date,
    excludeReservationId?: number
  ): Promise<boolean> {
    // Check if customer already has a reservation at the same time
    let query = `
      SELECT COUNT(*) as count
      FROM reservations r
      JOIN customers c ON r.customer_id = c.id
      WHERE c.phone_number = $1
      AND r.status = 'active'
      AND tsrange($2::timestamp, $3::timestamp) && tsrange(r.start_time, r.end_time)
    `;

    const params: any[] = [customerPhone, startTime, endTime];

    if (excludeReservationId) {
      query += ' AND r.id != $4';
      params.push(excludeReservationId);
    }

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count) > 0;
  }

  async updateCustomerInfo(
    reservationId: number,
    newName?: string,
    newPhone?: string
  ): Promise<ReservationDetails> {
    const reservation = await db.getReservationById(reservationId);

    if (!reservation) {
      throw new Error('Rezervasyon bulunamadı');
    }

    if (reservation.status === 'cancelled') {
      throw new Error('İptal edilmiş rezervasyon güncellenemez');
    }

    // Update customer info
    await db.updateCustomer(reservation.customer_id, newName, newPhone);

    // Invalidate cache
    await this.invalidateWeekCache(new Date(reservation.start_time));

    // Return updated reservation
    return await db.getReservationById(reservationId);
  }

  async updateReservationTime(
    reservationId: number,
    newStartTime?: Date,
    newEndTime?: Date,
    newPrice?: number
  ): Promise<ReservationDetails> {
    const reservation = await db.getReservationById(reservationId);

    if (!reservation) {
      throw new Error('Rezervasyon bulunamadı');
    }

    if (reservation.status === 'cancelled') {
      throw new Error('İptal edilmiş rezervasyon güncellenemez');
    }

    // Check for conflicts if time is being changed
    if (newStartTime && newEndTime) {
      const hasConflict = await this.checkDuplicateReservation(
        reservation.phone_number,
        newStartTime,
        newEndTime,
        reservationId // Exclude current reservation from conflict check
      );

      if (hasConflict) {
        throw new Error('Bu müşterinin yeni saatte başka bir rezervasyonu var');
      }
    }

    // Update reservation
    await db.updateReservation(reservationId, newStartTime, newEndTime, newPrice);

    // Invalidate cache for both old and new dates
    await this.invalidateWeekCache(new Date(reservation.start_time));
    if (newStartTime) {
      await this.invalidateWeekCache(newStartTime);
    }

    // Return updated reservation
    return await db.getReservationById(reservationId);
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
    // Calculate which week offset this date belongs to
    const targetWeekOffset = this.calculateWeekOffset(date);

    // Invalidate target week and nearby weeks
    for (let offset = targetWeekOffset - 1; offset <= targetWeekOffset + 1; offset++) {
      const cacheKey = cacheService.getWeekTableCacheKey(offset);
      await cacheService.del(cacheKey);
    }
  }

  private calculateWeekOffset(date: Date): number {
    // Calculate how many weeks from now this date is
    const now = new Date();
    const currentDay = now.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay;

    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() + diff);
    thisWeekStart.setHours(0, 0, 0, 0);

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const diffMs = targetDate.getTime() - thisWeekStart.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const weekOffset = Math.floor(diffDays / 7);

    return weekOffset;
  }

  getWeekStartDate(weekOffset: number = 0): Date {
    return this.getWeekRange(weekOffset).startDate;
  }

  getWeekEndDate(weekOffset: number = 0): Date {
    return this.getWeekRange(weekOffset).endDate;
  }

  parseTimeSlot(hour: string): { startHour: number; endHour: number } {
    // Check if it's explicitly marked as morning
    const isMorning = /sabah|morning|am/i.test(hour);

    // Parse formats like "9-10", "14-15", "18:00-19:00", "sabah 9-10"
    const match = hour.match(/(\d+)(?::00)?-(\d+)(?::00)?/);
    if (!match) {
      throw new Error('Invalid time format');
    }

    let startHour = parseInt(match[1]);
    let endHour = parseInt(match[2]);

    // Default behavior: if hour is 6-11, it's already correct (morning or evening edge cases)
    // If hour is 1-5 without "sabah" keyword, treat as early morning (01:00-05:00)
    // If hour is 12-23, use as-is
    // Otherwise, if hour is 6-11 and no "sabah" keyword, convert to PM (add 12)

    if (!isMorning) {
      // Convert to PM (evening) if hour is between 6-11
      if (startHour >= 6 && startHour <= 11) {
        startHour += 12;
      }
      if (endHour >= 6 && endHour <= 11) {
        endHour += 12;
      }
      // Hours 1-5 without "sabah" are treated as early morning (past midnight)
      // Hours 12-23 stay as-is
    }

    return {
      startHour,
      endHour,
    };
  }

  createReservationTime(date: Date, hour: number): Date {
    const result = new Date(date);
    result.setHours(hour, 0, 0, 0);
    return result;
  }
}

export const reservationService = new ReservationService();
