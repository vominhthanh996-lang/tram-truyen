# Truyện 2K MVP

Static MVP cho web đọc truyện miễn phí ở Việt Nam.

## Cách chạy

Mở `index.html` bằng trình duyệt.

## Tên Miền Production

GitHub Pages hiện dùng URL mặc định của repo. Muốn mất hẳn `github.io` và tên tài khoản GitHub thì cần mua hoặc trỏ một domain riêng, ví dụ `truyen2k.vn`, `truyen2k.com`, hoặc `doc.truyen2k.vn`.

Các bước khi đã có domain:

1. Tạo file `CNAME` trong `doc-truyen-vip/` chứa đúng domain.
2. Trỏ DNS của domain về GitHub Pages.
3. Bật HTTPS trong Settings -> Pages.

## Tính năng có sẵn

- Trang chủ, thư viện, trang chi tiết truyện, reader mode.
- Tất cả chương đang mở miễn phí.
- Reader tiếng Việt rõ dấu trên desktop/mobile, có nền sáng/nền tối.
- Mỗi chương có khu vực nghe audio: dùng 2 giọng Edge tiếng Việt miễn phí thật là Hoài My và Nam Minh.
- Bình luận ở trang truyện và từng chương.
- Nếu đã cấu hình Supabase, bình luận sẽ đồng bộ chung cho mọi độc giả.
- Lưu chương đang đọc và tuỳ chọn reader/audio bằng `localStorage`.
- Trang quản trị nội bộ để xem tổng truyện và chương miễn phí.

## Bật Bình Luận Chung Bằng Supabase

1. Tạo project trên Supabase.
2. Mở SQL Editor và chạy file `supabase-schema.sql`.
3. Vào Project Settings -> API, lấy `Project URL` và `anon public key`.
4. Điền vào `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_ANON_PUBLIC_KEY"
};
```

Khi hai giá trị này có thật, web sẽ dùng Supabase REST API để đọc/ghi bình luận chung.

## OTP Email 20 Phút

Frontend đang giới hạn mã xác nhận email trong 20 phút. Để khóa thật ở server, vào Supabase Dashboard:

1. `Authentication` -> `Providers` -> `Email`.
2. Set `Email OTP Expiration` = `1200` giây.
3. Save config.

Nếu chỉ sửa frontend mà không set trên Supabase, người dùng bình thường sẽ thấy hết hạn sau 20 phút, nhưng server vẫn có thể chấp nhận mã theo cấu hình Supabase.

## Tạo Audio Edge Cho Chương

Edge hiện có 2 giọng Việt thật, miễn phí và không cần API key:

- `nu-cam-xuc`: Hoài My - nữ Việt.
- `nam-tram`: Nam Minh - nam Việt.

Gen 1 chương 1 giọng:

```powershell
python tools/generate_chapter_audio.py --chapter c001 --preset nu-cam-xuc --engine video --overwrite
python tools/build_doc_truyen_data.py
```

Tạo chương 1 đủ 2 giọng và upload lên GitHub Pages:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset all -Engine video -Overwrite -Upload -Message "Upload c001 Edge audio"
```

File MP3 chỉ được web gắn vào `data.js` sau khi verify và có `provider: "edge"` trong `doc-truyen-vip/audio/verified-audio.json`.

## Gen Audio Và Upload Một Lệnh

Luồng an toàn mới là: gen MP3 dưới máy, verify file, rebuild `data.js`, rồi mới upload. Web chỉ dùng MP3 đã có trong `doc-truyen-vip/audio/verified-audio.json`, nên file cũ hoặc file lỗi sẽ không tự bật.

Gen 1 chương, 1 giọng, chưa upload:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset nu-cam-xuc -Engine video -Overwrite
```

Gen 1 chương đủ 2 giọng và upload lên GitHub Pages:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset all -Engine video -Overwrite -Upload -Message "Upload c001 Edge audio"
```

Gen thử 3 chương đầu, 1 giọng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -All -Limit 3 -Preset nu-cam-xuc -Engine video -Overwrite -Upload
```

## Nâng Cấp Lên Bản Thật

1. Chuyển data từ `data.js` sang database Supabase/Postgres.
2. Thêm auth thật: email/password hoặc Google.
3. Tạo API server:
   - `POST /api/payments/create` gọi payOS tạo payment link/QR.
   - `POST /api/payments/webhook` xác thực webhook và cấp VIP/xu.
4. Thêm bảng giao dịch có `orderCode`, `userId`, `planId`, `amount`, `status`.
5. Khóa chương ở server, không chỉ khóa ở frontend.
