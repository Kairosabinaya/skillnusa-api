/**
 * Simple Order Checker
 * Calls the timeout checker API endpoint directly
 */

const fetch = require('node-fetch');

async function checkOrders() {
  console.log('🧪 Order Timeout Checker');
  console.log('='.repeat(40));
  
  try {
    console.log('📡 Calling timeout checker API...');
    
    // Call the timeout checker endpoint
    const response = await fetch('http://localhost:3000/api/cron/timeout-checker', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': 'test-secret-key'
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Timeout checker response:');
      console.log(`   - Processed: ${result.processedCount} orders`);
      console.log(`   - Payment timeouts: ${result.results.paymentTimeouts}`);
      console.log(`   - Confirmation timeouts: ${result.results.confirmationTimeouts}`);
      
      if (result.results.errors.length > 0) {
        console.log('⚠️ Errors:');
        result.results.errors.forEach(error => console.log(`   - ${error}`));
      }
      
      if (result.processedCount === 0) {
        console.log('ℹ️ No timeout orders found at this time');
      }
    } else {
      const errorText = await response.text();
      console.error('❌ Timeout checker failed:', response.status, errorText);
      
      if (response.status === 404) {
        console.log('\n💡 Suggestion: Make sure the development server is running');
        console.log('   Run: npm run dev (in the API directory)');
      }
    }
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused - server not running');
      console.log('\n💡 To test timeout functionality:');
      console.log('   1. Start the development server: npm run dev');
      console.log('   2. Or manually check orders in Firebase Console');
      console.log('   3. Look for orders with status "payment" and expired paymentExpiredAt');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

// Alternative: Show instructions for manual checking
function showManualInstructions() {
  console.log('\n📋 Manual Timeout Check Instructions:');
  console.log('='.repeat(50));
  console.log('');
  console.log('1️⃣ Open Firebase Console: https://console.firebase.google.com');
  console.log('2️⃣ Go to Firestore Database');
  console.log('3️⃣ Open "orders" collection');
  console.log('4️⃣ Look for orders with:');
  console.log('   - status: "payment" AND paymentExpiredAt < current time');
  console.log('   - status: "pending" AND confirmationDeadline < current time');
  console.log('');
  console.log('5️⃣ For expired payment orders, update:');
  console.log('   - status: "cancelled"');
  console.log('   - paymentStatus: "expired"');
  console.log('   - cancellationReason: "Payment timeout"');
  console.log('   - cancelledAt: current timestamp');
  console.log('');
  console.log('6️⃣ For expired confirmation orders, update:');
  console.log('   - status: "cancelled"');
  console.log('   - cancellationReason: "Freelancer confirmation timeout"');
  console.log('   - cancelledAt: current timestamp');
  console.log('   - refundStatus: "pending"');
  console.log('');
  console.log('⏰ Current time for reference:', new Date().toISOString());
}

// Run the check
checkOrders().then(() => {
  showManualInstructions();
  console.log('\n🏁 Check finished');
}).catch(error => {
  console.error('❌ Check failed:', error);
  showManualInstructions();
}); 