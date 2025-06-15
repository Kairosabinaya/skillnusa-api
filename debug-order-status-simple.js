// Debug script untuk mengecek dan memperbaiki status order setelah callback
const admin = require('firebase-admin');
const serviceAccount = require('../skillnusa-6b3ad-firebase-adminsdk-fbsvc-ab60977dcf.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'skillnusa-6b3ad'
  });
}

const db = admin.firestore();

async function debugOrderStatus() {
  try {
    console.log('🔍 Debugging order status issues...');
    
    // 1. Cari order dengan merchant ref dari callback
    const merchantRef = 'SKILLNUSA-1749892630'; // dari screenshot
    
    console.log('🔍 Searching for order with merchant_ref:', merchantRef);
    const ordersRef = db.collection('orders');
    const querySnapshot = await ordersRef.where('merchantRef', '==', merchantRef).get();
    
    if (querySnapshot.empty) {
      console.log('❌ Order not found with merchant_ref:', merchantRef);
      
      // Coba cari dengan partial match atau cari semua orders terbaru
      console.log('🔍 Searching for recent orders...');
      const recentOrders = await ordersRef.orderBy('createdAt', 'desc').limit(10).get();
      
      console.log('📋 Recent orders:');
      recentOrders.forEach(doc => {
        const data = doc.data();
        console.log({
          id: doc.id,
          merchantRef: data.merchantRef,
          status: data.status,
          paymentStatus: data.paymentStatus,
          createdAt: data.createdAt?.toDate?.() || data.createdAt
        });
      });
      
      return;
    }
    
    const orderDoc = querySnapshot.docs[0];
    const orderId = orderDoc.id;
    const orderData = orderDoc.data();
    
    console.log('📋 Found order:', {
      id: orderId,
      merchantRef: orderData.merchantRef,
      status: orderData.status,
      paymentStatus: orderData.paymentStatus,
      tripayStatus: orderData.tripayStatus,
      tripayReference: orderData.tripayReference,
      updatedAt: orderData.updatedAt?.toDate?.() || orderData.updatedAt,
      paidAt: orderData.paidAt?.toDate?.() || orderData.paidAt
    });
    
    // 2. Cek apakah status sudah benar
    if (orderData.paymentStatus === 'paid' && orderData.status === 'payment') {
      console.log('🔧 Status inconsistency detected! Payment is paid but order status is still payment');
      console.log('🔧 Fixing order status...');
      
      // Update status ke pending
      const updateData = {
        status: 'pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusMessage: 'Fixed by debug script - payment was already confirmed'
      };
      
      // Set confirmation deadline jika belum ada
      if (!orderData.confirmationDeadline) {
        const confirmationDeadline = new Date();
        confirmationDeadline.setMinutes(confirmationDeadline.getMinutes() + 1);
        updateData.confirmationDeadline = confirmationDeadline;
      }
      
      await orderDoc.ref.update(updateData);
      
      console.log('✅ Order status updated successfully!');
      console.log('📋 Updated order data:', {
        id: orderId,
        oldStatus: orderData.status,
        newStatus: 'pending',
        paymentStatus: orderData.paymentStatus,
        confirmationDeadline: updateData.confirmationDeadline?.toISOString()
      });
    } else if (orderData.paymentStatus === 'paid' && orderData.status === 'pending') {
      console.log('✅ Order status is correct (pending with paid payment)');
    } else {
      console.log('❓ Unexpected status combination:', {
        status: orderData.status,
        paymentStatus: orderData.paymentStatus
      });
    }
    
    // 3. Cek timeline
    console.log('📅 Order timeline:', orderData.timeline);
    
    // 4. Cek chat existence
    const chatsRef = db.collection('chats');
    const chatQuery = await chatsRef.where('orderId', '==', orderId).get();
    
    if (chatQuery.empty) {
      console.log('⚠️ No chat found for this order - this might be why status appears unchanged in UI');
      console.log('🔧 Chat creation will be handled by the application');
    } else {
      console.log('✅ Chat exists for this order');
      const chatDoc = chatQuery.docs[0];
      console.log('📋 Chat details:', {
        id: chatDoc.id,
        participants: chatDoc.data().participants,
        lastMessage: chatDoc.data().lastMessage,
        lastMessageTime: chatDoc.data().lastMessageTime?.toDate?.() || chatDoc.data().lastMessageTime
      });
    }
    
    console.log('🎉 Debug complete!');
    
  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
}

// Run debug
debugOrderStatus().then(() => {
  console.log('Script finished');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
}); 