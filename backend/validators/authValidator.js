const { z } = require("zod");

const signupSchema = z.object({
  body: z.object({
    username: z.string().trim().min(3, "username must be at least 3 characters"),
    password: z.string().min(8, "password must be at least 8 characters"),
  }),
});

const loginSchema = z.object({
  body: z.object({
    username: z.string().trim().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, "refreshToken is required"),
  }),
});

const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(),
  }),
});

module.exports = {
  signupSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
};
