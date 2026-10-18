# ParkOne — Bãi xe thông minh

## 1. Định vị

- **Tên sản phẩm:** ParkOne
- **Mô tả ngắn:** Quản lý bãi xe thông minh: làn vào/ra, sơ đồ chỗ đỗ theo khu, phiên gửi xe, vé lượt & vé tháng, thu ngân ca trực, sự cố và báo cáo lưu lượng – doanh thu.
- **Địa chỉ triển khai:** https://parking.khoadev.vn
- **Màu chủ đạo:** `#0f766e` (teal). Sider tối `#0b2b28`, trigger `#08201e`, body `#f3f7f6`, table header `#eef5f3`.
- **Favicon:** SVG inline chữ **P** nền `#0f766e`. Tiêu đề trang: `ParkOne — Quản lý bãi xe thông minh`.
- **Ngôn ngữ:** tiếng Việt 100%.
- **Bối cảnh seed:** Bãi xe tòa nhà "KhoaDev Tower": 2 khu ô tô (tầng 1) + 1 khu xe máy (tầng B1).

## 2. Nền tảng kỹ thuật

- React 19 + TypeScript + Vite 8 + Ant Design 6 + dayjs + Dexie 4 (IndexedDB) + SCSS Modules + react-router-dom 7 (**HashRouter**).
- Tham chiếu pattern từ `C:\Users\khoadev\Desktop\Code\Khoadev\gara` (app/theme, providers, RoleContext, router, layouts/MainLayout, components, db + seed, services, styles/global.scss, modules/dashboard, modules/reports, modules/settings).
- `npm.cmd` (PowerShell chặn npm.ps1); build sạch `npm.cmd run build`; `verbatimModuleSyntax` → `import type`; AntD 6: `App.useApp()`, `<Alert title=...>`, `Space orientation="vertical"`, `Tabs items`, `Popover styles={{ content }}`.

## 3. Vai trò & phân quyền

| Vai trò | Mã | Trang mặc định |
|---|---|---|
| Quản lý bãi | MANAGER | /dashboard |
| Nhân viên bãi | ATTENDANT | /gate |
| Thu ngân | CASHIER | /cashier |

## 4. Menu & màn hình

```
Tổng quan → /dashboard
Vận hành  → /gate, /sessions, /map, /incidents
Khách & vé → /customers, /subscriptions
Tài chính → /cashier
Quản trị  → /reports, /pricing, /settings
```

### 4.1 /dashboard
- KPI: Xe đang trong bãi, Chỗ trống (x/tổng), Lượt vào hôm nay, Lượt ra hôm nay, Doanh thu hôm nay, Xe quá 24h.
- Money row: Doanh thu 7 ngày, Vé tháng đang hiệu lực, Vé tháng sắp hết hạn (≤7 ngày), Doanh thu tháng này.
- Charts tự vẽ div+Tooltip: **Lưu lượng theo giờ hôm nay** (vào/xa stacked), **Doanh thu 7 ngày**, **Cơ cấu doanh thu 30 ngày** (vé lượt / vé tháng / phụ phí — progress bars).
- Lists: Phiên quá 24h (5), Vé tháng sắp hết hạn (5), Hoạt động gần đây (8).

### 4.2 /map — Sơ đồ bãi
- Segmented chọn khu (Khu A / Khu B / Khu M) + thống kê khu (tổng/đang đỗ/trống/bảo trì) + legend.
- Grid ô đỗ (CSS grid): màu theo trạng thái — Trống (viền xanh nhạt), Đang đỗ (fill teal + biển số rút gọn), Quá 24h (đỏ), Bảo trì (xám gạch chéo). Ô click được:
  - Đang đỗ → Drawer: biển số, loại xe, chỗ, giờ vào, thời lượng, loại vé, phí tạm tính; nút **Cho xe ra** (→ /gate?tab=out&plate=...), **Chuyển chỗ** (modal chọn ô trống cùng khu), **Ghi chú**.
  - Trống → nút **Cho xe vào** (→ /gate?tab=in&slot=...), **Chuyển sang bảo trì** / ngược lại.

