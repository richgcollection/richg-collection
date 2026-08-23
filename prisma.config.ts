import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // The CLI (migrate/introspect) needs a direct, non-pooled connection —
    // PgBouncer's transaction pooling mode doesn't support what schema
    // migrations require. The app's runtime PrismaClient uses the pooled
    // DATABASE_URL separately via the driver adapter in src/lib/prisma.ts.
    //
    // Read from process.env directly (not the `env()` helper) so that
    // `prisma generate` — which needs no database connection at all —
    // still works in environments (like a fresh CI/deploy install) where
    // DIRECT_URL isn't set yet. Only migrate/introspect actually need it.
    url: process.env.DIRECT_URL,
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
