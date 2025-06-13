# Countdown Timer & Auto Chat Fixes

## 🔧 Masalah yang Diperbaiki

### 1. ❌ **Countdown Timer Tidak Terlihat di Freelancer**
**Masalah**: Freelancer tidak melihat countdown untuk confirmation deadline

**Solusi**:
- ✅ Menambahkan countdown timer di `FreelancerOrders.js` untuk order dengan status `pending`
- ✅ Menambahkan countdown di `OrderCard.js` untuk tampilan card
- ✅ Menggunakan `CountdownTimer` component untuk visual yang lebih baik
- ✅ Menambahkan peringatan visual dengan background orange

### 2. ❌ **Chat Tidak Otomatis Terkirim Setelah Pembayaran**
**Masalah**: Setelah client membayar, chat ke freelancer tidak otomatis dibuat

**Solusi**:
- ✅ Mengimplementasi auto chat creation di `tripay/callback/route.js`
- ✅ Membuat chat otomatis antara client dan freelancer
- ✅ Mengirim pesan notifikasi order ke chat
- ✅ Mengirim notifikasi push ke freelancer

## 📋 Perubahan Detail

### FreelancerOrders.js
```javascript
// Menambahkan countdown untuk confirmation deadline
{selectedOrder.status === 'pending' && selectedOrder.confirmationDeadline && (
  <div className="space-y-2">
    <div className="flex justify-between">
      <span className="text-gray-600">Batas Konfirmasi:</span>
      <span className="font-medium text-red-600">
        {formatDate(selectedOrder.confirmationDeadline)}
      </span>
    </div>
    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
      <CountdownTimer
        targetDate={selectedOrder.confirmationDeadline.seconds 
          ? new Date(selectedOrder.confirmationDeadline.seconds * 1000) 
          : new Date(selectedOrder.confirmationDeadline)
        }
        label="Waktu konfirmasi tersisa"
        type="danger"
        className="text-sm"
        onExpire={() => {
          console.log('⏰ Confirmation deadline expired');
        }}
      />
    </div>
  </div>
)}
```

### OrderCard.js
```javascript
// Menambahkan countdown di card view
{order.status === 'pending' && order.confirmationDeadline && (
  <div className="flex items-center text-sm">
    <ClockIcon className="h-4 w-4 mr-2 text-red-500" />
    <div className="flex flex-col">
      <span className="text-red-600 font-medium">
        Konfirmasi: {formatDate(order.confirmationDeadline)}
      </span>
      <span className="text-xs text-red-600 font-medium">
        Sisa: {calculateTimeRemaining(order.confirmationDeadline)}
      </span>
    </div>
  </div>
)}
```