### 4.3 /gate — Làn vào / Làn ra (trọng tâm)
Segmented 2 chế độ, đồng bộ query `?tab=in|out`.
- **Làn vào:** form 2 cột (Card):
  - Biển số input tự động viết hoa + chuẩn hóa ("30a123.45" → "30A-123.45", xe máy "29b2 45678" → "29-B2 456.78"). Nút **Quét biển số (AI)** → modal giả lập camera (khung tối + hiệu ứng quét + đếm ~1.2s) → trả biển số ngẫu nhiên kèm độ tin cậy 92–98%, nút "Nhập tay" để đóng.
  - Phát hiện thông minh: nếu biển khớp **vé tháng đang hiệu lực** → banner xanh "Khách vé tháng: tên — hạn …", loại vé tự chuyển SUBSCRIPTION; nếu xe **đang có phiên IN** → cảnh báo đỏ chặn (hiện chỗ + giờ vào).
  - Chọn loại xe (Ô tô / Xe máy) + chọn chỗ đỗ (Select ô trống theo khu của loại xe, nút **Chọn tự động** lấy ô trống đầu tiên) + ghi chú.
  - Nút **Xe vào** → tạo phiên + modal thành công (mã phiếu, chỗ, giờ vào) + nút **In phiếu gửi xe** (A5) + "Tiếp tục". Barrier "mở" bằng hiệu ứng (icon + message) — không cần animation phức tạp.
  - Cột phải: bảng compact **đang trong bãi** (search + click chọn nhanh).
- **Làn ra:** nhập/quét biển số → tìm phiên → Card: biển, chỗ, vào lúc, thời lượng, bảng tính phí chi tiết (miễn phí n phút / giá bậc / phần vượt / tổng; vé tháng → 0đ). Nút **Thu tiền & mở barrier** → modal thanh toán (phương thức Tiền mặt / Chuyển khoản / Thẻ; tiền mặt có mệnh giá nhanh + tiền thối) → đóng phiên + tạo payment + modal hoá đơn (nút In hoá đơn A5). Không tìm thấy → gợi ý **Báo mất vé** (tạo incident + tra theo chỗ).

### 4.4 /sessions — Phiên gửi xe (2 tabs)
- **Đang gửi:** bảng: mã phiếu, biển số, loại xe, chỗ (khu), giờ vào, thời lượng (tính khi render), loại vé (Lượt/Vé tháng), phí tạm tính, trạng thái (bình thường / **Quá 24h** đỏ); actions: Cho ra, Chuyển chỗ, Ghi chú. Filters: search, loại xe, khu, toggle quá hạn.
- **Lịch sử:** bảng phiên đã ra (mã, biển, vào–ra, thời lượng, phí, thanh toán, thu ngân); filter ngày (mặc định 7 ngày) + search; nút **Xuất CSV**.

### 4.5 /incidents — Sự cố
- Bảng: mã `SC-...`, loại (Mất vé / Quá hạn / Va chạm / Thiết bị / Khác — tag), biển số/phiên, phụ phí, mô tả, trạng thái (Mới / Đã xử lý), tạo lúc, xử lý bởi.
- Nút **Tạo sự cố**: modal (loại, biển số, phiên liên quan nếu có, mô tả, phụ phí tự đề xuất theo bảng giá với Mất vé, checkbox **Lập phiếu thu luôn** → tạo payment INCIDENT). Action **Đánh dấu đã xử lý** (ghi mô tả giải quyết).

### 4.6 /customers — Khách hàng
- KPI mini: tổng khách, khách mới tháng, khách có vé tháng.
- Bảng: mã, tên, SĐT, xe gắn kèm (chips biển số), vé tháng (trạng thái + hạn), lần gửi gần nhất, tổng chi tiêu. Thêm/sửa.
- Drawer: thông tin + xe (thêm/xoá) + lịch sử vé tháng + phiên gần đây + thanh toán.

### 4.7 /subscriptions — Vé tháng
- Bảng: mã vé, khách, biển số, gói (1/3/6/12 tháng — tag), giá, từ ngày → đến ngày, **còn lại n ngày** (Progress), trạng thái (Hiệu lực / Sắp hết hạn / Hết hạn / Đã huỷ). Filter trạng thái + search. Sắp hết hạn tô cam.
- Nút **Bán vé tháng**: modal (khách select + tạo nhanh, xe select + tạo nhanh theo biển số, gói → giá tự tính theo bảng giá, ngày bắt đầu) → tạo subscription + payment + log.
- Actions: **Gia hạn** (chọn gói, cộng tiếp từ ngày hết hạn), **Huỷ**.

