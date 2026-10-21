# 02 — Quản lý Sách (2.2)

## 2.2.1 Quản lý Thể Loại Sách

**Actor:** Librarian · **API:** `GET/POST /api/categories`, `PUT/DELETE /api/categories/:id`

### Xem, thêm, sửa trực tiếp trên bảng

```mermaid
flowchart TD
    S(["NV mở trang Thể loại"]) --> L["GET /api/categories: hiển thị bảng Tên, Số sách"]
    L --> ACT{"Thao tác?"}

    ACT -->|"Thêm"| A1["Click 'Thêm thể loại sách', nhập tên"]
    A1 --> AV{"Tên trống hoặc quá 50 ký tự?"}
    AV -->|"Có"| AE1["Lỗi validate"] --> A1
    AV -->|"Không"| AD{"Tên đã tồn tại? (không phân biệt hoa thường)"}
    AD -->|"Có"| AE2["409 Thể loại đã tồn tại"] --> A1
    AD -->|"Không"| AS["POST: tạo thể loại"] --> AOK(["Thêm dòng mới vào bảng"])

    ACT -->|"Sửa trên bảng"| E1["Click ô Tên, sửa, Enter hoặc blur"]
    E1 --> EU{"Giá trị có thay đổi?"}
    EU -->|"Không"| ENO(["Không gọi API"])
    EU -->|"Có"| EV{"Tên hợp lệ và chưa trùng?"}
    EV -->|"Không"| EE["Hiện lỗi tại ô, khôi phục giá trị cũ khi bấm Esc"] --> E1
    EV -->|"Có"| ES["PUT: cập nhật"] --> EOK(["Lưu thành công; sách thuộc thể loại hiển thị tên mới"])
```

### Xóa thể loại (deletion guard)

```mermaid
flowchart TD
    S(["Click 'Xóa' trên dòng thể loại"]) --> M["Modal: Bạn chắc chắn muốn xóa thể loại X?"]
    M -->|"Hủy"| C(["Đóng modal, không thay đổi"])
    M -->|"Xác nhận"| D["DELETE /api/categories/:id"]
    D --> EX{"Thể loại còn tồn tại?"}
    EX -->|"Không"| E404["404 Thể loại không tồn tại, tải lại bảng"]
    EX -->|"Có"| B{"Còn sách (chưa xóa) thuộc thể loại?"}
    B -->|"Có"| E409["409 Không thể xóa: còn N sách thuộc thể loại này"]
    B -->|"Không"| DEL["Xóa mềm thể loại"] --> OK(["Xóa dòng khỏi bảng, thông báo thành công"])
```

FE có thể ẩn hoặc vô hiệu hóa nút "Xóa" khi `Số sách > 0`, nhưng BE vẫn phải kiểm tra lại.

---

## 2.2.2 Thêm Sách Mới

**Actor:** Librarian · **API:** `POST /api/books`

```mermaid
flowchart TD
    S(["Click 'Thêm Sách Mới'"]) --> PRE{"Đã có ít nhất 1 thể loại?"}
    PRE -->|"Không"| NOCAT(["Thông báo: cần tạo thể loại trước, kèm link tới 2.2.1"])
    PRE -->|"Có"| F["Nhập Tên sách, Tác giả, Năm XB, ISBN, Thể loại, Mô tả, Số lượng"]
    F --> V{"Validate FE + Joi"}
    V -->|"Tên trống hoặc quá 100"| E["Hiển thị lỗi tại trường tương ứng"]
    V -->|"Tác giả trống hoặc quá 100"| E
    V -->|"Năm XB ngoài 1900 - năm hiện tại"| E
    V -->|"ISBN có nhập nhưng không phải ISBN-10/13 hợp lệ (checksum)"| E
    V -->|"Chưa chọn thể loại"| E
    V -->|"Mô tả trống hoặc quá 255"| E
    V -->|"Số lượng không phải số nguyên hoặc không lớn hơn 0"| E
    E --> F
    V -->|"Hợp lệ"| CAT{"Thể loại tồn tại và chưa bị xóa?"}
    CAT -->|"Không"| E2["400 Thể loại không tồn tại"] --> F
    CAT -->|"Có"| ISBN{"ISBN có nhập và đã tồn tại?"}
    ISBN -->|"Có"| E3["409 ISBN đã tồn tại"] --> F
    ISBN -->|"Không"| SAVE["Lưu sách: total = available = Số lượng, borrowed = 0"]
    SAVE --> OK(["Thông báo 'Thêm sách thành công', chuyển tới chi tiết sách"])
```

ISBN được chuẩn hóa (bỏ dấu `-` và khoảng trắng) trước khi kiểm tra và lưu. Trạng thái "Có sẵn" / "Hết sách" được suy ra từ `available > 0`, không lưu riêng.

---

## 2.2.3 Xem Danh Sách Sách

**Actor:** Mọi người, không cần đăng nhập · **API:** `GET /api/books?q=&categoryId=&sort=&page=`

