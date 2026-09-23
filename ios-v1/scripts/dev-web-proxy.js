// Dev-only CORS proxy for running the app in a browser (expo web).
// The prod API (Cloudflare -> Pi) sends no CORS headers because the native
// app never needs them; browsers do. This forwards localhost:8082 -> prod
// and stamps CORS headers on every response. Never deployed anywhere.
const http = require('http');

const UPSTREAM = process.env.UPSTREAM || 'https://paintingclub.art';
const PORT = process.env.PORT || 8082;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const STRIP_RESPONSE = new Set(['content-encoding', 'transfer-encoding', 'content-length', 'connection']);

http
  .createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.origin;
      delete headers.referer;
      delete headers['accept-encoding'];
      const upstream = await fetch(UPSTREAM + req.url, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        redirect: 'manual',
      });
      const out = { ...CORS };
      upstream.headers.forEach((v, k) => {
        if (!STRIP_RESPONSE.has(k)) out[k] = v;
      });
      const body = Buffer.from(await upstream.arrayBuffer());
      out['content-length'] = body.length;
      res.writeHead(upstream.status, out);
      res.end(body);
    } catch (err) {
      res.writeHead(502, CORS);
      res.end(JSON.stringify({ detail: `dev proxy: ${err.message}` }));
    }
  })
  .listen(PORT, () => console.log(`dev-web-proxy: localhost:${PORT} -> ${UPSTREAM}`));
