# DocTruyen VIP MVP

Static MVP cho web doc truyen thu phi o Viet Nam.

## Cach chay

Mo `index.html` bang trinh duyet.

## Tinh nang co san

- Trang chu, thu vien, trang chi tiet truyen, reader mode.
- Chuong mien phi va chuong khoa.
- VIP 30 ngay hoac mo chuong bang xu.
- Checkout payOS/VietQR mock: bam "Mo phong da thanh toan" de kich hoat goi.
- Luu vi xu, VIP, chuong da mo va lich su giao dich bang `localStorage`.
- Admin demo de xem tong truyen, chuong khoa, giao dich.

## Nang cap len ban that

1. Chuyen data tu `data.js` sang database Supabase/Postgres.
2. Them auth that: email/password hoac Google.
3. Tao API server:
   - `POST /api/payments/create` goi payOS tao payment link/QR.
   - `POST /api/payments/webhook` xac thuc webhook va cap VIP/xu.
4. Them bang giao dich co `orderCode`, `userId`, `planId`, `amount`, `status`.
5. Khoa chuong o server, khong chi khoa o frontend.
