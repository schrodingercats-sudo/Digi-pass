const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT_DIR = process.cwd();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const loadEnvFromFile = () => {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index < 1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

const sendPlain = (res, statusCode, text) => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
};

const resolveStaticPath = (pathname) => {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  return path.join(ROOT_DIR, safePath);
};

const serveStatic = (pathname, res) => {
  const absolutePath = resolveStaticPath(pathname);
  if (!absolutePath.startsWith(ROOT_DIR)) {
    sendPlain(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    sendPlain(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  fs.createReadStream(absolutePath).pipe(res);
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", () => reject(new Error("Request stream error")));
  });

const loadApiHandler = (pathname) => {
  const routeName = pathname.replace(/^\/api\//, "");
  if (!routeName) {
    return null;
  }

  const filePath = path.join(ROOT_DIR, "api", `${routeName}.js`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  delete require.cache[require.resolve(filePath)];
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(filePath);
};

const augmentResponse = (res) => {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload));
    return res;
  };
};

const addApiCorsHeaders = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
};

const handleApiRequest = async (req, res, parsedUrl) => {
  addApiCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const handler = loadApiHandler(parsedUrl.pathname);
  if (!handler) {
    sendPlain(res, 404, "API route not found");
    return;
  }

  req.query = Object.fromEntries(parsedUrl.searchParams.entries());
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      req.body = await readJsonBody(req);
    } catch (error) {
      sendPlain(res, 400, "Invalid JSON body");
      return;
    }
  } else {
    req.body = {};
  }

  augmentResponse(res);

  try {
    await handler(req, res);
    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    if (!res.writableEnded) {
      sendPlain(res, 500, `Internal server error: ${error.message}`);
    }
  }
};

const startServer = () => {
  loadEnvFromFile();

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
    if (parsedUrl.pathname.startsWith("/api/")) {
      await handleApiRequest(req, res, parsedUrl);
      return;
    }

    serveStatic(parsedUrl.pathname, res);
  });

  server.listen(PORT, () => {
    process.stdout.write(`Local server running at http://127.0.0.1:${PORT}\n`);
  });
};

startServer();
