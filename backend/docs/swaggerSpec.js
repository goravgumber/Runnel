const swaggerDocument = {
  openapi: "3.0.1",
  info: {
    title: "Runnel API",
    version: "1.0.0",
    description: "Open-source recovery inbox for asynchronous background work.",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local development server",
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      AuthRequest: {
        type: "object",
        properties: {
          username: { type: "string", example: "alice_dev" },
          password: { type: "string", example: "Password123!" },
        },
        required: ["username", "password"],
      },
      ExecutionSubmitRequest: {
        type: "object",
        properties: {
          name: { type: "string", example: "process-order" },
          type: { type: "string", example: "echo" },
          payload: { type: "object", example: { orderId: "ord_101" } },
          idempotencyKey: { type: "string", example: "idem_order_101" },
          maxAttempts: { type: "integer", example: 3 },
          timeoutMs: { type: "integer", example: 30000 },
        },
        required: ["name"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    "/api/v1/auth/signup": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new developer account",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AuthRequest" } } },
        },
        responses: { 201: { description: "User registered" } },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in and acquire access tokens",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AuthRequest" } } },
        },
        responses: { 200: { description: "Authenticated successfully" } },
      },
    },
    "/api/v1/executions": {
      get: {
        tags: ["Executions"],
        summary: "List executions with filtering and pagination",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { 200: { description: "List of executions" } },
      },
      post: {
        tags: ["Executions"],
        summary: "Submit a new background execution",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ExecutionSubmitRequest" } } },
        },
        responses: {
          200: { description: "Idempotent response" },
          202: { description: "Execution queued" },
        },
      },
    },
    "/api/v1/executions/stats": {
      get: {
        tags: ["Executions"],
        summary: "Retrieve execution overview telemetry and counts",
        responses: { 200: { description: "Execution counts by status" } },
      },
    },
    "/api/v1/executions/{id}": {
      get: {
        tags: ["Executions"],
        summary: "Inspect an execution by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Execution details" } },
      },
    },
    "/api/v1/executions/{id}/retry": {
      post: {
        tags: ["Executions"],
        summary: "Retry a failed or cancelled execution within limits",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 202: { description: "Execution re-enqueued" } },
      },
    },
    "/api/v1/executions/{id}/cancel": {
      post: {
        tags: ["Executions"],
        summary: "Cancel an eligible pending or running execution",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Execution cancelled" } },
      },
    },
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Service health and readiness check",
        responses: { 200: { description: "Healthy" }, 503: { description: "Degraded" } },
      },
    },
  },
};

module.exports = swaggerDocument;
