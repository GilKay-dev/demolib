import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { categorySchema } from "../validators/category.js";

export const categoriesRouter = Router();

const NAME_TAKEN = { message: "Thể loại đã tồn tại", errors: { name: "Thể loại đã tồn tại" } };
const NOT_FOUND = { message: "Thể loại không tồn tại" };

const toCategory = ({ _count, ...c }) => ({ id: c.id, name: c.name, bookCount: _count.books });
const activeBooks = { select: { books: { where: { deletedAt: null } } } };

// Tên trùng không phân biệt hoa thường trong các thể loại chưa xóa
const nameTaken = async (name, exceptId) =>
  !!(await prisma.category.findFirst({
    where: { deletedAt: null, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  }));

const isNameConflict = (err) => err.code === "P2002";

const parseId = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json(NOT_FOUND);
  req.categoryId = id;
  next();
};

// Danh sách thể loại công khai (bộ lọc ở 2.2.3 không cần đăng nhập)
categoriesRouter.get("/", async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    include: { _count: activeBooks },
  });
  // Sắp xếp theo locale tiếng Việt (giống client), không phụ thuộc collation của DB
  res.json(categories.map(toCategory).sort((a, b) => a.name.localeCompare(b.name, "vi")));
});

// Từ đây trở xuống (2.2.1: thêm/sửa/xóa) chỉ dành cho Nhân viên thư viện
categoriesRouter.use(authenticate, requireRole("LIBRARIAN"));

categoriesRouter.post("/", validate(categorySchema), async (req, res) => {
  const { name } = req.body;
  if (await nameTaken(name)) return res.status(409).json(NAME_TAKEN);
  try {
    const category = await prisma.category.create({ data: { name }, include: { _count: activeBooks } });
    res.status(201).json(toCategory(category));
  } catch (err) {
    // Hai request cùng tên đồng thời: unique index bắt request thứ hai
    if (isNameConflict(err)) return res.status(409).json(NAME_TAKEN);
    throw err;
  }
});

categoriesRouter.put("/:id", parseId, validate(categorySchema), async (req, res) => {
  const { name } = req.body;
  const existing = await prisma.category.findFirst({ where: { id: req.categoryId, deletedAt: null }, select: { id: true } });
  if (!existing) return res.status(404).json(NOT_FOUND);
  if (await nameTaken(name, req.categoryId)) return res.status(409).json(NAME_TAKEN);
  try {
    const category = await prisma.category.update({
      where: { id: req.categoryId },
      data: { name },
      include: { _count: activeBooks },
    });
    res.json(toCategory(category));
  } catch (err) {
    if (isNameConflict(err)) return res.status(409).json(NAME_TAKEN);
    throw err;
  }
});

// Xóa mềm; không xóa được khi còn sách (chưa xóa) thuộc thể loại
categoriesRouter.delete("/:id", parseId, async (req, res) => {
  // Kiểm tra "không còn sách" và xóa trong một câu lệnh có điều kiện để không hở giữa hai bước
  const { count } = await prisma.category.updateMany({
    where: { id: req.categoryId, deletedAt: null, books: { none: { deletedAt: null } } },
    data: { deletedAt: new Date() },
  });
  if (count === 1) return res.json({ message: "Xóa thể loại thành công" });

  // Không xóa được: phân biệt không tồn tại (404) với còn sách (409)
  const category = await prisma.category.findFirst({
    where: { id: req.categoryId, deletedAt: null },
    include: { _count: activeBooks },
  });
  if (!category) return res.status(404).json(NOT_FOUND);
  res.status(409).json({ message: `Không thể xóa: còn ${category._count.books} sách thuộc thể loại này` });
});
