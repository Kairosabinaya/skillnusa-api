# Timeout System Troubleshooting Guide

## 🚨 Masalah yang Dilaporkan

### 1. ❌ **Status order masih "payment" padahal waktu habis**
### 2. ❌ **Countdown di freelancer tidak bekerja**

## 🔍 Diagnosis Masalah

### Masalah 1: Timeout Checker Tidak Berjalan
**Kemungkinan Penyebab**:
- Cron job tidak berjalan (Vercel cron hanya berjalan di production)
- Environment variable `CRON_SECRET` tidak diset
- Timeout checker API error

**Solusi**:
1. **Manual Testing**: Jalankan script debug untuk cek orders
2. **Manual Trigger**: Jalankan timeout checker secara manual
3. **Check Logs**: Periksa logs di Vercel dashboard

### Masalah 2: Field confirmationDeadline Tidak Ada
**Kemungkinan Penyebab**:
- Order dibuat sebelum field `confirmationDeadline` ditambahkan
- Callback Tripay tidak berjalan dengan benar
- Payment belum confirmed

**Solusi**:
1. **Check Database**: Periksa apakah field `confirmationDeadline` ada
2. **Check Payment Status**: Pastikan payment sudah confirmed
3. **Manual Update**: Update field secara manual jika perlu

## 🛠️ Scripts untuk Debugging

### 1. Debug Orders
```bash
cd skillnusa-api
node debug-orders.js
```

**Output yang diharapkan**:
```
🔍 Debug Orders in Database
==================================================
⏰ Current time: 2025-01-XX...

📋 Found X recent orders:

1. Order ID: ZBYPf1dRF6AOHqQsyjpF
   Title: Video Editor
   Status: payment
   Payment Status: pending
   Payment Expires: 2025-01-XX... ❌ EXPIRED
   Confirmation Deadline: Not set
   Created: 2025-01-XX... (X minutes ago)
```

### 2. Manual Timeout Check
```bash
cd skillnusa-api
node test-timeout-manual.js
```

**Output yang diharapkan**:
```
🧪 Manual Timeout Checker Test
========================================
⏰ Current time: 2025-01-XX...

1️⃣ Checking Payment Timeouts...
   Found X payment timeouts
   - Order ZBYPf1dRF6AOHqQsyjpF: Video Editor
     Expired at: 2025-01-XX...
   ✅ Updated to cancelled

2️⃣ Checking Confirmation Timeouts...
   Found X confirmation timeouts
```

## 🔧 Manual Fixes

### Fix 1: Update Expired Payment Orders
```javascript
// Run in Firebase Console or script
const now = new Date();
const expiredOrders = await db.collection('orders')
  .where('status', '==', 'payment')
  .where('paymentExpiredAt', '<=', now)
  .get();

for (const doc of expiredOrders.docs) {
  await doc.ref.update({
    status: 'cancelled',
    paymentStatus: 'expired',
    cancellationReason: 'Payment timeout (manual fix)',
    cancelledAt: now,
    'timeline.cancelled': now
  });
}
```

### Fix 2: Add Missing confirmationDeadline
```javascript
// For pending orders without confirmationDeadline
const pendingOrders = await db.collection('orders')
  .where('status', '==', 'pending')
  .get();

for (const doc of pendingOrders.docs) {
  const orderData = doc.data();
  if (!orderData.confirmationDeadline && orderData.paymentStatus === 'paid') {
    const deadline = new Date();
    deadline.setMinutes(deadline.getMinutes() + 1); // 1 minute for testing
    
    await doc.ref.update({
      confirmationDeadline: deadline
    });
  }
}
```

## 🔄 Testing Flow

### 1. Create Test Order
1. Buat order baru melalui aplikasi
2. **Jangan bayar** untuk test payment timeout
3. Tunggu 1 menit
4. Jalankan `node test-timeout-manual.js`
5. Cek apakah status berubah ke `cancelled`

### 2. Test Confirmation Timeout
1. Buat order baru dan bayar
2. **Jangan accept/reject** sebagai freelancer
3. Tunggu 1 menit
4. Jalankan `node test-timeout-manual.js`
5. Cek apakah status berubah ke `cancelled`

## 📊 Expected Database Changes

### Payment Timeout
```javascript
{
  status: 'payment' → 'cancelled',
  paymentStatus: 'pending' → 'expired',
  cancellationReason: 'Payment timeout (1 minute - TESTING)',
  cancelledAt: timestamp,
  'timeline.cancelled': timestamp
}
```

### Confirmation Timeout
```javascript
{
  status: 'pending' → 'cancelled',
  cancellationReason: 'Freelancer confirmation timeout (1 minute - TESTING)',
  cancelledAt: timestamp,
  refundStatus: 'pending',
  refundAmount: totalAmount,
  'timeline.cancelled': timestamp
}
```

## 🚀 Production Deployment

### Before Going Live
1. **Revert timeout values** ke production:
   - Payment: 60 menit
   - Confirmation: 3 jam
2. **Remove testing labels** dari semua pesan
3. **Test cron job** di Vercel production
4. **Set environment variables**:
   - `CRON_SECRET`: Random secure string
5. **Monitor logs** untuk memastikan cron berjalan

### Vercel Cron Configuration
File: `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/timeout-checker",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

## 🔍 Monitoring

### Check Cron Logs
1. Buka Vercel Dashboard
2. Pilih project skillnusa-api
3. Go to Functions tab
4. Check `/api/cron/timeout-checker` logs

### Expected Log Output
```
🕐 [TimeoutChecker] Starting timeout check
🔍 [TimeoutChecker] Found X payment timeouts
⏰ [TimeoutChecker] Processing timeout for order: ID
✅ [TimeoutChecker] Status changed to CANCELLED
```

## 🆘 Emergency Manual Timeout

Jika cron job tidak berjalan, gunakan script manual:

```bash
# Debug current state
node debug-orders.js

# Run manual timeout check
node test-timeout-manual.js

# Check results
node debug-orders.js
```

## 📞 Support Checklist

Ketika ada laporan timeout tidak bekerja:

1. ✅ **Check order status** di database
2. ✅ **Check payment expiry time** vs current time
3. ✅ **Check confirmation deadline** (jika pending)
4. ✅ **Run debug script** untuk lihat semua orders
5. ✅ **Run manual timeout** jika perlu
6. ✅ **Check Vercel cron logs** untuk production
7. ✅ **Verify environment variables** di Vercel 