import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { fineLevelSchema } from "../validators/fineLevel.js";

export const fineLevelsRouter = Router();

const NAME_TAKEN = { message: "Mức phạt đã tồn tại", errors: { name: "Mức phạt đã tồn tại" } };
const NOT_FOUND = { message: "Mức phạt không tồn tại" };

const toFineLevel = (l) => ({
  id: l.id,
  name: l.name,
  amount: Number(l.amount),
  effectiveDate: l.effectiveDate.toISOString().slice(0, 10),
});

// Tên trùng không phân biệt hoa thường trong các mức phạt chưa xóa
const nameTaken = async (name, exceptId) =>
  !!(await prisma.fineLevel.findFirst({
    where: { deletedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  }));

const isNameConflict = (err) => err.code === "P2002";

const parseId = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return res.status(404).json(NOT_FOUND);
  req.fineLevelId = id;
  next();
};

// Xác thực khai báo trên từng route để route mới thêm không vô tình thành công khai
const adminOnly = [authenticate, requireRole("ADMIN")];

const toData = ({ name, amount, effectiveDate }) => ({
  name,
  amount,
  ...(effectiveDate && { effectiveDate: new Date(`${effectiveDate}T00:00:00Z`) }),
});

fineLevelsRouter.get("/", ...adminOnly, async (req, res) => {
  const levels = await prisma.fineLevel.findMany({
    where: { deletedAt: null },
    orderBy: [{ amount: "asc" }, { id: "asc" }],
  });
  res.json(levels.map(toFineLevel));
});

fineLevelsRouter.post("/", ...adminOnly, validate(fineLevelSchema), async (req, res) => {
  if (await nameTaken(req.body.name)) return res.status(409).json(NAME_TAKEN);
  try {
    const level = await prisma.fineLevel.create({ data: toData(req.body) });
    res.status(201).json(toFineLevel(level));
  } catch (err) {
    // Hai request cùng tên đồng thời: unique index bắt request thứ hai
    if (isNameConflict(err)) return res.status(409).json(NAME_TAKEN);
    throw err;
  }
});

// Sửa không ảnh hưởng phiếu phạt đã tạo (phiếu lưu snapshot tên + số tiền)
fineLevelsRouter.put("/:id", ...adminOnly, parseId, validate(fineLevelSchema), async (req, res) => {
  const existing = await prisma.fineLevel.findFirst({ where: { id: req.fineLevelId, deletedAt: null }, select: { id: true } });
  if (!existing) return res.status(404).json(NOT_FOUND);
  if (await nameTaken(req.body.name, req.fineLevelId)) return res.status(409).json(NAME_TAKEN);
  try {
    const level = await prisma.fineLevel.update({ where: { id: req.fineLevelId }, data: toData(req.body) });
    res.json(toFineLevel(level));
  } catch (err) {
    if (isNameConflict(err)) return res.status(409).json(NAME_TAKEN);
    throw err;
  }
});

// Xóa mềm: ẩn khỏi bảng và dropdown ở 2.4.2, phiếu phạt cũ giữ snapshot
fineLevelsRouter.delete("/:id", ...adminOnly, parseId, async (req, res) => {
  const { count } = await prisma.fineLevel.updateMany({
    where: { id: req.fineLevelId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count === 0) return res.status(404).json(NOT_FOUND);
  res.json({ message: "Xóa mức phạt thành công" });
});
