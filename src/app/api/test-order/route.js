import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    console.log('🔍 Testing order existence...');
    
    // Get the merchant_ref from request
    let requestData;
    try {
      requestData = await request.json();
    } catch (parseError) {
      return NextResponse.json({
        success: false,
        message: 'Invalid JSON in request body',
        error: parseError.message
      }, { status: 400 });
    }
    
    const { merchant_ref } = requestData;
    
    if (!merchant_ref) {
      return NextResponse.json({
        success: false,
        message: 'merchant_ref required in request body',
        example: { merchant_ref: 'SKILLNUSA-1749824880' }
      }, { status: 400 });
    }
    
    console.log('🔍 Searching for order with merchant_ref:', merchant_ref);
    
    // Dynamically import Firebase to avoid initialization issues
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
        details: importError.message
      }, { status: 500 });
    }
    
    // Search for order
    try {
      console.log('🔍 Querying orders collection...');
      const ordersRef = db.collection('orders');
      const querySnapshot = await ordersRef.where('merchantRef', '==', merchant_ref).get();
      
      console.log(`📊 Query completed. Found ${querySnapshot.size} matching orders`);
      
      if (querySnapshot.empty) {
        // Also try searching with different field name variations
        console.log('🔍 Trying alternative field names...');
        
        const alternatives = ['merchant_ref', 'merchantReference', 'tripayRef'];
        let foundWithAlternative = false;
        let alternativeResults = {};
        
        for (const altField of alternatives) {
          try {
            const altSnapshot = await ordersRef.where(altField, '==', merchant_ref).get();
            
            alternativeResults[altField] = altSnapshot.size;
            
            if (!altSnapshot.empty) {
              foundWithAlternative = true;
              console.log(`✅ Found order using field: ${altField}`);
              break;
            }
          } catch (altError) {
            alternativeResults[altField] = `Error: ${altError.message}`;
          }
        }
        
        // Get some sample orders to understand the structure
        console.log('🔍 Getting sample orders to understand data structure...');
        const sampleSnapshot = await ordersRef.limit(5).get();
        
        const sampleOrders = [];
        sampleSnapshot.forEach(doc => {
          const data = doc.data();
          sampleOrders.push({
            id: doc.id,
            merchantRef: data.merchantRef || 'N/A',
            merchant_ref: data.merchant_ref || 'N/A',
            merchantReference: data.merchantReference || 'N/A',
            tripayRef: data.tripayRef || 'N/A',
            status: data.status || 'N/A',
            paymentStatus: data.paymentStatus || 'N/A',
            totalAmount: data.totalAmount || 'N/A',
            createdAt: data.createdAt ? 'SET' : 'NOT SET'
          });
        });
        
        return NextResponse.json({
          success: false,
          message: 'Order not found',
          search_details: {
            merchant_ref_searched: merchant_ref,
            primary_field_used: 'merchantRef',
            alternative_searches: alternativeResults,
            found_with_alternative: foundWithAlternative
          },
          debug_info: {
            total_orders_in_collection: sampleSnapshot.size,
            sample_orders: sampleOrders,
            collection_name: 'orders'
          },
          recommendations: [
            'Check if the order was created with the correct merchant_ref format',
            'Verify the field name used for storing merchant reference',
            'Check if the order exists in a different collection',
            'Verify the merchant_ref value matches exactly (case-sensitive)'
          ]
        }, { status: 404 });
      }
      
      // Order found - get the details
      const orderDoc = querySnapshot.docs[0];
      const orderData = orderDoc.data();
      
      console.log('✅ Order found:', orderDoc.id);
      
      // Return order details (sanitized)
      const orderDetails = {
        id: orderDoc.id,
        merchantRef: orderData.merchantRef,
        status: orderData.status,
        paymentStatus: orderData.paymentStatus,
        totalAmount: orderData.totalAmount,
        clientId: orderData.clientId,
        freelancerId: orderData.freelancerId,
        createdAt: orderData.createdAt ? orderData.createdAt.toDate().toISOString() : 'N/A',
        updatedAt: orderData.updatedAt ? orderData.updatedAt.toDate().toISOString() : 'N/A',
        paidAt: orderData.paidAt ? orderData.paidAt.toDate().toISOString() : 'N/A',
        tripayReference: orderData.tripayReference || 'N/A',
        tripayStatus: orderData.tripayStatus || 'N/A'
      };
      
      return NextResponse.json({
        success: true,
        message: 'Order found successfully',
        order: orderDetails,
        search_details: {
          merchant_ref_searched: merchant_ref,
          field_used: 'merchantRef',
          query_time: new Date().toISOString()
        }
      });
      
    } catch (queryError) {
      console.error('❌ Firebase query failed:', queryError);
      
      return NextResponse.json({
        success: false,
        error: 'Firebase query failed',
        details: queryError.message,
        search_details: {
          merchant_ref_searched: merchant_ref,
          error_type: queryError.name || 'Unknown'
        }
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ Order search failed:', error);
    console.error('❌ Error stack:', error.stack);
    
    return NextResponse.json({
      success: false,
      error: 'Order search failed',
      details: error.message,
      error_stack: error.stack
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Order test endpoint - POST only',
    usage: 'Send POST request with {"merchant_ref": "SKILLNUSA-1749824880"}',
    example_request: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { merchant_ref: 'SKILLNUSA-1749824880' }
    },
    timestamp: new Date().toISOString()
  }, { status: 405 });
} 