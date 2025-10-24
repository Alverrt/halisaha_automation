import { Pool, QueryResult } from 'pg';
import { config } from '../config';

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }

  async query(text: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async end() {
    await this.pool.end();
  }

  // Customer operations
  async createCustomer(name: string, phoneNumber: string) {
    const query = `
      INSERT INTO customers (name, phone_number)
      VALUES ($1, $2)
      ON CONFLICT (phone_number)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `;
    const result = await this.query(query, [name, phoneNumber]);
    return result.rows[0];
  }

  async getCustomerByPhone(phoneNumber: string) {
    const query = 'SELECT * FROM customers WHERE phone_number = $1';
    const result = await this.query(query, [phoneNumber]);
    return result.rows[0];
  }

  async getCustomerById(id: number) {
    const query = 'SELECT * FROM customers WHERE id = $1';
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  async updateCustomer(id: number, name?: string, phoneNumber?: string) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }

    if (phoneNumber) {
      updates.push(`phone_number = $${paramIndex++}`);
      params.push(phoneNumber);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    params.push(id);
    const query = `
      UPDATE customers
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.query(query, params);
    return result.rows[0];
  }

  // Reservation operations
  async createReservation(
    customerId: number,
    startTime: Date,
    endTime: Date,
    price?: number,
    notes?: string
  ) {
    const query = `
      INSERT INTO reservations (customer_id, start_time, end_time, price, notes, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *
    `;
    const result = await this.query(query, [customerId, startTime, endTime, price, notes]);
    return result.rows[0];
  }

  async getReservationsByDateRange(startDate: Date, endDate: Date) {
    const query = `
      SELECT r.*, c.name as customer_name, c.phone_number
      FROM reservations r
      JOIN customers c ON r.customer_id = c.id
      WHERE r.start_time >= $1 AND r.end_time <= $2
      AND r.status = 'active'
      ORDER BY r.start_time
    `;
    const result = await this.query(query, [startDate, endDate]);
    return result.rows;
  }

  async cancelReservation(id: number) {
    const query = `
      UPDATE reservations
      SET status = 'cancelled'
      WHERE id = $1
      RETURNING *
    `;
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  async getReservationById(id: number) {
    const query = `
      SELECT r.*, c.name as customer_name, c.phone_number
      FROM reservations r
      JOIN customers c ON r.customer_id = c.id
      WHERE r.id = $1
    `;
    const result = await this.query(query, [id]);
    return result.rows[0];
  }

  async updateReservation(
    id: number,
    startTime?: Date,
    endTime?: Date,
    price?: number,
    notes?: string
  ) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (startTime) {
      updates.push(`start_time = $${paramIndex++}`);
      params.push(startTime);
    }

    if (endTime) {
      updates.push(`end_time = $${paramIndex++}`);
      params.push(endTime);
    }

    if (price !== undefined) {
      updates.push(`price = $${paramIndex++}`);
      params.push(price);
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    params.push(id);
    const query = `
      UPDATE reservations
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.query(query, params);
    return result.rows[0];
  }

  // Analytics operations
  async getTotalHoursSold(startDate: Date, endDate: Date) {
    const query = `
      SELECT
        COUNT(*) as total_reservations,
        SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as total_hours,
        SUM(price) as total_revenue
      FROM reservations
      WHERE start_time >= $1
      AND end_time <= $2
      AND status IN ('active', 'completed')
    `;
    const result = await this.query(query, [startDate, endDate]);
    return result.rows[0];
  }

  async getMostLoyalCustomers(limit: number = 10, startDate?: Date, endDate?: Date) {
    const query = startDate && endDate ? `
      SELECT
        c.id,
        c.name,
        c.phone_number,
        COUNT(r.id) as reservation_count,
        SUM(r.price) as total_spent
      FROM customers c
      JOIN reservations r ON c.id = r.customer_id
      WHERE r.status IN ('active', 'completed')
      AND r.start_time >= $1 AND r.end_time <= $2
      GROUP BY c.id
      ORDER BY reservation_count DESC, total_spent DESC
      LIMIT $3
    ` : `
      SELECT
        c.id,
        c.name,
        c.phone_number,
        COUNT(r.id) as reservation_count,
        SUM(r.price) as total_spent
      FROM customers c
      JOIN reservations r ON c.id = r.customer_id
      WHERE r.status IN ('active', 'completed')
      GROUP BY c.id
      ORDER BY reservation_count DESC, total_spent DESC
      LIMIT $1
    `;

    const params = startDate && endDate ? [startDate, endDate, limit] : [limit];
    const result = await this.query(query, params);
    return result.rows;
  }

  async getCustomersWithMostCancellations(limit: number = 10) {
    const query = `
      SELECT
        c.id,
        c.name,
        c.phone_number,
        COUNT(r.id) as cancellation_count
      FROM customers c
      JOIN reservations r ON c.id = r.customer_id
      WHERE r.status = 'cancelled'
      GROUP BY c.id
      ORDER BY cancellation_count DESC
      LIMIT $1
    `;
    const result = await this.query(query, [limit]);
    return result.rows;
  }

  async getPeakHours(startDate: Date, endDate: Date) {
    const query = `
      SELECT
        EXTRACT(HOUR FROM start_time) as hour,
        COUNT(*) as reservation_count
      FROM reservations
      WHERE start_time >= $1
      AND end_time <= $2
      AND status IN ('active', 'completed')
      GROUP BY hour
      ORDER BY reservation_count DESC
    `;
    const result = await this.query(query, [startDate, endDate]);
    return result.rows;
  }
}

export const db = new Database();
