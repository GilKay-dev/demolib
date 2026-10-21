# 04 — Trả Sách (2.4)

## 2.4.1 Yêu Cầu Trả Sách

**Actor:** Reader · **API:** `POST /api/borrows/:id/return-requests`

```mermaid
flowchart TD
    S(["Độc giả vào 'Lịch sử mượn sách'"]) --> L["Xem danh sách sách Đang mượn / Quá hạn"]
    L --> CL["Click 'Xin trả sách' trên một dòng"]
    CL --> M["Modal: Xác nhận gửi yêu cầu trả? Bạn cần mang sách tới thư viện để nhân viên xác nhận."]
    M -->|"Hủy"| C(["Đóng modal, không thay đổi"])
    M -->|"Xác nhận"| API["POST /api/borrows/:id/return-requests"]
    API --> EX{"Đơn mượn tồn tại?"}
    EX -->|"Không"| E404["404 Đơn mượn không tồn tại"]
    EX -->|"Có"| OWN{"Đơn thuộc về user hiện tại?"}
    OWN -->|"Không"| E403["403 Không có quyền"]
    OWN -->|"Có"| ST{"status là Đang mượn hoặc Quá hạn?"}
    ST -->|"Không"| E1["409 Chỉ yêu cầu trả được sách đang mượn"]
    ST -->|"Có"| P{"Đã có yêu cầu trả Chờ xác nhận cho đơn này?"}
    P -->|"Có"| E2["409 Bạn đã gửi yêu cầu trả cho sách này"]
    P -->|"Không"| CR["Tạo yêu cầu trả: status = Chờ xác nhận, requested_at = bây giờ"]
    CR --> OK(["Thông báo thành công; dòng hiện nhãn 'Đã gửi yêu cầu trả', ẩn nút Gia hạn"])
```

**Edge case:** Unique partial index `(borrow_id) WHERE status = 'Chờ xác nhận'` ở DB đảm bảo chỉ có một yêu cầu chờ, kể cả khi độc giả bấm hai lần liên tiếp.

---

## 2.4.2 Xác Nhận Trả Sách

**Actor:** Librarian · **API:** `GET /api/return-requests?status=pending`, `POST /api/return-requests/:id/confirm`
body `{ condition, conditionFineLevelId?, note?, lateFineLevelId? }`

### Màn hình xác nhận

```mermaid
flowchart TD
    S(["NV vào 'Quản lý mượn trả', tab 'Chờ xác nhận trả'"]) --> L["Danh sách yêu cầu chờ: Độc giả, Sách, Ngày mượn, Hạn trả, Ngày gửi yêu cầu, Trễ N ngày"]
    L --> H{"Có yêu cầu nào?"}
    H -->|"Không"| EMPTY(["Không có yêu cầu trả chờ xác nhận"])
    H -->|"Có"| PHY["Nhận sách vật lý từ độc giả"]
    PHY --> CL["Click 'Xác nhận trả'"]
    CL --> LATE{"Hôm nay sau due_date? (hệ thống tự tính)"}
    LATE -->|"Có"| LF["Form hiện thêm mục bắt buộc: Mức phạt Trả muộn, kèm số ngày trễ"]
    LATE -->|"Không"| FM
    LF --> FM["Chọn tình trạng sách: Bình thường / Hư hỏng / Mất"]
    FM --> CD{"Tình trạng?"}
    CD -->|"Bình thường"| SUB
    CD -->|"Hư hỏng hoặc Mất"| DM["Hiện thêm: Mức phạt (bắt buộc) và Ghi chú (bắt buộc, tối đa 500 ký tự)"]
    DM --> SUB["Bấm 'Xác nhận'"]
    SUB --> V{"Validate FE + Joi"}
    V -->|"Chưa chọn tình trạng"| E1["Lỗi: Bắt buộc chọn tình trạng"] --> FM
    V -->|"Hư hỏng/Mất mà thiếu mức phạt hoặc ghi chú, hoặc ghi chú quá 500"| E2["Lỗi tại trường"] --> FM
    V -->|"Trả muộn mà thiếu mức phạt Trả muộn"| E3["Lỗi: Bắt buộc chọn mức phạt trả muộn"] --> FM
    V -->|"Hợp lệ"| TX(["Gửi API, sang xử lý ở server"])
```

Nếu Admin chưa cấu hình mức phạt nào, dropdown sẽ trống và form hiện cảnh báo "Chưa có mức phạt, liên hệ quản lý viên (2.5.1)". Khi đó chỉ xác nhận được trường hợp Bình thường và không trễ hạn.

### Xử lý ở server (một transaction)

```mermaid
flowchart TD
    S(["POST /api/return-requests/:id/confirm"]) --> RQ{"Yêu cầu tồn tại và vẫn Chờ xác nhận?"}
    RQ -->|"Không"| E1["409 Yêu cầu đã được xử lý, tải lại danh sách"]
    RQ -->|"Có"| LATE{"Ngày trả sau due_date?"}
    LATE -->|"Có, thiếu lateFineLevelId"| E2["400 Thiếu mức phạt trả muộn"]
    LATE -->|"Có"| FL1{"Mức phạt tồn tại và chưa xóa?"}
    FL1 -->|"Không"| E3["400 Mức phạt không tồn tại"]
    FL1 -->|"Có"| LFINE["Tạo phiếu phạt loại Trả muộn: snapshot tên + số tiền, status = Chưa thanh toán"]
    LATE -->|"Không"| CD
    LFINE --> CD{"Tình trạng?"}

    CD -->|"Bình thường"| N1["available +1, borrowed -1"]
    CD -->|"Hư hỏng"| D0{"Mức phạt hợp lệ và có ghi chú?"}
    CD -->|"Mất"| D0
    D0 -->|"Không"| E4["400 Thiếu hoặc sai mức phạt / ghi chú"]
    D0 -->|"Có"| D1["Tạo phiếu phạt loại Hư hỏng hoặc Mất: snapshot mức phạt, lưu ghi chú, status = Chưa thanh toán"]
    D1 --> D2["borrowed -1, total -1 (bản sách không quay lại kho)"]

    N1 --> FIN
    D2 --> FIN["Đơn mượn: status = Đã trả, return_date = hôm nay, condition = tình trạng đã chọn"]
    FIN --> RR["Yêu cầu trả: status = Đã xác nhận, confirmed_by = NV"]
    RR --> OK(["Commit; thông báo thành công kèm tổng tiền phạt đã tạo (nếu có)"])
    E2 --> RB(["Rollback, không ghi gì"])
    E3 --> RB
    E4 --> RB
```

**Tổng hợp kết quả:**

| Tình trạng | Trễ hạn? | Phiếu phạt được tạo | Tồn kho | Đơn mượn |
|---|---|---|---|---|
| Bình thường | Không | — | available +1, borrowed −1 | Đã trả |
| Bình thường | Có | Trả muộn | available +1, borrowed −1 | Đã trả |
| Hư hỏng | Không | Hư hỏng | borrowed −1, total −1 | Đã trả |
| Hư hỏng | Có | Hư hỏng + Trả muộn | borrowed −1, total −1 | Đã trả |
| Mất | Không | Mất | borrowed −1, total −1 | Đã trả |
| Mất | Có | Mất + Trả muộn | borrowed −1, total −1 | Đã trả |

Sau khi có phiếu phạt, độc giả sẽ bị chặn mượn ở 2.3.1 cho tới khi mọi phiếu ở trạng thái "Đã thanh toán".