```mermaid
flowchart TD
    S(["Mở trang Danh sách sách"]) --> P["Đọc tham số từ URL: q, categoryId, sort, page"]
    P --> N{"Tham số hợp lệ?"}
    N -->|"sort không thuộc name / year / popular"| D1["Dùng mặc định: Tên A-Z"]
    N -->|"page không phải số nguyên dương"| D2["Dùng page = 1"]
    N -->|"categoryId không tồn tại"| D3["Bỏ lọc thể loại"]
    N -->|"Hợp lệ"| Q
    D1 --> Q
    D2 --> Q
    D3 --> Q
    Q["Truy vấn sách chưa xóa: tìm q trong tên hoặc tác giả (không phân biệt hoa thường), lọc thể loại, sắp xếp, lấy 10 bản ghi"]
    Q --> R{"Có kết quả?"}
    R -->|"Không, và page > 1"| LAST["Chuyển về trang cuối có dữ liệu"]
    R -->|"Không, và page = 1"| EMPTY(["Trạng thái trống: Không tìm thấy sách phù hợp"])
    R -->|"Có"| SHOW(["Hiển thị Tên, Tác giả, Năm XB, Thể loại, Có sẵn, Đang mượn + phân trang"])
    SHOW --> CH["Người dùng đổi từ khóa / lọc / sắp xếp"] --> RST["Reset page = 1, cập nhật URL (debounce ô tìm kiếm)"] --> Q
```

Sắp xếp: **Tên** A-Z · **Năm XB** mới nhất trước · **Phổ biến** = số đơn mượn đã được xác nhận, giảm dần.

---

## 2.2.4 Xem Chi Tiết Sách

**Actor:** Mọi người · **API:** `GET /api/books/:id` (+ `GET /api/books/:id/borrows` cho Librarian)

```mermaid
flowchart TD
    S(["Click vào một sách"]) --> G["GET /api/books/:id"]
    G --> EX{"Sách tồn tại và chưa xóa?"}
    EX -->|"Không"| E404(["Trang 404: Sách không tồn tại"])
    EX -->|"Có"| INFO["Hiển thị Tên, Tác giả, ISBN, Năm XB, Mô tả, Có sẵn, Đang mượn"]
    INFO --> R{"Người xem là ai? (token tùy chọn)"}
    R -->|"Khách"| G1["Hiện nút 'Mượn sách'"] --> G2["Click thì chuyển tới Đăng nhập, lưu URL để quay lại"]
    R -->|"Reader"| RD{"available > 0?"}
    RD -->|"Có"| RB(["Hiện nút 'Mượn sách', sang flow 2.3.1"])
    RD -->|"Không"| RN(["Nút 'Mượn sách' bị vô hiệu hóa: Hết sách"])
    R -->|"Librarian"| LB["Hiện nút 'Sửa', 'Xóa' và bảng Lịch sử mượn: Độc giả, Ngày mượn, Hạn trả"]
    LB --> LH{"Có lịch sử?"}
    LH -->|"Không"| LE(["Chưa có lượt mượn nào"])
    LH -->|"Có"| LS(["Hiển thị lịch sử, mới nhất trước"])
    R -->|"Admin"| AD(["Chỉ xem thông tin"])
```

**Edge case:** Token không hợp lệ hoặc hết hạn trên API công khai → coi như Khách (không trả lỗi). API lịch sử mượn thì bắt buộc role Librarian, ngược lại trả `403`.

---

## 2.2.5 Sửa & Xóa Sách

**Actor:** Librarian · **API:** `PUT /api/books/:id`, `DELETE /api/books/:id`

### Sửa sách

```mermaid
flowchart TD
    S(["Chi tiết sách, click 'Sửa'"]) --> F["Form điền sẵn dữ liệu hiện tại"]
    F --> V{"Validate FE + Joi (cùng quy tắc với 2.2.2)"}
    V -->|"Không hợp lệ"| E1["Lỗi tại trường"] --> F
    V -->|"Hợp lệ"| EX{"Sách còn tồn tại?"}
    EX -->|"Không"| E404(["404 Sách đã bị xóa"])
    EX -->|"Có"| ISBN{"ISBN mới trùng với sách khác?"}
    ISBN -->|"Có"| E2["409 ISBN đã tồn tại"] --> F
    ISBN -->|"Không"| Q{"Số lượng thay đổi? delta = mới - cũ"}
    Q -->|"Không đổi"| SAVE
    Q -->|"Tăng"| UP["available += delta"] --> SAVE
    Q -->|"Giảm"| DN{"available + delta >= 0? (không giảm dưới số bản đang được mượn)"}
    DN -->|"Không"| E3["409 Không thể giảm: đang có N bản được mượn"] --> F
    DN -->|"Có"| DOWN["available += delta"] --> SAVE
    SAVE["Lưu trong transaction: total = Số lượng mới, giữ total = available + borrowed"]
    SAVE --> OK(["Thông báo 'Cập nhật thành công', về trang chi tiết"])
    F --> CANCEL["Click 'Hủy'"] --> BACK(["Về chi tiết, không lưu"])
```

### Xóa sách (deletion guard)

```mermaid
flowchart TD
    S(["Chi tiết sách, click 'Xóa'"]) --> M["Modal: Bạn chắc chắn muốn xóa sách X?"]
    M -->|"Hủy"| C(["Đóng modal"])
    M -->|"Xác nhận"| D["DELETE /api/books/:id"]
    D --> EX{"Sách còn tồn tại?"}
    EX -->|"Không"| E404["404 Sách không tồn tại"]
    EX -->|"Có"| A{"Có đơn mượn hoạt động? (Chờ xác nhận, Đang mượn, Quá hạn)"}
    A -->|"Có"| E409["409 Không thể xóa: sách đang có N đơn mượn hoạt động"]
    A -->|"Không"| DEL["Xóa mềm sách, giữ lịch sử mượn và phiếu phạt"]
    DEL --> OK(["Thông báo 'Xóa thành công', về Danh sách sách"])
```
