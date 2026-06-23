# Truyện 2K MVP

Static MVP cho web đọc truyện thu phí ở Việt Nam.

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
- Chương miễn phí và chương khóa.
- VIP 30 ngày hoặc mở chương bằng xu.
- Reader tiếng Việt rõ dấu trên desktop/mobile, có nền sáng/nền tối.
- Mỗi chương có khu vực nghe audio: ưu tiên file MP3 nếu đã upload, nếu chưa có thì dùng giọng đọc của trình duyệt.
- Checkout payOS/VietQR ở chế độ thử nghiệm: bấm "Xác nhận thanh toán thử" để kích hoạt gói trên máy hiện tại.
- Bình luận ở trang truyện và từng chương.
- Nếu đã cấu hình Supabase, bình luận sẽ đồng bộ chung cho mọi độc giả.
- Lưu ví xu, VIP, chương đã mở và lịch sử giao dịch bằng `localStorage`.
- Trang quản trị nội bộ để xem tổng truyện, chương khóa, giao dịch.

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

## Tạo Audio Cho Chương

Nghe nhanh trên web dùng Web Speech API của trình duyệt. Muốn upload file MP3 thật cho từng chương thì chạy:

```powershell
python tools/generate_chapter_audio.py --chapter c001
python tools/build_doc_truyen_data.py
```

Tạo toàn bộ chương:

```powershell
python tools/generate_chapter_audio.py --all
python tools/build_doc_truyen_data.py
```

File MP3 sẽ nằm trong `doc-truyen-vip/audio/`. Khi file `audio/c001.mp3` tồn tại, `build_doc_truyen_data.py` sẽ tự gắn `audioUrl` vào chương `c001`, và trang đọc sẽ hiện player MP3.

## Gen Audio Và Upload Một Lệnh

Luồng an toàn mới là: gen MP3 dưới máy, verify file, rebuild `data.js`, rồi mới upload. Web chỉ dùng MP3 đã có trong `doc-truyen-vip/audio/verified-audio.json`, nên file cũ hoặc file lỗi sẽ không tự bật.

Gen 1 chương, 1 giọng, chưa upload:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset nu-cam-xuc -Engine video
```

Gen 1 chương đủ 5 giọng và upload lên GitHub Pages:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset all -Engine video -Upload -Message "Upload c001 audio"
```

Gen thử 3 chương đầu, 1 giọng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -All -Limit 3 -Preset nu-cam-xuc -Engine video -Upload
```

## Nâng Cấp Lên Bản Thật

1. Chuyển data từ `data.js` sang database Supabase/Postgres.
2. Thêm auth thật: email/password hoặc Google.
3. Tạo API server:
   - `POST /api/payments/create` gọi payOS tạo payment link/QR.
   - `POST /api/payments/webhook` xác thực webhook và cấp VIP/xu.
4. Thêm bảng giao dịch có `orderCode`, `userId`, `planId`, `amount`, `status`.
5. Khóa chương ở server, không chỉ khóa ở frontend.
