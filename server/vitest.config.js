import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Nới giới hạn rate limit cho test thường; rateLimit.test.js tự đặt giá trị nhỏ trước khi import app
    env: { JWT_SECRET: "test-secret", LOGIN_RATE_LIMIT: "100000", PASSWORD_RATE_LIMIT: "100000" },
  },
});
