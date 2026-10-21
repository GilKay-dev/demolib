# 06 — Quản lý Người Dùng (2.6)

## 2.6.1 Danh Sách Người Dùng & Kích Hoạt / Vô Hiệu Hóa

**Actor:** Admin · **API:** `GET /api/users?q=&role=&status=&page=`, `PATCH /api/users/:id/status`

### Xem danh sách

```mermaid
flowchart TD
    S(["Admin mở trang Người dùng"]) --> F["Nhập tìm kiếm (email / tên), lọc Vai trò, lọc Trạng thái"]
    F --> G["GET /api/users: phân trang, mới nhất trước"]
    G --> H{"Có kết quả?"}
    H -->|"Không"| EMPTY(["Không tìm thấy người dùng"])
    H -->|"Có"| L(["Bảng: Email, Tên, Vai trò, Ngày tham gia, Trạng thái, Thao tác"])
```

Lọc "Chờ xác nhận" để Admin duyệt nhanh các tài khoản mới đăng ký (giả định A1).

### Đổi trạng thái tài khoản

```mermaid
flowchart TD
    S(["Click 'Kích hoạt' hoặc 'Vô hiệu hóa' trên một dòng"]) --> M["Modal xác nhận, hiển thị email và trạng thái mới"]
    M -->|"Hủy"| C(["Đóng modal"])
    M -->|"Xác nhận"| API["PATCH /api/users/:id/status"]
    API --> EX{"User tồn tại?"}
    EX -->|"Không"| E404["404 Người dùng không tồn tại"]
    EX -->|"Có"| SELF{"Là chính Admin đang đăng nhập?"}
    SELF -->|"Có"| E1["409 Không thể thay đổi trạng thái tài khoản của chính mình"]
    SELF -->|"Không"| TO{"Trạng thái mới?"}
    TO -->|"Kích hoạt (từ Chờ xác nhận hoặc Vô hiệu hóa)"| ACT["status = Kích hoạt"] --> OK1(["User đăng nhập được"])
    TO -->|"Vô hiệu hóa"| LA{"User là Admin kích hoạt cuối cùng?"}
    LA -->|"Có"| E2["409 Hệ thống phải còn ít nhất 1 Admin"]
    LA -->|"Không"| DIS["status = Vô hiệu hóa"]
    DIS --> OK2(["Token hiện tại bị middleware từ chối ở request tiếp theo; dữ liệu mượn / phạt giữ nguyên"])
    TO -->|"Giống trạng thái hiện tại"| NOOP(["Không thay đổi"])
```

**Edge case:** Độc giả bị vô hiệu hóa khi còn đang mượn sách → không đăng nhập được nhưng NV vẫn xử lý yêu cầu trả và phiếu phạt hiện có. Đơn "Chờ xác nhận" của họ nên được NV từ chối.

---

## 2.6.2 Gán Vai Trò

**Actor:** Admin · **API:** `PATCH /api/users/:id/role` body `{ role }`

```mermaid
flowchart TD
    S(["Chọn vai trò mới ở dropdown trên dòng người dùng"]) --> M["Modal: Đổi vai trò của X từ A sang B?"]
    M -->|"Hủy"| C(["Khôi phục dropdown"])
    M -->|"Xác nhận"| V{"role thuộc Reader / Librarian / Admin?"}
    V -->|"Không"| E0["400 Vai trò không hợp lệ"]
    V -->|"Có"| EX{"User tồn tại?"}
    EX -->|"Không"| E404["404 Người dùng không tồn tại"]
    EX -->|"Có"| SELF{"Là chính Admin đang đăng nhập?"}
    SELF -->|"Có"| E1["409 Không thể tự đổi vai trò của mình"]
    SELF -->|"Không"| SAME{"Vai trò mới giống vai trò hiện tại?"}
    SAME -->|"Có"| NOOP(["Không thay đổi"])
    SAME -->|"Không"| FROM{"Vai trò hiện tại?"}
    FROM -->|"Reader"| RD{"Còn đơn hoạt động hoặc phiếu phạt chưa Đã thanh toán?"}
    RD -->|"Có"| E2["409 Độc giả còn N sách đang mượn / M khoản phạt, cần hoàn tất trước"]
    RD -->|"Không"| UP
    FROM -->|"Admin"| LA{"Là Admin kích hoạt cuối cùng?"}
    LA -->|"Có"| E3["409 Hệ thống phải còn ít nhất 1 Admin"]
    LA -->|"Không"| UP
    FROM -->|"Librarian"| UP["Cập nhật role"]
    UP --> OK(["Có hiệu lực từ request tiếp theo của user (middleware đọc role từ DB); FE của user đó chuyển dashboard khi tải lại"])
```

**Quyền theo vai trò:**

| Vai trò | Quyền |
|---|---|
| Reader | Mượn / gia hạn / trả sách, xem lịch sử cá nhân, thanh toán phạt, sửa hồ sơ |
| Librarian | Quản lý thể loại & sách, xác nhận mượn / trả, xác nhận thanh toán phạt, xem báo cáo |
| Admin | Quản lý người dùng & vai trò, cấu hình mức phạt, xem báo cáo |
