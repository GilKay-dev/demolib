import bcrypt from "bcryptjs";

const COST = 10;

export const hashPassword = (password) => bcrypt.hash(password, COST);

// Hash giả (cùng cost) để so sánh khi email không tồn tại; tính lười để không chặn lúc import
let dummyHash;
export async function comparePassword(password, hash) {
  dummyHash ??= await bcrypt.hash("dummy-password", COST);
  return bcrypt.compare(password, hash ?? dummyHash);
}
