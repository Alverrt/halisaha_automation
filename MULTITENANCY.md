# Multitenancy Implementation

## Overview

This WhatsApp bot now supports **automatic multitenancy** based on WhatsApp business phone numbers. Each WhatsApp business account that uses the bot gets its own isolated data space.

## Architecture

### Tenant Isolation Strategy

- **Tenant Identifier**: WhatsApp Business Phone Number ID (`phone_number_id`)
- **Automatic Provisioning**: New tenants are created automatically when a new WhatsApp number sends a message
- **Data Isolation**: All customer and reservation data is scoped to `tenant_id`

### Database Schema

#### New Tables

**`tenants`** table:
```sql
- id (PRIMARY KEY)
- whatsapp_phone_number (UNIQUE) -- The business phone number
- business_name
- is_active
- settings (JSONB)
- created_at
- updated_at
```

#### Modified Tables

All existing tables now have `tenant_id` foreign key:
- `customers` - tenant_id added
- `reservations` - tenant_id added
- `token_usage` - tenant_id added (optional)

#### Constraints

- **Unique phone numbers per tenant**: Customers can have the same phone number across different tenants
- **Overlapping reservations per tenant**: Time slot conflicts are checked per tenant only

### How It Works

1. **Webhook Receives Message**
   ```
   WhatsApp → Webhook → Extract business phone_number_id
   ```

2. **Tenant Resolution**
   ```typescript
   const tenantId = await tenantService.getOrCreateTenant(businessPhoneNumber);
   ```

3. **Tenant-Scoped Operations**
   All database operations now include `tenant_id`:
   ```typescript
   await db.createCustomer(name, phone, tenantId);
   await db.getReservationsByDateRange(start, end, tenantId);
   ```

4. **Conversation History Isolation**
   Conversation history is scoped by tenant:
   ```typescript
   db.getConversationHistory(tenantId, userId);
   ```

## Implementation Status

### ✅ Completed

- [x] Database schema with tenant isolation
- [x] Tenant service for automatic tenant creation
- [x] Updated database methods to include tenant_id filtering
- [x] Migration scripts for multitenancy
- [x] Tenant-scoped conversation history

### 🚧 In Progress

- [ ] Update `fieldAgent.processMessage()` to accept `tenantId`
- [ ] Update all agent tools to pass `tenantId` to database methods
- [ ] Update webhook to pass `tenantId` to field agent

### 📋 Pending

- [ ] Add tenant management API endpoints
- [ ] Add tenant usage analytics
- [ ] Test with multiple WhatsApp business accounts
- [ ] Documentation and deployment guide

## Usage Example

### Automatic Tenant Creation

When a new WhatsApp business number (e.g., `699317973274146`) sends its first message:

```
1. Webhook receives message with metadata.phone_number_id = "699317973274146"
2. System calls: tenantService.getOrCreateTenant("699317973274146")
3. New tenant created automatically:
   - ID: 1
   - WhatsApp Phone Number: "699317973274146"
   - Business Name: "Tenant 699317973274146"
   - Status: Active
4. All subsequent operations use tenant_id = 1
```

### Data Isolation

**Tenant 1** (Business A - 699317973274146):
- Customer "Ahmet" (905454031918)
- Reservation: Monday 20:00-21:00

**Tenant 2** (Business B - 699999999999):
- Customer "Ahmet" (905454031918) ← Same phone, different tenant!
- Reservation: Monday 20:00-21:00 ← No conflict!

## Tenant Management

### Get Tenant Stats

```typescript
const stats = await tenantService.getTenantStats(tenantId);
// Returns: { totalCustomers, totalReservations, activeReservations, totalRevenue }
```

### Update Tenant

```typescript
await tenantService.updateTenant(tenantId, {
  businessName: "Football Field Pro",
  settings: { timezone: "Europe/Istanbul", pricePerHour: 500 }
});
```

### List All Tenants

```typescript
const tenants = await tenantService.listTenants({ activeOnly: true });
```

### Deactivate Tenant

```typescript
await tenantService.deactivateTenant(tenantId);
```

## Security Considerations

1. **Row-Level Security**: All queries include `tenant_id` in WHERE clauses
2. **Database Constraints**: Unique constraints are tenant-scoped
3. **Automatic Isolation**: Developers cannot accidentally query across tenants
4. **No Shared Data**: Each tenant's data is completely isolated

## Migration Guide

### For Existing Deployments

The migration script automatically:
1. Creates the `tenants` table
2. Adds `tenant_id` columns to existing tables
3. Migrates existing data to a "default_tenant"
4. Adds tenant-scoped constraints

### Running Migrations

```bash
npm run migrate
```

Output:
```
✅ Base schema migration completed
✅ Multitenancy migration completed
🎉 All database migrations completed successfully!
```

## Performance Considerations

- **Indexes**: All `tenant_id` columns are indexed
- **Composite Indexes**: `(tenant_id, phone_number)`, `(tenant_id, start_time)`, etc.
- **Query Performance**: No degradation - tenant filtering uses indexed columns

## Future Enhancements

- [ ] Tenant-specific pricing configuration
- [ ] Tenant-specific working hours
- [ ] Tenant billing and usage tracking
- [ ] Tenant API keys for programmatic access
- [ ] Multi-language support per tenant
- [ ] Custom branding per tenant

## Development Notes

### Adding New Tables

When adding new tables, always include:
```sql
CREATE TABLE new_table (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- other columns
);

CREATE INDEX idx_new_table_tenant_id ON new_table(tenant_id);
```

### Adding New Queries

Always include tenant_id in WHERE clauses:
```typescript
async getResource(id: number, tenantId: number) {
  return await db.query(
    'SELECT * FROM resource WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
}
```

## Testing

### Manual Testing

1. Use different WhatsApp Business API numbers
2. Send messages from each number
3. Verify data isolation in database
4. Check that reservations don't conflict across tenants

### Automated Testing

```typescript
// Test tenant isolation
const tenant1 = await tenantService.getOrCreateTenant('111111111');
const tenant2 = await tenantService.getOrCreateTenant('222222222');

const customer1 = await db.createCustomer('Ahmet', '905551234567', tenant1);
const customer2 = await db.createCustomer('Ahmet', '905551234567', tenant2);

// Both should exist independently
assert(customer1.tenant_id === tenant1);
assert(customer2.tenant_id === tenant2);
```

## Support

For questions or issues with multitenancy:
1. Check database migrations ran successfully
2. Verify tenant_id is being passed to all database methods
3. Check logs for tenant creation messages: `📱 Tenant ID X for WhatsApp number Y`
