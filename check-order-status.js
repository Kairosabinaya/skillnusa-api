// Script untuk mengecek status order langsung dari database
const admin = require('firebase-admin');

// Initialize Firebase Admin dengan environment variables
if (!admin.apps.length) {
  try {
    // Try to use environment variables first
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID || 'skillnusa-6b3ad',
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'skillnusa-6b3ad'
    });
    
    console.log('✅ Firebase Admin initialized with environment variables');
  } catch (error) {
    console.log('⚠️ Environment variables not available, trying service account file...');
    try {
      const serviceAccount = require('../skillnusa-6b3ad-firebase-adminsdk-fbsvc-ab60977dcf.json');
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'skillnusa-6b3ad'
      });
      console.log('✅ Firebase Admin initialized with service account file');
    } catch (fileError) {
      console.error('❌ Failed to initialize Firebase Admin:', fileError.message);
      process.exit(1);
    }
  }
}

const db = admin.firestore();

async function checkOrderStatus() {
  try {
    console.log('🔍 Checking order status in database...');
    
    // Cari order dengan merchant ref dari callback
    const merchantRef = 'SKILLNUSA-1749892630';
    
    console.log('🔍 Searching for order with merchant_ref:', merchantRef);
    const ordersRef = db.collection('orders');
    const querySnapshot = await ordersRef.where('merchantRef', '==', merchantRef).get();
    
    if (querySnapshot.empty) {
      console.log('❌ Order not found with merchant_ref:', merchantRef);
      
      // Cari orders terbaru untuk user tertentu
      console.log('🔍 Searching for recent orders for user: b5oPWz23WsXvPaoV3id75SWO6f92');
      const userOrders = await ordersRef
        .where('clientId', '==', 'b5oPWz23WsXvPaoV3id75SWO6f92')
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get();
      
      console.log('📋 Recent orders for user:');
      userOrders.forEach(doc => {
        const data = doc.data();
        console.log({
          id: doc.id,
          merchantRef: data.merchantRef,
          status: data.status,
          paymentStatus: data.paymentStatus,
          tripayStatus: data.tripayStatus,
          title: data.title,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });
      });
      
      return;
    }
    
    const orderDoc = querySnapshot.docs[0];
    const orderId = orderDoc.id;
    const orderData = orderDoc.data();
    
    console.log('📋 Found order in database:', {
      id: orderId,
      merchantRef: orderData.merchantRef,
      status: orderData.status,
      paymentStatus: orderData.paymentStatus,
      tripayStatus: orderData.tripayStatus,
      tripayReference: orderData.tripayReference,
      title: orderData.title,
      clientId: orderData.clientId,
      freelancerId: orderData.freelancerId,
      price: orderData.price,
      createdAt: orderData.createdAt?.toDate?.() || orderData.createdAt,
      updatedAt: orderData.updatedAt?.toDate?.() || orderData.updatedAt,
      paidAt: orderData.paidAt?.toDate?.() || orderData.paidAt,
      confirmationDeadline: orderData.confirmationDeadline?.toDate?.() || orderData.confirmationDeadline
    });
    
    // Cek timeline
    if (orderData.timeline) {
      console.log('📅 Order timeline:', {
        created: orderData.timeline.created?.toDate?.() || orderData.timeline.created,
        confirmed: orderData.timeline.confirmed?.toDate?.() || orderData.timeline.confirmed,
        cancelled: orderData.timeline.cancelled?.toDate?.() || orderData.timeline.cancelled
      });
    }
    
    // Analisis status
    console.log('\n🔍 Status Analysis:');
    if (orderData.paymentStatus === 'paid' && orderData.status === 'payment') {
      console.log('❌ INCONSISTENCY DETECTED!');
      console.log('   Payment Status: PAID');
      console.log('   Order Status: PAYMENT (should be PENDING)');
      console.log('   This explains why frontend shows "Menunggu Pembayaran"');
    } else if (orderData.paymentStatus === 'paid' && orderData.status === 'pending') {
      console.log('✅ STATUS IS CORRECT');
      console.log('   Payment Status: PAID');
      console.log('   Order Status: PENDING');
      console.log('   Frontend should show "Menunggu Konfirmasi"');
    } else {
      console.log('❓ UNEXPECTED STATUS COMBINATION');
      console.log('   Payment Status:', orderData.paymentStatus);
      console.log('   Order Status:', orderData.status);
    }
    
    // Cek chat existence
    console.log('\n🔍 Checking chat existence...');
    const chatsRef = db.collection('chats');
    const chatQuery = await chatsRef.where('orderId', '==', orderId).get();
    
    if (chatQuery.empty) {
      console.log('⚠️ No chat found for this order');
    } else {
      const chatDoc = chatQuery.docs[0];
      console.log('✅ Chat exists:', {
        id: chatDoc.id,
        participants: chatDoc.data().participants,
        lastMessage: chatDoc.data().lastMessage,
        lastMessageTime: chatDoc.data().lastMessageTime?.toDate?.() || chatDoc.data().lastMessageTime
      });
    }
    
    console.log('\n🎉 Database check complete!');
    
  } catch (error) {
    console.error('❌ Error checking order status:', error);
  }
}

// Run check
checkOrderStatus().then(() => {
  console.log('\nScript finished');
  process.exit(0);
}).catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
}); 