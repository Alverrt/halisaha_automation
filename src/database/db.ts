import { Pool, QueryResult } from 'pg';
import { config } from '../config';

class Database {
  public pool: Pool;

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
  async createCustomer(name: string, phoneNumber: string, tenantId: number) {
    const query = `
      INSERT INTO customers (name, phone_number, tenant_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (phone_number, tenant_id)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `;
    const result = await this.query(query, [name, phoneNumber, tenantId]);
    return result.rows[0];
  }

  async getCustomerByPhone(phoneNumber: string, tenantId: number) {
    const query = 'SELECT * FROM customers WHERE phone_number = $1 AND tenant_id = $2';
    const result = await this.query(query, [phoneNumber, tenantId]);
    return result.rows[0];
  }

  async getCustomerById(id: number, tenantId: number) {
    const query = 'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2';
    const result = await this.query(query, [id, tenantId]);
    return result.rows[0];
  }

  async updateCustomer(id: number, tenantId: number, name?: string, phoneNumber?: string) {
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
    params.push(tenantId);
    const query = `
      UPDATE customers
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await this.query(query, params);
    return result.rows[0];
  }

  // Reservation operations
  async createReservation(
    customerId: number,
    tenantId: number,
    startTime: Date,
    endTime: Date,
    price?: number,
    notes?: string
  ) {
    const query = `
      INSERT INTO reservations (customer_id, tenant_id, start_time, end_time, price, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'active')
      RETURNING *
    `;
    const result = await this.query(query, [customerId, tenantId, startTime, endTime, price, notes]);
    return result.rows[0];
  }

  async getReservationsByDateRange(startDate: Date, endDate: Date, tenantId: number) {
    const query = `
      SELECT r.*, c.name as customer_name, c.phone_number
      FROM reservations r
      JOIN customers c ON r.customer_id = c.id
      WHERE r.start_time >= $1 AND r.end_time <= $2
      AND r.tenant_id = $3
      AND r.status = 'active'
      ORDER BY r.start_time
    `;
    const result = await this.query(query, [startDate, endDate, tenantId]);
    return result.rows;
  }

  async cancelReservation(id: number, tenantId: number) {
    const query = `
      UPDATE reservations
      SET status = 'cancelled'
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `;
    const result = await this.query(query, [id, tenantId]);
    return result.rows[0];
  }

  async getReservationById(id: number, tenantId: number) {
    const query = `
      SELECT r.*, c.name as customer_name, c.phone_number
      FROM reservations r
      JOIN customers c ON r.customer_id = c.id
      WHERE r.id = $1 AND r.tenant_id = $2
    `;
    const result = await this.query(query, [id, tenantId]);
    return result.rows[0];
  }

  async updateReservation(
    id: number,
    tenantId: number,
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
    params.push(tenantId);
    const query = `
      UPDATE reservations
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    const result = await this.query(query, params);
    return result.rows[0];
  }

  // Analytics operations
  async getTotalHoursSold(startDate: Date, endDate: Date, tenantId: number) {
    const query = `
      SELECT
        COUNT(*) as total_reservations,
        SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600) as total_hours,
        SUM(price) as total_revenue
      FROM reservations
      WHERE start_time >= $1
      AND end_time <= $2
      AND tenant_id = $3
      AND status IN ('active', 'completed')
    `;
    const result = await this.query(query, [startDate, endDate, tenantId]);
    return result.rows[0];
  }

