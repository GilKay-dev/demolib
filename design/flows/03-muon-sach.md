# 03 — Quản lý Mượn Sách (2.3)

## 2.3.1 Mượn Sách (Độc Giả)

**Actor:** Reader · **API:** `POST /api/borrows` body `{ bookId, days }`

```mermaid
flowchart TD
    S(["Độc giả xem chi tiết sách"]) --> CL["Click 'Mượn sách'"]
    CL --> LG{"Đã đăng nhập với role Reader?"}
    LG -->|"Chưa đăng nhập"| LOGIN["Chuyển tới Đăng nhập, sau đó quay lại"] --> S
    LG -->|"Có"| M["Modal chọn thời hạn mượn, mặc định 14 ngày"]
    M -->|"Hủy"| C(["Đóng modal"])
    M -->|"Gửi"| V{"Số ngày là số nguyên trong 1-30?"}
    V -->|"Không"| E1["Lỗi: Thời hạn từ 1 đến 30 ngày"] --> M
    V -->|"Có"| API["POST /api/borrows"]
    API --> B{"Sách tồn tại và chưa xóa?"}
    B -->|"Không"| E404["404 Sách không tồn tại"]
    B -->|"Có"| AV{"available > 0?"}
    AV -->|"Không"| E2["409 Sách đã hết, không thể mượn"]
    AV -->|"Có"| DUP{"Đã có đơn hoạt động với sách này?"}
    DUP -->|"Có"| E3["409 Bạn đã mượn hoặc đang chờ duyệt sách này"]
    DUP -->|"Không"| LIM{"Số đơn hoạt động dưới 5?"}
    LIM -->|"Không"| E4["409 Đã đạt tối đa 5 sách mượn"]
    LIM -->|"Có"| FINE{"Có phiếu phạt chưa Đã thanh toán?"}
    FINE -->|"Có"| E5["409 Bạn còn khoản phạt chưa thanh toán, kèm link tới trang Phạt"]
    FINE -->|"Không"| CR["Tạo đơn mượn: status = Chờ xác nhận, requested_days = days"]
    CR --> NOTE["Tồn kho KHÔNG thay đổi ở bước này"]
    NOTE --> OK(["Thông báo 'Đã gửi yêu cầu mượn, chờ nhân viên xác nhận'"])
```

**Ghi chú:**
- Đơn hoạt động = Chờ xác nhận + Đang mượn + Quá hạn (giả định A3).
- Các bước kiểm tra chạy theo thứ tự trên và trả về lỗi **đầu tiên** gặp phải. FE nên gọi trước `GET /api/borrows/eligibility?bookId=` để hiện lý do ngay trên nút "Mượn sách".
- Vì tồn kho chỉ giảm khi xác nhận, nhiều độc giả có thể cùng chờ cuốn sách cuối cùng. Việc này được xử lý ở 2.3.2.

---

## 2.3.2 Xác Nhận / Từ Chối Đơn Mượn (Nhân Viên)

**Actor:** Librarian · **API:** `GET /api/borrows?status=pending`, `POST /api/borrows/:id/confirm`, `POST /api/borrows/:id/reject`

```mermaid
flowchart TD
    S(["NV mở 'Quản lý mượn trả', tab 'Chờ xác nhận mượn'"]) --> L["Danh sách đơn Chờ xác nhận, cũ nhất trước: Độc giả, Sách, Số ngày, Ngày gửi, Có sẵn"]
    L --> E{"Có đơn nào?"}
    E -->|"Không"| EMPTY(["Không có đơn chờ xác nhận"])
    E -->|"Có"| ACT{"NV chọn thao tác"}

    ACT -->|"Xác nhận"| T1["Mở transaction, khóa dòng đơn mượn và sách"]
    T1 --> ST1{"Đơn vẫn ở Chờ xác nhận?"}
    ST1 -->|"Không"| E1["409 Đơn đã được xử lý bởi người khác, tải lại danh sách"]
    ST1 -->|"Có"| AV{"available > 0?"}
    AV -->|"Không"| E2["409 Sách đã hết bản, không thể xác nhận; gợi ý từ chối với lý do Hết sách"]
    AV -->|"Có"| CF["status = Đang mượn, borrow_date = hôm nay, due_date = hôm nay + requested_days, confirmed_by = NV"]
    CF --> INV["available -1, borrowed +1"]
    INV --> OK1(["Commit, đơn rời khỏi danh sách chờ"])

    ACT -->|"Từ chối"| R1["Modal nhập lý do từ chối"]
    R1 -->|"Hủy"| L
    R1 -->|"Gửi"| RV{"Lý do trống hoặc quá 255 ký tự?"}
    RV -->|"Có"| RE["Lỗi: Lý do là bắt buộc"] --> R1
    RV -->|"Không"| ST2{"Đơn vẫn ở Chờ xác nhận?"}
    ST2 -->|"Không"| E1
    ST2 -->|"Có"| RJ["status = Bị từ chối, lưu reject_reason, rejected_by"]
    RJ --> OK2(["Tồn kho không đổi; độc giả thấy lý do ở 2.3.3"])
```

