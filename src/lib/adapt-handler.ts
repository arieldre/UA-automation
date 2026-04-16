type ExpressHandler = (req: any, res: any) => Promise<void>;

export function adaptHandler(handler: ExpressHandler) {
  return async function(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const query = Object.fromEntries(url.searchParams.entries());

    let body: Record<string, unknown> = {};
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      try {
        const text = await request.text();
        if (text) body = JSON.parse(text);
      } catch {}
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((val, key) => { headers[key] = val; });

    const req = { method: request.method, query, body, headers };

    let responseData: unknown;
    let responseStatus = 200;

    const res = {
      status(code: number) { responseStatus = code; return this; },
      json(data: unknown) { responseData = data; },
    };

    await handler(req, res);

    return Response.json(responseData, { status: responseStatus });
  };
}
