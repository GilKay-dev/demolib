# 05 — Quản lý Nợ & Phạt (2.5)

## 2.5.1 Quản lý Mức Phạt

**Actor:** Admin · **API:** `GET/POST /api/fine-levels`, `PUT/DELETE /api/fine-levels/:id`

### Xem, thêm, sửa trực tiếp trên bảng

```mermaid
flowchart TD
    S(["Admin mở trang Mức phạt"]) --> L["Bảng mức phạt chưa xóa: Tên, Số tiền, Ngày phạt"]
    L --> ACT{"Thao tác?"}

    ACT -->|"Thêm"| A1["Click 'Thêm mức phạt': nhập Tên, Số tiền, Ngày phạt (mặc định hôm nay)"]
    A1 --> AV{"Validate FE + Joi"}
    AV -->|"Tên trống hoặc quá 25 ký tự"| AE["Lỗi tại trường"]
    AV -->|"Số tiền không phải số hoặc không lớn hơn 0"| AE
    AV -->|"Ngày không hợp lệ"| AE
    AE --> A1
    AV -->|"Hợp lệ"| AD{"Tên đã tồn tại?"}
    AD -->|"Có"| AE2["409 Mức phạt đã tồn tại"] --> A1
    AD -->|"Không"| AS["POST: tạo mức phạt"] --> AOK(["Thêm dòng vào bảng"])

    ACT -->|"Sửa trên bảng"| E1["Sửa ô Tên / Số tiền / Ngày, Enter hoặc blur"]
    E1 --> EV{"Hợp lệ và tên không trùng?"}
    EV -->|"Không"| EE["Lỗi tại ô, Esc để khôi phục"] --> E1
    EV -->|"Có"| ES["PUT: cập nhật"]
    ES --> EOK(["Lưu; phiếu phạt đã tạo trước đó KHÔNG đổi số tiền (dùng snapshot)"])
```

### Xóa mức phạt

```mermaid
flowchart TD
    S(["Click 'Xóa' trên dòng mức phạt"]) --> M["Modal xác nhận xóa"]
    M -->|"Hủy"| C(["Đóng modal"])
    M -->|"Xác nhận"| EX{"Mức phạt còn tồn tại?"}
    EX -->|"Không"| E404["404, tải lại bảng"]
    EX -->|"Có"| DEL["Xóa mềm: ẩn khỏi bảng và dropdown ở 2.4.2"]
    DEL --> OK(["Phiếu phạt cũ giữ nguyên tên + số tiền đã snapshot"])
```

---

## 2.5.2 Xem & Thanh Toán Khoản Phạt (Độc Giả)

**Actor:** Reader · **API:** `GET /api/me/fines?status=`, `POST /api/fines/:id/mark-paid`

```mermaid
flowchart TD
    S(["Độc giả mở trang 'Khoản phạt'"]) --> G["GET /api/me/fines, mặc định lọc phiếu chưa Đã thanh toán"]
    G --> H{"Có phiếu?"}
    H -->|"Không"| EMPTY(["Bạn không có khoản phạt nào"])
    H -->|"Có"| L["Bảng: Nguyên nhân (Trả muộn / Hư hỏng / Mất + tên sách), Số tiền, Ngày phạt, Trạng thái, Lý do từ chối nếu có"]
    L --> SEL["Chọn một phiếu"]
    SEL --> ST{"Trạng thái phiếu?"}
    ST -->|"Chờ xác nhận"| W(["Chỉ xem: Đang chờ nhân viên xác nhận"])
    ST -->|"Đã thanh toán"| PD(["Chỉ xem"])
    ST -->|"Chưa thanh toán hoặc Từ chối"| BANK["Hiển thị thông tin chuyển khoản: STK thư viện, số tiền, nội dung CK = mã phiếu phạt"]
    BANK --> TR["Độc giả chuyển khoản qua ngân hàng (ngoài hệ thống)"]
    TR --> CL["Click 'Đã thanh toán', xác nhận trong modal"]
    CL -->|"Hủy"| L
    CL --> API["POST /api/fines/:id/mark-paid"]
    API --> OWN{"Phiếu thuộc về user hiện tại?"}
    OWN -->|"Không"| E1["403 Không có quyền"]
    OWN -->|"Có"| CK{"Trạng thái hiện tại là Chưa thanh toán hoặc Từ chối?"}
    CK -->|"Không"| E2["409 Phiếu đã được gửi xác nhận hoặc đã thanh toán"]
    CK -->|"Có"| UP["status = Chờ xác nhận, marked_paid_at = bây giờ, xóa lý do từ chối cũ"]
    UP --> OK(["Phiếu hiển thị 'Chờ xác nhận'"])
```

Độc giả vẫn bị chặn mượn khi phiếu đang "Chờ xác nhận" hoặc "Từ chối" (giả định A4).

---

## 2.5.3 Xác Nhận Thanh Toán Phạt (Nhân Viên)

**Actor:** Librarian · **API:** `GET /api/fines?status=`, `GET /api/fines/:id`, `POST /api/fines/:id/confirm`, `POST /api/fines/:id/reject`

```mermaid
flowchart TD
    S(["NV mở trang 'Khoản phạt'"]) --> L["Danh sách phiếu, lọc theo trạng thái (mặc định Chờ xác nhận), tìm theo độc giả"]
    L --> H{"Có phiếu?"}
    H -->|"Không"| EMPTY(["Không có phiếu phạt"])
    H -->|"Có"| D["Xem chi tiết: Độc giả, Sách, Nguyên nhân, Ghi chú, Số tiền, Ngày phạt, Ngày báo đã thanh toán"]
    D --> ST{"Trạng thái là Chờ xác nhận?"}
    ST -->|"Không"| RO(["Chỉ xem, không có nút thao tác"])
    ST -->|"Có"| CHK["NV đối soát sao kê ngân hàng (ngoài hệ thống)"]
    CHK --> ACT{"Kết quả đối soát"}

    ACT -->|"Đã nhận đủ tiền"| C1["Click 'Đã thanh toán'"]
    C1 --> T1{"Phiếu vẫn Chờ xác nhận?"}
    T1 -->|"Không"| E1["409 Phiếu đã được xử lý, tải lại"]
    T1 -->|"Có"| P["status = Đã thanh toán, paid_at = bây giờ, confirmed_by = NV"]
    P --> OK1(["Nếu độc giả hết phiếu chưa thanh toán thì được mượn lại"])

    ACT -->|"Chưa nhận / sai số tiền"| R1["Click 'Từ chối', nhập lý do"]
    R1 --> RV{"Lý do trống hoặc quá 255 ký tự?"}
    RV -->|"Có"| RE["Lỗi: Lý do là bắt buộc"] --> R1
    RV -->|"Không"| T2{"Phiếu vẫn Chờ xác nhận?"}
    T2 -->|"Không"| E1
    T2 -->|"Có"| RJ["status = Từ chối, lưu reject_reason"]
    RJ --> OK2(["Độc giả thấy lý do ở 2.5.2 và có thể gửi lại"])
```
