import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from './config.js';

export interface HttpTransportHandle {
  httpServer: Server;
  close(): Promise<void>;
}

interface McpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

function hasValidBearerToken(authorization: string | undefined, expected: string): boolean {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1] ?? '';
  const expectedDigest = createHash('sha256').update(expected).digest();
  const providedDigest = createHash('sha256').update(provided).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export async function startHttpTransport(
  createMcpServer: () => McpServer,
  config: Config,
): Promise<HttpTransportHandle> {
  const sessions = new Map<string, McpSession>();

  async function createSession(): Promise<McpSession> {
    const server = createMcpServer();
    let sessionId: string | undefined;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (id) => {
        sessionId = id;
        sessions.set(id, session);
      },
    });
    const session = { server, transport };
    transport.onclose = () => {
      if (sessionId) sessions.delete(sessionId);
    };
    try {
      await server.connect(transport);
    } catch (error) {
      await server.close();
      throw error;
    }
    return session;
  }

  const httpServer = createHttpServer((request, response) => {
    void (async () => {
      if (request.method === 'GET' && request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
        return;
      }
      if (request.url !== '/mcp') {
        response.writeHead(404).end();
        return;
      }
      if (config.authToken && !hasValidBearerToken(request.headers.authorization, config.authToken)) {
        response.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
        return;
      }
      const sessionId = request.headers['mcp-session-id'];
      let session = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
      if (sessionId && !session) {
        response.writeHead(404).end();
        return;
      }
      if (!session) {
        if (request.method !== 'POST') {
          response.writeHead(400).end();
          return;
        }
        session = await createSession();
      }
      try {
        await session.transport.handleRequest(request, response);
      } finally {
        if (request.method === 'DELETE' && typeof sessionId === 'string') {
          sessions.delete(sessionId);
          await session.server.close();
        } else if (!session.transport.sessionId) {
          await session.server.close();
        }
      }
    })().catch((error: unknown) => {
      console.error('MCP HTTP request failed', error);
      if (!response.headersSent) response.writeHead(500).end();
      else response.destroy(error instanceof Error ? error : undefined);
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      httpServer.once('error', onError);
      httpServer.listen(config.httpPort, config.httpHost, () => {
        httpServer.off('error', onError);
        resolve();
      });
    });
  } catch (error) {
    await Promise.all([...sessions.values()].map(({ server }) => server.close()));
    throw error;
  }

  let closePromise: Promise<void> | undefined;
  return {
    httpServer,
    close(): Promise<void> {
      closePromise ??= new Promise<void>((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      }).then(async () => {
        await Promise.all([...new Set(sessions.values())].map(({ server }) => server.close()));
        sessions.clear();
      });
      return closePromise;
    },
  };
}