  async getMostLoyalCustomers(tenantId: number, limit: number = 10, startDate?: Date, endDate?: Date) {
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
      AND r.tenant_id = $1
      AND r.start_time >= $2 AND r.end_time <= $3
      GROUP BY c.id
      ORDER BY reservation_count DESC, total_spent DESC
      LIMIT $4
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
      AND r.tenant_id = $1
      GROUP BY c.id
      ORDER BY reservation_count DESC, total_spent DESC
      LIMIT $2
    `;

    const params = startDate && endDate ? [tenantId, startDate, endDate, limit] : [tenantId, limit];
    const result = await this.query(query, params);
    return result.rows;
  }

  async getCustomersWithMostCancellations(tenantId: number, limit: number = 10) {
    const query = `
      SELECT
        c.id,
        c.name,
        c.phone_number,
        COUNT(r.id) as cancellation_count
      FROM customers c
      JOIN reservations r ON c.id = r.customer_id
      WHERE r.status = 'cancelled'
      AND r.tenant_id = $1
      GROUP BY c.id
      ORDER BY cancellation_count DESC
      LIMIT $2
    `;
    const result = await this.query(query, [tenantId, limit]);
    return result.rows;
  }

  async getPeakHours(startDate: Date, endDate: Date, tenantId: number) {
    const query = `
      SELECT
        EXTRACT(HOUR FROM start_time) as hour,
        COUNT(*) as reservation_count
      FROM reservations
      WHERE start_time >= $1
      AND end_time <= $2
      AND tenant_id = $3
      AND status IN ('active', 'completed')
      GROUP BY hour
      ORDER BY reservation_count DESC
    `;
    const result = await this.query(query, [startDate, endDate, tenantId]);
    return result.rows;
  }

  // Token usage tracking operations
  async logTokenUsage(
    userId: string,
    model: string,
    modelType: 'chat' | 'whisper' | 'tts' | 'image',
    promptTokens: number | null,
    completionTokens: number | null,
    totalTokens: number,
    tenantId?: number,
    requestType?: string
  ) {
    const query = `
      INSERT INTO token_usage (user_id, model, model_type, prompt_tokens, completion_tokens, total_tokens, tenant_id, request_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const result = await this.query(query, [
      userId,
      model,
      modelType,
      promptTokens,
      completionTokens,
      totalTokens,
      tenantId || null,
      requestType || null,
    ]);
    return result.rows[0];
  }

  async getTokenUsageStats(startDate?: Date, endDate?: Date) {
    let query = `
      SELECT
        model,
        model_type,
        COUNT(*) as request_count,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens
      FROM token_usage
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];

    if (startDate) {
      whereClauses.push(`created_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` GROUP BY model, model_type ORDER BY total_tokens DESC`;

    const result = await this.query(query, params);
    return result.rows;
  }

  async getTokenUsageByUser(startDate?: Date, endDate?: Date) {
    let query = `
      SELECT
        user_id,
        COUNT(*) as request_count,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens
      FROM token_usage
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];

    if (startDate) {
      whereClauses.push(`created_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` GROUP BY user_id ORDER BY total_tokens DESC`;

    const result = await this.query(query, params);
    return result.rows;
  }

  async getTotalTokenUsage(startDate?: Date, endDate?: Date) {
    let query = `
      SELECT
        COUNT(*) as total_requests,
        SUM(prompt_tokens) as total_prompt_tokens,
        SUM(completion_tokens) as total_completion_tokens,
        SUM(total_tokens) as total_tokens
      FROM token_usage
    `;

    const params: any[] = [];
    const whereClauses: string[] = [];

    if (startDate) {
      whereClauses.push(`created_at >= $${params.length + 1}`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`created_at <= $${params.length + 1}`);
      params.push(endDate);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const result = await this.query(query, params);
    return result.rows[0];
  }

  // Conversation history operations (in-memory for now, can be moved to DB later)
  // Tenant-scoped conversation history: key format is "tenantId:userId"
  private conversationHistory: Map<string, any[]> = new Map();
  private readonly MAX_HISTORY_MESSAGES = 10; // Keep last 10 messages per user (reduced from 20)
  private readonly HISTORY_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes (reduced from 30)
  private lastActivityTime: Map<string, number> = new Map();

  private getTenantKey(tenantId: number, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  getConversationHistory(tenantId: number, userId: string): any[] {
    const key = this.getTenantKey(tenantId, userId);
    this.cleanExpiredHistory(key);
    return this.conversationHistory.get(key) || [];
  }

  setConversationHistory(tenantId: number, userId: string, messages: any[]) {
    const key = this.getTenantKey(tenantId, userId);
    this.cleanExpiredHistory(key);

    // Optimize: Remove intermediate tool calls/responses, keep only final user/assistant exchanges
    const optimizedMessages = this.optimizeMessages(messages);

    // Keep only the last N messages (excluding system message)
    const systemMessage = optimizedMessages.find(m => m.role === 'system');
    const otherMessages = optimizedMessages.filter(m => m.role !== 'system');

    if (otherMessages.length > this.MAX_HISTORY_MESSAGES) {
      const trimmedMessages = otherMessages.slice(-this.MAX_HISTORY_MESSAGES);
      this.conversationHistory.set(
        key,
        systemMessage ? [systemMessage, ...trimmedMessages] : trimmedMessages
      );
    } else {
      this.conversationHistory.set(key, optimizedMessages);
    }

    this.lastActivityTime.set(key, Date.now());
  }

  private optimizeMessages(messages: any[]): any[] {
    const optimized: any[] = [];
    let i = 0;

    while (i < messages.length) {
      const msg = messages[i];

      // Always keep system messages
      if (msg.role === 'system') {
        optimized.push(msg);
        i++;
        continue;
      }

      // Always keep user messages
      if (msg.role === 'user') {
        optimized.push(msg);
        i++;
        continue;
      }

      // For assistant messages, check if they're followed by tool calls
      if (msg.role === 'assistant') {
        // If assistant message has content (not just tool calls), keep it
        if (msg.content && msg.content.trim()) {
          optimized.push(msg);
          i++;
          continue;
        }

        // If it has tool calls, skip the entire tool call sequence and keep only the final response
        if (msg.tool_calls) {
          // Skip this assistant message with tool calls
          i++;

          // Skip all tool responses
          while (i < messages.length && messages[i].role === 'tool') {
            i++;
          }

          // The next message should be the assistant's final response - keep that
          if (i < messages.length && messages[i].role === 'assistant') {
            optimized.push(messages[i]);
            i++;
          }
          continue;
        }

        // Regular assistant message without tool calls
        optimized.push(msg);
        i++;
        continue;
      }

      // Skip standalone tool messages (shouldn't happen with above logic)
      i++;
    }

    return optimized;
  }

  clearConversationHistory(tenantId: number, userId: string) {
    const key = this.getTenantKey(tenantId, userId);
    this.conversationHistory.delete(key);
    this.lastActivityTime.delete(key);
  }

  private cleanExpiredHistory(key: string) {
    const lastActivity = this.lastActivityTime.get(key);
    if (lastActivity && Date.now() - lastActivity > this.HISTORY_EXPIRY_MS) {
      this.conversationHistory.delete(key);
      this.lastActivityTime.delete(key);
    }
  }
}

export const db = new Database();

// Export pool for direct queries (used by tenant service)
export const pool = db.pool;
