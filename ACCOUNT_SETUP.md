# Account va VIP

Web dung Supabase Auth de dang nhap bang email magic link.
Frontend hien ho tro 3 cach:

- Dang nhap bang email + mat khau.
- Tao account bang email + mat khau.
- Gui magic link qua email.

## Da cau hinh

- Site URL: `https://vominhthanh996-lang.github.io/truyen-2k/`
- Redirect URL: `https://vominhthanh996-lang.github.io/truyen-2k/`
- Frontend dung `doc-truyen-vip/supabase-config.js`.

## Bang database

File `supabase-comments-schema.sql` tao cac bang:

- `comments`: binh luan, co `user_id` va `user_email` neu doc gia da dang nhap.
- `profiles`: ho so user co email va ten hien thi.
- `vip_entitlements`: ghi nhan user nao dang co VIP.
- `stories`: metadata truyen hien public duoc, khong co noi dung chuong.
- `story_chapters`: metadata chuong, trang thai free/tinh phi, gia xu, audio URL.
- `story_chapter_bodies`: noi dung chuong. Bang nay khong co policy public select, browser khong doc truc tiep duoc.
- `account_wallets`: so du VND/xu cua user, frontend chi doc.
- `reading_progress`: user dang doc toi truyen/chuong nao.
- `unlocked_chapters`: nhung chuong user da mo khoa rieng.
- `coin_transactions`: lich su nap/tru xu cua tung user.

## Doc truyen tu database

Frontend chi goi 2 function:

```sql
public.get_story_catalog()
public.get_chapter_for_reader(p_story_id, p_chapter_id)
```

`get_story_catalog()` chi tra metadata va danh sach chuong, khong tra body.
`get_chapter_for_reader()` kiem tra chuong free, VIP, hoac da mo khoa trong DB roi moi tra `body`.
Neu chua du quyen, function khong tra noi dung chuong.

File `data.js` khong con duoc publish len GitHub Pages. Workflow deploy xoa file nay khoi artifact de tranh lo full text tren frontend.

## Mo khoa chuong bang xu

Frontend khong tu tru xu. Khi doc gia bam mo khoa chuong, web goi function Supabase:

```sql
public.unlock_chapter_with_coins(p_story_id, p_chapter_id)
```

Function nay lay gia tu bang `story_chapters`, khoa dong vi cua user, kiem tra du xu, tru `account_wallets.coin_balance`, ghi `coin_transactions`, roi ghi `unlocked_chapters`.

Neu chuong da mo roi thi function tra ve thanh cong va khong tru xu lan nua.
Neu user khong du xu thi tra loi `INSUFFICIENT_COINS`.

## Ghi nhan VIP thu cong

Sau nay khi co payment webhook, backend se insert vao `vip_entitlements`. Trong luc chua co payment, co the kich hoat thu cong bang SQL:

```sql
insert into public.vip_entitlements (user_id, plan_id, active_until, source, note)
values (
  'USER_ID_TREN_SUPABASE_AUTH',
  'vip-monthly',
  now() + interval '30 days',
  'manual',
  'Kich hoat thu cong'
);
```

Nguoi dung chi doc duoc entitlement cua chinh ho qua RLS.

## Payment sau nay

Khi noi payment that, webhook can lam 3 viec:

1. Xac minh giao dich thanh cong.
2. Tim `user_id` cua account mua goi.
3. Insert/update `vip_entitlements`, `account_wallets`, `coin_transactions`, hoac `unlocked_chapters`.

Khong de frontend tu cap nhat VIP/vi tien, vi user co the sua code tren trinh duyet.
