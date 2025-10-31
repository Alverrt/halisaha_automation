import { pool } from '../database/db';

export interface Tenant {
  id: number;
  whatsappPhoneNumber: string;
  businessName: string | null;
  isActive: boolean;
  settings: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export class TenantService {
  /**
   * Get or create a tenant based on WhatsApp phone number
   * This is the main entry point for automatic tenant provisioning
   */
  async getOrCreateTenant(whatsappPhoneNumber: string): Promise<number> {
    try {
      // Use the database function for atomic get-or-create
      const result = await pool.query(
        'SELECT get_or_create_tenant($1) as tenant_id',
        [whatsappPhoneNumber]
      );

      const tenantId = result.rows[0].tenant_id;
      console.log(`📱 Tenant ID ${tenantId} for WhatsApp number ${whatsappPhoneNumber}`);

      return tenantId;
    } catch (error) {
      console.error('Error getting or creating tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: number): Promise<Tenant | null> {
    try {
      const result = await pool.query(
        `SELECT
          id,
          whatsapp_phone_number as "whatsappPhoneNumber",
          business_name as "businessName",
          is_active as "isActive",
          settings,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM tenants
        WHERE id = $1`,
        [tenantId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting tenant by ID:', error);
      throw error;
    }
  }

  /**
   * Get tenant by WhatsApp phone number
   */
  async getTenantByPhoneNumber(whatsappPhoneNumber: string): Promise<Tenant | null> {
    try {
      const result = await pool.query(
        `SELECT
          id,
          whatsapp_phone_number as "whatsappPhoneNumber",
          business_name as "businessName",
          is_active as "isActive",
          settings,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM tenants
        WHERE whatsapp_phone_number = $1`,
        [whatsappPhoneNumber]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting tenant by phone number:', error);
      throw error;
    }
  }

  /**
   * Update tenant information
   */
  async updateTenant(
    tenantId: number,
    data: {
      businessName?: string;
      isActive?: boolean;
      settings?: Record<string, any>;
    }
  ): Promise<Tenant> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.businessName !== undefined) {
        updates.push(`business_name = $${paramIndex++}`);
        values.push(data.businessName);
      }

      if (data.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(data.isActive);
      }

      if (data.settings !== undefined) {
        updates.push(`settings = $${paramIndex++}`);
        values.push(JSON.stringify(data.settings));
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(tenantId);

      const result = await pool.query(
        `UPDATE tenants
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING
          id,
          whatsapp_phone_number as "whatsappPhoneNumber",
          business_name as "businessName",
          is_active as "isActive",
          settings,
          created_at as "createdAt",
          updated_at as "updatedAt"`,
        values
      );

      return result.rows[0];
    } catch (error) {
      console.error('Error updating tenant:', error);
      throw error;
    }
  }

  /**
   * List all tenants
   */
  async listTenants(options?: { activeOnly?: boolean }): Promise<Tenant[]> {
    try {
      let query = `
        SELECT
          id,
          whatsapp_phone_number as "whatsappPhoneNumber",
          business_name as "businessName",
          is_active as "isActive",
          settings,
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM tenants
      `;

      const values: any[] = [];

      if (options?.activeOnly) {
        query += ' WHERE is_active = true';
      }

      query += ' ORDER BY created_at DESC';

      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error listing tenants:', error);
      throw error;
    }
  }

  /**
   * Deactivate a tenant (soft delete)
   */
  async deactivateTenant(tenantId: number): Promise<void> {
    try {
      await pool.query(
        'UPDATE tenants SET is_active = false WHERE id = $1',
        [tenantId]
      );
      console.log(`🔒 Tenant ${tenantId} deactivated`);
    } catch (error) {
      console.error('Error deactivating tenant:', error);
      throw error;
    }
  }

  /**
   * Activate a tenant
   */
  async activateTenant(tenantId: number): Promise<void> {
    try {
      await pool.query(
        'UPDATE tenants SET is_active = true WHERE id = $1',
        [tenantId]
      );
      console.log(`🔓 Tenant ${tenantId} activated`);
    } catch (error) {
      console.error('Error activating tenant:', error);
      throw error;
    }
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(tenantId: number): Promise<{
    totalCustomers: number;
    totalReservations: number;
    activeReservations: number;
    totalRevenue: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT
          (SELECT COUNT(*) FROM customers WHERE tenant_id = $1) as total_customers,
          (SELECT COUNT(*) FROM reservations WHERE tenant_id = $1) as total_reservations,
          (SELECT COUNT(*) FROM reservations WHERE tenant_id = $1 AND status = 'active') as active_reservations,
          (SELECT COALESCE(SUM(price), 0) FROM reservations WHERE tenant_id = $1 AND status != 'cancelled') as total_revenue
        `,
        [tenantId]
      );

      return {
        totalCustomers: parseInt(result.rows[0].total_customers),
        totalReservations: parseInt(result.rows[0].total_reservations),
        activeReservations: parseInt(result.rows[0].active_reservations),
        totalRevenue: parseFloat(result.rows[0].total_revenue),
      };
    } catch (error) {
      console.error('Error getting tenant stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const tenantService = new TenantService();