**Edge case:**
- Tài khoản độc giả bị vô hiệu hóa trong lúc đơn đang chờ → NV vẫn xử lý được; nên từ chối với lý do tương ứng.
- Hai NV bấm xác nhận cùng lúc → chỉ một transaction thành công, người còn lại nhận `409`.

---

## Cập nhật Quá Hạn (job hệ thống)

**Actor:** Hệ thống, chạy hằng ngày lúc 00:05 (cron)

```mermaid
flowchart TD
    S(["Cron chạy hằng ngày"]) --> Q["Tìm đơn status = Đang mượn và due_date trước hôm nay"]
    Q --> H{"Có đơn nào?"}
    H -->|"Không"| DONE(["Kết thúc"])
    H -->|"Có"| U["Cập nhật status = Quá hạn"]
    U --> LOG(["Ghi log số đơn đã cập nhật"])
```

Nếu job chưa chạy, các màn hình vẫn hiển thị "Quá hạn" khi `due_date < hôm nay`, và phạt trả muộn ở 2.4.2 luôn tính theo ngày (giả định A8).

---

## 2.3.3 Xem Lịch Sử Mượn & Gia Hạn (Độc Giả)

**Actor:** Reader · **API:** `GET /api/me/borrows?status=`, `POST /api/borrows/:id/renew`

### Xem lịch sử

```mermaid
flowchart TD
    S(["Độc giả mở 'Lịch sử mượn sách'"]) --> F["Chọn lọc trạng thái, mặc định Tất cả"]
    F --> G["GET /api/me/borrows: chỉ đơn của chính user"]
    G --> H{"Có đơn?"}
    H -->|"Không"| EMPTY(["Bạn chưa có đơn mượn nào, kèm link Danh sách sách"])
    H -->|"Có"| ROW{"Trạng thái của từng dòng"}
    ROW -->|"Chờ xác nhận"| P(["Tên, Tác giả, Số ngày đã chọn, Ngày gửi"])
    ROW -->|"Đang mượn"| B["Tên, Tác giả, Ngày mượn, Hạn trả, Số ngày còn lại"]
    B --> BB(["Nút 'Xin trả sách' (2.4.1) và nút 'Gia hạn' nếu đủ điều kiện"])
    ROW -->|"Quá hạn"| O(["Như Đang mượn, Số ngày còn lại hiện số ngày quá hạn màu đỏ; chỉ có nút 'Xin trả sách'"])
    ROW -->|"Đã trả"| R(["Tên, Ngày mượn, Ngày trả"])
    ROW -->|"Bị từ chối"| X(["Tên, Tác giả, Lý do từ chối"])
    BB --> PR{"Đang có yêu cầu trả Chờ xác nhận?"}
    PR -->|"Có"| PD(["Thay nút bằng nhãn 'Đã gửi yêu cầu trả'; ẩn nút Gia hạn"])
```

### Gia hạn

```mermaid
flowchart TD
    S(["Click 'Gia hạn'"]) --> M["Modal: Gia hạn thêm 7 ngày, hạn mới là dd/mm/yyyy?"]
    M -->|"Hủy"| C(["Đóng modal"])
    M -->|"Xác nhận"| API["POST /api/borrows/:id/renew"]
    API --> OWN{"Đơn thuộc về user hiện tại?"}
    OWN -->|"Không"| E1["403 Không có quyền"]
    OWN -->|"Có"| ST{"status = Đang mượn?"}
    ST -->|"Không (Quá hạn, Đã trả, ...)"| E2["409 Chỉ gia hạn được sách đang mượn và chưa quá hạn"]
    ST -->|"Có"| DT{"Hôm nay không quá due_date?"}
    DT -->|"Không"| E2
    DT -->|"Có"| CNT{"renew_count = 0?"}
    CNT -->|"Không"| E3["409 Mỗi đơn chỉ được gia hạn 1 lần"]
    CNT -->|"Có"| RR{"Có yêu cầu trả đang chờ?"}
    RR -->|"Có"| E4["409 Đơn đang chờ xác nhận trả, không thể gia hạn"]
    RR -->|"Không"| UP["due_date += 7 ngày, renew_count = 1"]
    UP --> OK(["Thông báo hạn trả mới, ẩn nút 'Gia hạn'"])
```