### tripay/callback/route.js
```javascript
// Auto chat creation setelah pembayaran
if (status.toUpperCase() === 'PAID') {
  console.log('📧 [Tripay Callback] Payment confirmed - creating chat and notifications');
  
  try {
    // Get order details
    const orderDoc = await db.collection('orders').doc(orderId).get();
    const orderData = orderDoc.data();
    
    if (orderData) {
      // Create chat between client and freelancer
      const chatData = {
        participants: [orderData.clientId, orderData.freelancerId],
        participantDetails: {},
        lastMessage: '',
        lastMessageTime: FieldValue.serverTimestamp(),
        lastMessageSender: '',
        orderId: orderId,
        gigId: orderData.gigId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      
      // Get participant details
      const [clientDoc, freelancerDoc] = await Promise.all([
        db.collection('users').doc(orderData.clientId).get(),
        db.collection('users').doc(orderData.freelancerId).get()
      ]);
      
      // Add participant details to chat
      if (clientDoc.exists) {
        chatData.participantDetails[orderData.clientId] = {
          displayName: clientDoc.data().displayName || 'Client',
          profilePhoto: clientDoc.data().profilePhoto || null
        };
      }
      
      if (freelancerDoc.exists) {
        chatData.participantDetails[orderData.freelancerId] = {
          displayName: freelancerDoc.data().displayName || 'Freelancer',
          profilePhoto: freelancerDoc.data().profilePhoto || null
        };
      }
      
      // Create chat
      const chatRef = await db.collection('chats').add(chatData);
      console.log('✅ [Tripay Callback] Chat created:', chatRef.id);
      
      // Send order notification message to chat
      const notificationContent = `🎉 Pesanan Baru Dibuat!\n\n📋 Layanan: ${orderData.title}\n📦 Paket: ${orderData.packageType || 'Dasar'}\n💰 Total: Rp ${(orderData.price || 0).toLocaleString('id-ID')}\n\n📝 Kebutuhan Client:\n"${orderData.requirements || 'Tidak ada kebutuhan khusus'}"\n\n⏰ Pesanan telah dibayar dan menunggu konfirmasi freelancer dalam 1 menit (TESTING).`;
      
      const messageData = {
        chatId: chatRef.id,
        senderId: orderData.clientId,
        content: notificationContent,
        messageType: 'order_notification',
        metadata: {
          orderId: orderId,
          type: 'order_created'
        },
        isRead: false,
        createdAt: FieldValue.serverTimestamp()
      };
      
      await db.collection('messages').add(messageData);
      
      // Update chat with last message
      await chatRef.update({
        lastMessage: 'Pesanan baru dibuat',
        lastMessageTime: FieldValue.serverTimestamp(),
        lastMessageSender: orderData.clientId
      });
      
      // Send notification to freelancer
      await db.collection('notifications').add({
        userId: orderData.freelancerId,
        type: 'order',
        title: '🎉 Pesanan Baru Masuk',
        message: `Pesanan baru "${orderData.title}" telah dibayar dan menunggu konfirmasi Anda.`,
        orderId: orderId,
        createdAt: FieldValue.serverTimestamp(),
        read: false
      });
      
      console.log('✅ [Tripay Callback] Chat and notifications created successfully');
    }
  } catch (error) {
    console.error('❌ [Tripay Callback] Error creating chat and notifications:', error);
    // Don't fail the callback if chat creation fails
  }
}
```

## 🎯 Hasil Perbaikan

### Countdown Timer
- ✅ Freelancer sekarang melihat countdown timer untuk confirmation deadline
- ✅ Timer ditampilkan dengan visual yang jelas (background merah)
- ✅ Countdown muncul di detail order dan card view
- ✅ Peringatan visual dengan warna orange untuk urgency

### Auto Chat
- ✅ Chat otomatis dibuat setelah pembayaran berhasil
- ✅ Pesan notifikasi order otomatis dikirim ke chat
- ✅ Freelancer mendapat notifikasi push tentang order baru
- ✅ Chat berisi detail lengkap order (layanan, paket, harga, requirements)

## 🔄 Flow Setelah Perbaikan

1. **Client membuat order** → Status: `payment`
2. **Client membayar** → Tripay callback triggered
3. **Auto chat creation** → Chat dibuat antara client & freelancer
4. **Auto message sent** → Pesan notifikasi order dikirim ke chat
5. **Freelancer notification** → Push notification ke freelancer
6. **Order status** → Berubah ke `pending`
7. **Countdown visible** → Freelancer melihat countdown confirmation deadline
8. **Freelancer action** → Accept/Reject dalam batas waktu

## ⚠️ Testing Mode Active

- **Confirmation timeout**: 1 menit (dari 3 jam)
- **Payment timeout**: 1 menit (dari 60 menit)
- **Pesan**: Mengandung label "(TESTING)"

## 📝 TODO Setelah Testing

1. **Revert timeout values** ke production:
   - Payment timeout: 60 menit
   - Confirmation timeout: 3 jam
2. **Remove testing labels** dari semua pesan
3. **Deploy** ke production
4. **Monitor** chat creation dan countdown functionality 