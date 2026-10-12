declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

type D1Database = unknown;

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
