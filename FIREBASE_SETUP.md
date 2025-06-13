# Firebase Setup untuk Timeout Testing

## 🚨 Masalah yang Terjadi

Error: `Unable to detect a Project Id in the current environment`

Ini terjadi karena Firebase Admin SDK memerlukan konfigurasi yang tepat untuk berjalan di environment lokal.

## 🔧 Solusi Sementara: Manual Testing

Karena setup Firebase Admin SDK memerlukan service account key yang kompleks, untuk testing timeout kita bisa menggunakan metode manual:

### 1. 📋 Gunakan Script Instruksi Manual

```bash
cd skillnusa-api
node check-orders-simple.js
```

Script ini akan memberikan instruksi lengkap untuk:
- Membuka Firebase Console
- Mencari orders yang expired
- Update manual status orders
- Verifikasi hasil

### 2. 🔍 Manual Check di Firebase Console

1. **Buka Firebase Console**: https://console.firebase.google.com
2. **Pilih Project**: skillnusa-6b3ad
3. **Go to Firestore Database**
4. **Buka collection "orders"**
5. **Cari orders dengan kondisi**:
   - Status = "payment" AND paymentExpiredAt < current time
   - Status = "pending" AND confirmationDeadline < current time

### 3. ✏️ Update Manual Orders

**Untuk Payment Timeout**:
```javascript
{
  status: "cancelled",
  paymentStatus: "expired", 
  cancellationReason: "Payment timeout (1 minute - TESTING)",
  cancelledAt: "2025-06-13T22:02:57.797Z",
  "timeline.cancelled": "2025-06-13T22:02:57.797Z"
}
```

**Untuk Confirmation Timeout**:
```javascript
{
  status: "cancelled",
  cancellationReason: "Freelancer confirmation timeout (1 minute - TESTING)",
  cancelledAt: "2025-06-13T22:02:57.797Z",
  refundStatus: "pending",
  "timeline.cancelled": "2025-06-13T22:02:57.797Z"
}
```

## 🚀 Setup Firebase Admin SDK (Optional)

Jika ingin menggunakan script otomatis, perlu setup Firebase Admin SDK:

### 1. Generate Service Account Key

1. Go to Firebase Console → Project Settings
2. Service Accounts tab
3. Click "Generate new private key"
4. Download JSON file

### 2. Set Environment Variables

Buat file `.env` di `skillnusa-api/`:

```env
FIREBASE_PROJECT_ID=skillnusa-6b3ad
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

### 3. Update Script

Modify `test-timeout-manual.js` untuk menggunakan environment variables yang benar.

## 🔄 Testing Workflow

### Scenario 1: Payment Timeout

1. **Create Order**:
   - Buat order baru melalui aplikasi
   - Status akan menjadi "payment"
   - paymentExpiredAt akan diset ke 1 menit dari sekarang

2. **Wait or Manual Expire**:
   - Tunggu 1 menit, ATAU
   - Manual update paymentExpiredAt ke waktu yang sudah lewat

3. **Check Timeout**:
   - Jalankan `node check-orders-simple.js`
   - Ikuti instruksi untuk update manual di Firebase Console

4. **Verify**:
   - Refresh aplikasi frontend
   - Order harus menunjukkan status "cancelled"

### Scenario 2: Confirmation Timeout

1. **Create and Pay Order**:
   - Buat order dan bayar
   - Status akan menjadi "pending"
   - confirmationDeadline akan diset ke 1 menit dari pembayaran

2. **Don't Accept as Freelancer**:
   - Jangan accept/reject order sebagai freelancer
   - Biarkan confirmationDeadline expire

3. **Check Timeout**:
   - Jalankan `node check-orders-simple.js`
   - Update manual di Firebase Console

4. **Verify**:
   - Order harus menunjukkan status "cancelled"
   - Countdown di freelancer harus hilang

## 📊 Expected Results

### Frontend Changes

**Client Side**:
- Order status berubah dari "payment" → "cancelled"
- Payment countdown hilang
- Muncul pesan "Order dibatalkan"

**Freelancer Side**:
- Order status berubah dari "pending" → "cancelled"
- Confirmation countdown hilang
- Order tidak lagi muncul di pending list

### Database Changes

**Payment Timeout**:
```
Before: { status: "payment", paymentStatus: "pending" }
After:  { status: "cancelled", paymentStatus: "expired" }
```

**Confirmation Timeout**:
```
Before: { status: "pending", confirmationDeadline: "2025-..." }
After:  { status: "cancelled", refundStatus: "pending" }
```

## 🆘 Troubleshooting

### Order masih "payment" setelah timeout

1. ✅ Check paymentExpiredAt vs current time
2. ✅ Pastikan update field yang benar
3. ✅ Refresh browser cache
4. ✅ Check console untuk errors

### Countdown tidak muncul di freelancer

1. ✅ Check apakah confirmationDeadline field ada
2. ✅ Pastikan order status = "pending"
3. ✅ Verify payment sudah confirmed
4. ✅ Check component FreelancerOrders.js

### Script Firebase error

1. ✅ Gunakan manual method dengan Firebase Console
2. ✅ Setup service account key jika perlu
3. ✅ Check environment variables
4. ✅ Verify project ID

## 💡 Production Notes

- Di production, Vercel cron job akan menjalankan timeout checker setiap 5 menit
- Environment variables harus diset di Vercel dashboard
- Service account key harus secure dan tidak di-commit ke git
- Timeout values harus dikembalikan ke production (60 menit payment, 3 jam confirmation)

## 🔗 Useful Links

- Firebase Console: https://console.firebase.google.com
- Vercel Dashboard: https://vercel.com/dashboard
- Firebase Admin SDK Docs: https://firebase.google.com/docs/admin/setup 