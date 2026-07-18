import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Trace the methodology YAML into every server bundle that calls loadMethodology()
  // (it reads process.cwd()/methodology at runtime). Without this the files are pruned
  // from the serverless output and loadMethodology() throws in production.
  outputFileTracingIncludes: {
    '/app/[churchId]': ['./methodology/**'],
    '/app/[churchId]/answer/[categoryId]': ['./methodology/**'],
    '/respond/[token]': ['./methodology/**'],
    '/api/respond/[token]': ['./methodology/**'],
    '/get-started': ['./methodology/**'],
    '/api/report/[runId]/pdf': ['./assets/fonts/**'],
  },
}

export default nextConfig
