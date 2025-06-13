import { NextResponse } from 'next/server';

export async function POST() {
  try {
    console.log('🔥 Testing Firebase connection...');
    
    // Test environment variables first
    const firebaseConfig = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
      private_key: process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET',
      service_account_key: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'SET' : 'NOT SET'
    };
    
    console.log('🔧 Firebase Config Check:', firebaseConfig);
    
    // Dynamically import Firebase Admin to avoid initialization issues
    let db;
    try {
      const { db: firebaseDb } = await import('../../../firebase/admin');
      db = firebaseDb;
      console.log('✅ Firebase Admin SDK imported successfully');
    } catch (importError) {
      console.error('❌ Firebase Admin SDK import failed:', importError.message);
      return NextResponse.json({
        success: false,
        error: 'Firebase Admin SDK import failed',
        details: importError.message,
        firebase_config: firebaseConfig
      }, { status: 500 });
    }
    
    // Test basic connection with a simple query
    try {
      console.log('🔍 Testing orders collection access...');
      const ordersRef = db.collection('orders');
      const snapshot = await ordersRef.limit(1).get();
      
      console.log('✅ Firebase connection successful');
      console.log(`📊 Found ${snapshot.size} orders in test query`);
      
      // Get some sample data (without exposing sensitive info)
      const sampleOrders = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        sampleOrders.push({
          id: doc.id,
          merchantRef: data.merchantRef || 'N/A',
          status: data.status || 'N/A',
          paymentStatus: data.paymentStatus || 'N/A',
          createdAt: data.createdAt ? 'SET' : 'NOT SET'
        });
      });
      
      return NextResponse.json({
        success: true,
        message: 'Firebase connection working',
        firebase_config: firebaseConfig,
        test_results: {
          orders_collection_accessible: true,
          orders_count: snapshot.size,
          sample_orders: sampleOrders
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (queryError) {
      console.error('❌ Firebase query failed:', queryError);
      
      return NextResponse.json({
        success: false,
        error: 'Firebase query failed',
        details: queryError.message,
        firebase_config: firebaseConfig,
        test_results: {
          orders_collection_accessible: false,
          error_type: queryError.name || 'Unknown',
          error_message: queryError.message
        }
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ Firebase test failed:', error);
    console.error('❌ Error stack:', error.stack);
    
    return NextResponse.json({
      success: false,
      error: 'Firebase test failed',
      details: error.message,
      error_stack: error.stack,
      firebase_config: {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET',
        private_key: process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET',
        service_account_key: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'SET' : 'NOT SET'
      }
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Firebase test endpoint - POST only',
    usage: 'Send POST request to test Firebase connection',
    timestamp: new Date().toISOString()
  }, { status: 405 });
} 