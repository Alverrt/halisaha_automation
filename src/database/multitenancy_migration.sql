-- Multitenancy Migration
-- Adds tenant isolation based on WhatsApp phone numbers

-- Enable btree_gist extension for integer support in GIST indexes
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    whatsapp_phone_number VARCHAR(20) UNIQUE NOT NULL,
    business_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add tenant_id to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;

-- 3. Add tenant_id to reservations table
ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;

-- 4. Add tenant_id to token_usage table
ALTER TABLE token_usage
ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE;

-- 5. Create indexes for tenant_id columns
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_id ON reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_tenant_id ON token_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_phone_number ON tenants(whatsapp_phone_number);

-- 6. Update the unique constraint on customers to be tenant-scoped
-- Drop old constraint if exists
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_number_key;

-- Add new composite unique constraint (phone number unique per tenant)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'customers_phone_number_tenant_unique'
    ) THEN
        ALTER TABLE customers
        ADD CONSTRAINT customers_phone_number_tenant_unique
        UNIQUE (phone_number, tenant_id);
    END IF;
END $$;

-- 7. Update the overlapping reservations constraint to be tenant-scoped
-- Drop old constraint
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS no_overlapping_reservations;

-- Add new tenant-scoped constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_overlapping_reservations_per_tenant'
    ) THEN
        ALTER TABLE reservations
        ADD CONSTRAINT no_overlapping_reservations_per_tenant
        EXCLUDE USING GIST (
            tenant_id WITH =,
            tsrange(start_time, end_time) WITH &&
        )
        WHERE (status = 'active');
    END IF;
END $$;

-- 8. Add trigger for tenants updated_at
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Create a function to get or create tenant
CREATE OR REPLACE FUNCTION get_or_create_tenant(p_phone_number VARCHAR(20))
RETURNS INTEGER AS $$
DECLARE
    v_tenant_id INTEGER;
BEGIN
    -- Try to get existing tenant
    SELECT id INTO v_tenant_id
    FROM tenants
    WHERE whatsapp_phone_number = p_phone_number;

    -- If not found, create new tenant
    IF v_tenant_id IS NULL THEN
        INSERT INTO tenants (whatsapp_phone_number, business_name)
        VALUES (p_phone_number, 'Tenant ' || p_phone_number)
        RETURNING id INTO v_tenant_id;
    END IF;

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- 10. Migrate existing data (if any) to a default tenant
DO $$
DECLARE
    v_default_tenant_id INTEGER;
BEGIN
    -- Check if there are customers without tenant_id
    IF EXISTS (SELECT 1 FROM customers WHERE tenant_id IS NULL LIMIT 1) THEN
        -- Create default tenant for existing data
        INSERT INTO tenants (whatsapp_phone_number, business_name, settings)
        VALUES ('default_tenant', 'Default Tenant (Migrated)', '{"migrated": true}')
        ON CONFLICT (whatsapp_phone_number) DO NOTHING
        RETURNING id INTO v_default_tenant_id;

        -- If the insert didn't return an ID (due to conflict), get it
        IF v_default_tenant_id IS NULL THEN
            SELECT id INTO v_default_tenant_id
            FROM tenants
            WHERE whatsapp_phone_number = 'default_tenant';
        END IF;

        -- Update existing customers
        UPDATE customers
        SET tenant_id = v_default_tenant_id
        WHERE tenant_id IS NULL;

        -- Update existing reservations
        UPDATE reservations
        SET tenant_id = v_default_tenant_id
        WHERE tenant_id IS NULL;

        -- Update existing token_usage
        UPDATE token_usage
        SET tenant_id = v_default_tenant_id
        WHERE tenant_id IS NULL;
    END IF;
END $$;

-- 11. Make tenant_id NOT NULL after migration
ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE reservations ALTER COLUMN tenant_id SET NOT NULL;
-- token_usage can remain nullable for backward compatibility
