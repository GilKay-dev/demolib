# 01 — Quản lý Tài Khoản (2.1)

## 2.1.1 Đăng Ký

**Actor:** Khách (chưa đăng nhập) · **API:** `POST /api/auth/register`

```mermaid
flowchart TD
    S(["Khách click 'Đăng ký'"]) --> F["Nhập Email, Tên, Mật khẩu, Confirm mật khẩu"]
    F --> V{"Validate FE + Joi"}
    V -->|"Email sai định dạng"| E1["Lỗi: Email không hợp lệ"]
    V -->|"Tên trống hoặc quá 50 ký tự"| E2["Lỗi: Tên không hợp lệ"]
    V -->|"Mật khẩu trống, dưới 8 hoặc quá 16 ký tự"| E3["Lỗi: Mật khẩu 8-16 ký tự"]
    V -->|"Confirm trống hoặc không khớp"| E4["Lỗi: Mật khẩu xác nhận không khớp"]
    E1 --> F
    E2 --> F
    E3 --> F
    E4 --> F
    V -->|"Hợp lệ"| N["Chuẩn hóa email: trim, lowercase"]
    N --> U{"Email đã tồn tại?"}
    U -->|"Có"| E5["409 Email đã được sử dụng"] --> F
    U -->|"Không"| H["Hash mật khẩu bằng bcrypt"]
    H --> C["Tạo user: role = Reader, status = Chờ xác nhận"]
    C --> OK(["Thông báo: Đăng ký thành công, vui lòng chờ quản lý viên kích hoạt"])
```

**Edge case:**
- Hai request đăng ký cùng email gần như đồng thời → unique constraint ở DB bắt request thứ hai → `409`.
- Người dùng không tự chọn được vai trò; mọi tài khoản mới là Reader (Admin đổi vai trò ở 2.6.2).

---

## 2.1.2 Đăng Nhập

**Actor:** Mọi người · **API:** `POST /api/auth/login`

```mermaid
flowchart TD
    S(["Nhập Email và Mật khẩu"]) --> V{"Validate FE + Joi"}
    V -->|"Email sai định dạng hoặc mật khẩu không đủ 8-16 ký tự"| E1["Hiển thị lỗi dưới trường"] --> S
    V -->|"Hợp lệ"| Q{"Tìm thấy user theo email?"}
    Q -->|"Không"| E2["401 Email hoặc mật khẩu không đúng"] --> S
    Q -->|"Có"| P{"bcrypt.compare mật khẩu khớp?"}
    P -->|"Không"| E2
    P -->|"Có"| ST{"Trạng thái tài khoản?"}
    ST -->|"Chờ xác nhận"| E3["403 Tài khoản đang chờ kích hoạt"] --> S
    ST -->|"Vô hiệu hóa"| E4["403 Tài khoản đã bị vô hiệu hóa"] --> S
    ST -->|"Kích hoạt"| T["Ký JWT chứa userId và role, hết hạn 24h"]
    T --> FE["FE lưu token, gắn vào header Axios"]
    FE --> RT{"Có URL cần quay lại? (vd. đang mượn sách thì bị yêu cầu đăng nhập)"}
    RT -->|"Có"| BACK(["Quay lại trang trước đó"])
    RT -->|"Không"| R{"Vai trò?"}
    R -->|"Reader"| D1(["Dashboard độc giả"])
    R -->|"Librarian"| D2(["Dashboard nhân viên"])
    R -->|"Admin"| D3(["Dashboard quản lý viên"])
```

**Edge case:**
- Sai email và sai mật khẩu trả **cùng một thông báo** để không lộ email nào đã đăng ký.
- Trạng thái tài khoản chỉ được báo sau khi mật khẩu đúng.
- Token hết hạn khi đang dùng → middleware trả `401` → FE đăng xuất và về trang đăng nhập (xem README).

---

## 2.1.3 Hồ Sơ Cá Nhân

**Actor:** Reader · **API:** `GET /api/me`, `PUT /api/me`, `PUT /api/me/password`

### Xem hồ sơ

```mermaid
flowchart TD
    S(["Độc giả mở trang Hồ sơ"]) --> A["GET /api/me qua middleware, role = Reader"]
    A --> D["Trả về Tên, Email, SĐT, Địa chỉ, Ngày tham gia"]
    D --> ST["Tính thống kê: Số lần mượn = số đơn đã được xác nhận; Tổng tiền phạt = tổng phiếu chưa Đã thanh toán"]
    ST --> OK(["Hiển thị hồ sơ; SĐT / địa chỉ trống thì hiện 'Chưa cập nhật'"])
```

### Cập nhật thông tin

```mermaid
flowchart TD
    S(["Click 'Cập nhật thông tin'"]) --> F["Sửa Tên, Số điện thoại, Địa chỉ (Email chỉ đọc)"]
    F --> V{"Validate FE + Joi"}
    V -->|"Tên trống hoặc quá 50 ký tự"| E1["Lỗi trường Tên"] --> F
    V -->|"SĐT sai định dạng"| E2["Lỗi trường Số điện thoại"] --> F
    V -->|"Địa chỉ trống hoặc quá 255 ký tự"| E3["Lỗi trường Địa chỉ"] --> F
    V -->|"Hợp lệ"| SAVE["PUT /api/me: cập nhật bản ghi của chính user trong token"]
    SAVE --> OK(["Thông báo 'Cập nhật thành công', cập nhật lại Context"])
    F --> CANCEL["Click 'Hủy'"] --> RESET(["Khôi phục giá trị cũ, không gọi API"])
```

### Đổi mật khẩu

```mermaid
flowchart TD
    S(["Click 'Đổi mật khẩu'"]) --> F["Nhập Mật khẩu hiện tại, Mật khẩu mới, Confirm mật khẩu mới"]
    F --> V{"Validate FE + Joi"}
    V -->|"Mật khẩu mới không đủ 8-16 ký tự"| E1["Lỗi Mật khẩu mới"] --> F
    V -->|"Confirm không khớp"| E2["Lỗi Confirm"] --> F
    V -->|"Mật khẩu mới trùng mật khẩu hiện tại"| E3["Lỗi: Mật khẩu mới phải khác mật khẩu cũ"] --> F
    V -->|"Hợp lệ"| C{"Mật khẩu hiện tại đúng?"}
    C -->|"Không"| E4["400 Mật khẩu hiện tại không đúng"] --> F
    C -->|"Có"| H["Hash và lưu mật khẩu mới"]
    H --> OK(["Thông báo 'Đổi mật khẩu thành công'"])
```

**Edge case:** User chỉ sửa được hồ sơ của chính mình. API không nhận `userId` từ client mà lấy từ token.