### 4.8 /cashier — Thu ngân & ca trực (3 tabs)
- **Giao dịch:** bảng payments (giờ, mã, loại (Phiên gửi xe / Vé tháng / Phụ phí), diễn giải, số tiền, phương thức, thu ngân, ca) + Statistic tổng theo phương thức; filter ngày (mặc định hôm nay).
- **Ca trực:** bảng ca (mã `CA-...`, nhân viên, mở lúc, đóng lúc, tiền đầu ca, doanh thu ca, số giao dịch, tiền mặt dự kiến, thực đếm, lệch, trạng thái). Nút **Mở ca** (chọn NV + tiền đầu ca) / **Đóng ca** (modal tóm tắt + nhập tiền thực đếm → hiện thừa/thiếu → đóng + log). Ca đang mở highlight teal.
- **Đối soát:** chọn ngày → bảng theo ca: tiền mặt / chuyển khoản / tổng, lệch quỹ; dòng tổng ngày.

### 4.9 /reports — Báo cáo (3 tabs)
- **Doanh thu:** theo ngày (bảng + bar 30 ngày), theo loại (vé lượt / vé tháng / phụ phí — Statistic + Progress), theo phương thức; tổng kỳ; **Xuất CSV**.
- **Lưu lượng:** vào/ra theo giờ (bar 6h–22h, tổng hợp 30 ngày), theo ngày trong tuần, giờ cao điểm; lượt theo loại xe.
- **Khách & vé:** số vé tháng đang hiệu lực theo gói, doanh thu vé tháng theo tháng, top khách chi tiêu, tỷ lệ lấp đầy trung bình theo khu (Progress).

### 4.10 /pricing — Bảng giá
- Form (settings): với Xe máy & Ô tô: số phút miễn phí, giá bậc 1, số giờ bậc 1, giá mỗi giờ tiếp, mức tối đa/ngày, phụ phí mất vé; 4 gói vé tháng mỗi loại xe (giá editable).
- **Máy tính thử phí**: chọn loại xe + giờ vào + giờ ra → hiện phí theo cấu hình (dùng đúng service tính phí). Nút Lưu.

### 4.11 /settings — Thiết lập
- Thông tin bãi (tên "Bãi xe KhoaDev Tower", địa chỉ, hotline, giờ hoạt động), cấu hình AI/camera (toggle "Tự động nhận diện biển số" + ngưỡng tin cậy — mock, lưu settings), mẫu in (footer phiếu gửi xe), sao lưu / khôi phục JSON / khôi phục dữ liệu mẫu, thông tin KhoaDev (khoadev.vn — khoadev.company@gmail.com).

## 5. Mô hình dữ liệu (Dexie)

```
employees(id, &code, name, role, phone, active)
zones(id, &code, name, vehicleType, floor, active)
slots(id, &code, zoneId, baseStatus, note?)                     // baseStatus: AVAILABLE | MAINTENANCE
customers(id, &code, name, phone, normalizedPhone, createdAt, note?)
vehicles(id, plate, normalizedPlate, vehicleType, customerId, brandModel?, color?, active)
subscriptions(id, &code, customerId, vehicleId, plan, startDate, endDate, priceVnd, status, createdAt, note?)
sessions(id, &code, plate, normalizedPlate, vehicleType, slotId, customerId?, subscriptionId?, ticketType, checkInAt, checkOutAt?, status, feeVnd?, paymentMethod?, lostTicket, note?)
payments(id, &code, type, sessionId?, subscriptionId?, incidentId?, amountVnd, method, at, cashierId?, shiftId?, note?)
shifts(id, &code, employeeId, openedAt, closedAt?, openingCashVnd, countedCashVnd?, status, note?)
incidents(id, &code, sessionId?, plate?, type, description, feeVnd?, status, createdAt, resolvedAt?, handledById?, resolution?)
settings(key, value)      // PARKING_INFO, PRICING, SUBSCRIPTION_PLANS, PRINT_CONFIG, APP_META...
activityLogs(id, [entityType+entityId], at, actorName, summary, entityType, entityId)
documentSequences(id, [type+period], lastNumber)
```

