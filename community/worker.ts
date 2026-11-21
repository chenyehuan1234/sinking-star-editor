import type {D1Database, R2Bucket} from '@cloudflare/workers-types';
import {community} from './app';
import type {Database, Parameter} from './database';

interface Env {
  CATALOG: D1Database;
  DESIGNS: R2Bucket;
  ASSETS: {fetch(request: Request): Promise<Response>};
}

function d1(binding: D1Database): Database {
  const prepare = (sql: string, args: Parameter[] = []) => binding.prepare(sql).bind(...args);
  return {
    async query<Row extends object>(sql: string, args?: Parameter[]) {
      return (await prepare(sql, args).all<Row>()).results;
    },
    async batch(statements) {
      await binding.batch(statements.map(({sql, args}) => prepare(sql, args)));
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const app = community(d1(env.CATALOG), {
      async get(key) {
        const object = await env.DESIGNS.get(key);
        return object ? Buffer.from(await object.arrayBuffer()) : null;
      },
      async size(key) {
        return (await env.DESIGNS.head(key))?.size ?? null;
      },
      async put(key, bytes) {
        await env.DESIGNS.put(key, new Uint8Array(bytes));
      },
      async remove(key) {
        await env.DESIGNS.delete(key);
      },
    });
    return app(request, request.headers.get('cf-connecting-ip') ?? 'local');
  },
};
