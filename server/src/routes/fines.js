import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const finesRouter = Router();

const NOT_FOUND = { message: "Không tìm thấy phiếu phạt" };
const NOT_PAYABLE = { message: "Phiếu phạt không ở trạng thái có thể thanh toán, vui lòng tải lại danh sách" };
const STATUSES = ["UNPAID", "PENDING", "PAID", "REJECTED"];
// Phiếu bị từ chối được gửi lại sau khi độc giả chuyển khoản bổ sung
const PAYABLE = ["UNPAID", "REJECTED"];

const parseId = (raw) => (typeof raw === "string" && /^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null);
const readerOnly = [authenticate, requireRole("READER")];

const toFine = (f) => ({
  id: f.id,
  type: f.type,
  levelName: f.levelName,
  amount: Number(f.amount),
  note: f.note,
  status: f.status,
  finedDate: f.finedDate.toISOString().slice(0, 10),
  rejectReason: f.rejectReason,
  book: f.borrow.book,
});

// 2.5.2 Phiếu phạt của độc giả đang đăng nhập (chưa thanh toán lên đầu), lọc theo trạng thái tùy chọn
finesRouter.get("/mine", ...readerOnly, async (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ message: "Trạng thái không hợp lệ" });

  const rows = await prisma.fine.findMany({
    where: { borrow: { readerId: req.user.id }, ...(status && { status }) },
    orderBy: [{ finedDate: "desc" }, { id: "desc" }],
    select: {
      id: true,
      type: true,
      levelName: true,
      amount: true,
      note: true,
      status: true,
      finedDate: true,
      rejectReason: true,
      borrow: { select: { book: { select: { id: true, title: true } } } },
    },
  });
  const items = rows.map(toFine);
  // Sắp xếp ổn định: giữ thứ tự ngày, chỉ đẩy phiếu cần thanh toán lên trước
  const needsPayment = (f) => PAYABLE.includes(f.status);
  items.sort((a, b) => Number(needsPayment(b)) - Number(needsPayment(a)));
  res.json({ items, totalUnpaid: items.filter((f) => f.status === "UNPAID").reduce((sum, f) => sum + f.amount, 0) });
});

// 2.5.2 Độc giả báo "Đã thanh toán" (đã chuyển khoản) → Chờ xác nhận, chờ nhân viên duyệt (2.5.3)
finesRouter.post("/:id/mark-paid", ...readerOnly, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(NOT_FOUND);

  // Điều kiện trạng thái nằm trong câu UPDATE để hai lần bấm đồng thời chỉ một lần thành công
  const { count } = await prisma.fine.updateMany({
    where: { id, status: { in: PAYABLE }, borrow: { readerId: req.user.id } },
    data: { status: "PENDING", markedPaidAt: new Date(), rejectReason: null },
  });
  if (count === 1) return res.json({ message: "Đã gửi xác nhận thanh toán, vui lòng chờ nhân viên thư viện xác nhận", fine: { id, status: "PENDING" } });

  // Không phân biệt phiếu của người khác với phiếu không tồn tại để không lộ dữ liệu
  const exists = await prisma.fine.findFirst({ where: { id, borrow: { readerId: req.user.id } }, select: { id: true } });
  res.status(exists ? 409 : 404).json(exists ? NOT_PAYABLE : NOT_FOUND);
});
