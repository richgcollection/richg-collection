import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // The CLI (migrate/introspect) needs a direct, non-pooled connection —
    // PgBouncer's transaction pooling mode doesn't support what schema
    // migrations require. The app's runtime PrismaClient uses the pooled
    // DATABASE_URL separately via the driver adapter in src/lib/prisma.ts.
    url: env('DIRECT_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
