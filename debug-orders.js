/**
 * Debug Orders Script
 * Check current orders in database and their timeout fields
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function debugOrders() {
  console.log('🔍 Debug Orders in Database');
  console.log('='.repeat(50));
  
  const now = new Date();
  console.log('⏰ Current time:', now.toISOString());
  
  try {
    // Get all recent orders
    const ordersQuery = await db.collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    console.log(`\n📋 Found ${ordersQuery.size} recent orders:\n`);
    
    ordersQuery.forEach((doc, index) => {
      const orderData = doc.data();
      const orderId = doc.id;
      
      console.log(`${index + 1}. Order ID: ${orderId}`);
      console.log(`   Title: ${orderData.title || 'No title'}`);
      console.log(`   Status: ${orderData.status}`);
      console.log(`   Payment Status: ${orderData.paymentStatus || 'N/A'}`);
      
      // Check payment expiry
      if (orderData.paymentExpiredAt) {
        const paymentExpiry = orderData.paymentExpiredAt.toDate ? 
          orderData.paymentExpiredAt.toDate() : 
          new Date(orderData.paymentExpiredAt);
        const paymentExpired = paymentExpiry <= now;
        
        console.log(`   Payment Expires: ${paymentExpiry.toISOString()} ${paymentExpired ? '❌ EXPIRED' : '✅ Valid'}`);
      } else {
        console.log(`   Payment Expires: Not set`);
      }
      
      // Check confirmation deadline
      if (orderData.confirmationDeadline) {
        const confirmationDeadline = orderData.confirmationDeadline.toDate ? 
          orderData.confirmationDeadline.toDate() : 
          new Date(orderData.confirmationDeadline);
        const confirmationExpired = confirmationDeadline <= now;
        
        console.log(`   Confirmation Deadline: ${confirmationDeadline.toISOString()} ${confirmationExpired ? '❌ EXPIRED' : '✅ Valid'}`);
      } else {
        console.log(`   Confirmation Deadline: Not set`);
      }
      
      // Check created time
      if (orderData.createdAt) {
        const createdAt = orderData.createdAt.toDate ? 
          orderData.createdAt.toDate() : 
          new Date(orderData.createdAt);
        const ageMinutes = Math.floor((now - createdAt) / (1000 * 60));
        
        console.log(`   Created: ${createdAt.toISOString()} (${ageMinutes} minutes ago)`);
      }
      
      console.log(`   Client ID: ${orderData.clientId || 'N/A'}`);
      console.log(`   Freelancer ID: ${orderData.freelancerId || 'N/A'}`);
      console.log('');
    });
    
    // Check for orders that should be timed out
    console.log('🔍 Checking for timeout candidates:\n');
    
    // Payment timeouts
    const paymentTimeouts = await db.collection('orders')
      .where('status', '==', 'payment')
      .where('paymentExpiredAt', '<=', now)
      .get();
    
    console.log(`💳 Payment timeouts: ${paymentTimeouts.size} orders`);
    paymentTimeouts.forEach(doc => {
      const orderData = doc.data();
      console.log(`   - ${doc.id}: ${orderData.title}`);
    });
    
    // Confirmation timeouts
    const confirmationTimeouts = await db.collection('orders')
      .where('status', '==', 'pending')
      .where('confirmationDeadline', '<=', now)
      .get();
    
    console.log(`\n⏰ Confirmation timeouts: ${confirmationTimeouts.size} orders`);
    confirmationTimeouts.forEach(doc => {
      const orderData = doc.data();
      console.log(`   - ${doc.id}: ${orderData.title}`);
    });
    
    // Pending orders without confirmation deadline
    const pendingWithoutDeadline = await db.collection('orders')
      .where('status', '==', 'pending')
      .get();
    
    let pendingNoDeadlineCount = 0;
    pendingWithoutDeadline.forEach(doc => {
      const orderData = doc.data();
      if (!orderData.confirmationDeadline) {
        pendingNoDeadlineCount++;
      }
    });
    
    console.log(`\n⚠️ Pending orders without confirmation deadline: ${pendingNoDeadlineCount} orders`);
    
    console.log('\n✅ Debug completed!');
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
  }
}

// Run the debug
debugOrders().then(() => {
  console.log('\n🏁 Debug finished');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug failed:', error);
  process.exit(1);
}); 