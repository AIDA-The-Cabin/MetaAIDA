// Combined Pages worker: serve the static site, route /v1/* to the Hono API.
import app from './index';
import type { Env } from './env';

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/')) return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
