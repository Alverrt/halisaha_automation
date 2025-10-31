import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting database migration...');

    // Read and execute base schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    await client.query(schema);
    console.log('✅ Base schema migration completed');

    // Read and execute multitenancy migration
    const multitenancyPath = join(__dirname, 'multitenancy_migration.sql');
    const multitenancySchema = readFileSync(multitenancyPath, 'utf-8');
    await client.query(multitenancySchema);
    console.log('✅ Multitenancy migration completed');

    console.log('🎉 All database migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { runMigration };
