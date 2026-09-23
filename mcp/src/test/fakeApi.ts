import { createServer, type Server } from "node:http";

/** One recorded request, so a test can assert what reached the API. */
export type Recorded = { method: string; path: string; body: unknown; auth: string | undefined };

export type Route = (body: any, request: { auth: string | undefined }) => { status?: number; json: unknown };

/** A stand-in for the Laravel API. Nothing here talks to a real backend. */
export class FakeApi {
  readonly requests: Recorded[] = [];
  private readonly routes = new Map<string, Route>();
  private server?: Server;
  private port = 0;

  route(method: string, path: string, handler: Route): this {
    this.routes.set(`${method} ${path}`, handler);

    return this;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}/api`;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const body = raw === "" ? null : JSON.parse(raw);
        const path = (req.url ?? "").replace(/^\/api/, "");

        this.requests.push({
          method: req.method ?? "",
          path,
          body,
          auth: req.headers.authorization,
        });

        const handler = this.routes.get(`${req.method} ${path}`);

        if (!handler) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: `No fake route for ${req.method} ${path}` }));

          return;
        }

        const { status = 200, json } = handler(body, { auth: req.headers.authorization });

        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      });
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(0, "127.0.0.1", () => {
        const address = this.server!.address();

        this.port = typeof address === "object" && address ? address.port : 0;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }
}
