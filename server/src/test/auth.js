import { signToken } from "../lib/token.js";

// User giả có đủ trường để cấp token hợp lệ (token mang dấu vân tay của passwordHash)
export const fakeUser = (over = {}) => ({
  id: 1,
  role: "LIBRARIAN",
  status: "ACTIVE",
  passwordHash: "stored-hash",
  ...over,
});

export const authFor = (user = fakeUser()) => ({ Authorization: `Bearer ${signToken(user)}` });