- Chứng từ: phiếu gửi xe `PG-...` (mã phiên), `HD-` (thanh toán), `VT-` (vé tháng), `CA-` (ca), `SC-` (sự cố).
- **Giá mặc định:** Xe máy: miễn phí 15p, 5.000đ/4 giờ đầu, +2.000đ/giờ tiếp, tối đa 30.000đ/ngày, mất vé 50.000đ. Ô tô: miễn phí 15p, 25.000đ/2 giờ đầu, +15.000đ/giờ tiếp, tối đa 200.000đ/ngày, mất vé 200.000đ. Vé tháng: xe máy 100k/270k/500k/900k (1/3/6/12 tháng); ô tô 1.000k/2.700k/5.000k/9.000k.
- Công thức phí (service dùng chung cho /gate, /pricing calculator): `phút ≤ freeMinutes → 0`; ngược lại `fee = firstRate + max(0, ceil(giờ) − firstRateHours) × extraPerHour`, chặn `≤ dayCap × ceil(giờ/24)`. Vé tháng → 0.
- Mọi thao tác nhiều bảng trong `db.transaction` + log activity. `operationId` chống ghi trùng theo pattern gara.

## 6. Quy trình nghiệp vụ chính

```
Xe vào (quét biển → nhận diện vé tháng → chọn chỗ → in phiếu gửi xe)
→ Đang gửi (sơ đồ bãi, chuyển chỗ, sự cố, quá 24h)
→ Xe ra (tính phí theo bảng giá → thu tiền / vé tháng miễn phí → hoá đơn)
→ Ca trực (mở/đóng ca, đối soát quỹ) → Báo cáo doanh thu – lưu lượng – khách vé tháng
```

## 7. Dữ liệu mẫu (seed) — yêu cầu chi tiết

- **Nhân viên (~7):** 1 quản lý (Đỗ Văn Khánh), 3 nhân viên bãi (Nguyễn Thành Long, Trần Văn Dũng, Phạm Hải Yến), 2 thu ngân (Lê Thu Trang, Hoàng Minh Châu), 1 kỹ thuật (Bùi Đức Anh).
- **Khu & ô:** Khu A — Ô tô tầng 1 (24 ô A1–A24), Khu B — Ô tô tầng 1 cánh phải (16 ô B1–B16), Khu M — Xe máy tầng B1 (40 ô M1–M40). Ô bảo trì: A18, M07.
- **~14 khách** (gồm 2 công ty nhỏ, mỗi công ty 2–3 xe) + ~26 xe (xe ô tô biển 30A/29H/51F/30E/29A…, xe máy 29-B2/29-F3/30-G4…).
- **11 vé tháng đang hiệu lực** (8 xe máy đủ gói, 3 ô tô), **3 sắp hết hạn** (5–7 ngày), **2 đã hết hạn**, **1 đã huỷ**.
- **~42 phiên đang gửi** (khoảng 28 ô tô + 14 xe máy; 3 phiên quá 24h; 2–3 phiên của khách vé tháng), giờ vào trải hôm nay → 2 ngày trước.
- **~260 phiên lịch sử** đã ra trong 14 ngày (mỗi ngày 15–22 phiên, hôm nay ~16) kèm payments tương ứng; tổng doanh thu mỗi ngày 700k–1.6tr.
- **Ca trực:** 2 ngày trước đó các ca đã đóng (sáng/chiều/tối), hôm nay ca sáng đã đóng + ca chiều **đang mở** (thu ngân Lê Thu Trang), tối chưa mở.
- **5 sự cố:** 1 mất vé hôm qua đã xử lý (phụ phí 200k), 1 va chạm đã xử lý, 1 quá hạn mới (NEW) hôm nay, 1 hỏng đầu đọc thẻ đã xử lý, 1 mất vé mới.
- **Activity logs ~15.**

## 8. In ấn

- **Phiếu gửi xe** (A5 `.print-root`): header bãi (tên, địa chỉ, hotline), mã phiếu đậm + to, biển số, loại xe, chỗ, giờ vào, ghi chú "Vui lòng giữ phiếu", giờ hoạt động.
- **Hoá đơn thanh toán** (A5): thời gian vào–ra, thời lượng, bảng phí (miễn phí / bậc giá / phụ phí), tổng, hình thức thanh toán, tiền nhận + tiền thối, thu ngân, mã hoá đơn, cảm ơn.

## 9. Nghiệm thu

- `npm.cmd install` + `npm.cmd run build` thành công (tsc + vite build).
- `npm.cmd run dev` mở được, đổi vai trò; luồng demo trọn vẹn: sơ đồ bãi → xe vào (quét biển giả lập) → in phiếu → xe ra → thu phí → hoá đơn; bán vé tháng; mở/đóng ca; báo cáo có số liệu.
- README.md tiếng Việt; toàn bộ file UTF-8; không lỗi TypeScript; không console error khi thao tác chính.
