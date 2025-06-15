import { NextResponse } from 'next/server';
import { db } from '../../../../firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// Tripay allowed IPs for security
const TRIPAY_ALLOWED_IPS = [
  '95.111.200.230', // IPv4
  '2a04:3543:1000:2310:ac92:4cff:fe87:63f9' // IPv6
];

// Standardized error response format
const createErrorResponse = (message, code = 'GENERAL_ERROR', status = 400) => {
  return NextResponse.json({
    success: false,
    error: { message, code },
    timestamp: new Date().toISOString()
  }, { status });
};

export async function POST(request) {
  try {
    console.log('🔔 [Tripay Callback] Received callback request');
    
    // 1. IP Whitelist Validation (Security Enhancement)
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    console.log('🔍 [Tripay Callback] Client IP:', clientIP);
    
    // Skip IP validation in development mode
    if (process.env.NODE_ENV === 'production' && !TRIPAY_ALLOWED_IPS.includes(clientIP)) {
      console.error('❌ [Tripay Callback] Unauthorized IP:', clientIP);
      return createErrorResponse('Unauthorized IP address', 'IP_NOT_ALLOWED', 403);
    }
    
    // 2. Get headers and validate required headers
    const headers = Object.fromEntries(request.headers.entries());
    const callbackSignature = headers['x-callback-signature'];
    const callbackEvent = headers['x-callback-event'];
    
    console.log('📋 [Tripay Callback] Headers:', {
      'x-callback-signature': callbackSignature ? 'present' : 'missing',
      'x-callback-event': callbackEvent
    });
    
    if (!callbackSignature) {
      return createErrorResponse('Missing X-Callback-Signature header', 'MISSING_SIGNATURE');
    }
    
    if (callbackEvent !== 'payment_status') {
      return createErrorResponse(`Unsupported callback event: ${callbackEvent}`, 'UNSUPPORTED_EVENT');
    }
    
    // 3. Get raw callback data for signature validation
    const rawBody = await request.text();
    let callbackData;
    
    try {
      callbackData = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('❌ [Tripay Callback] Invalid JSON:', parseError);
      return createErrorResponse('Invalid JSON format', 'INVALID_JSON');
    }
    
    console.log('📥 [Tripay Callback] Data:', callbackData);
    
    // 4. Signature Validation (CRITICAL SECURITY FIX)
    const privateKey = process.env.TRIPAY_PRIVATE_KEY;
    if (!privateKey) {
      console.error('❌ [Tripay Callback] Missing TRIPAY_PRIVATE_KEY');
      return createErrorResponse('Server configuration error', 'CONFIG_ERROR', 500);
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', privateKey)
      .update(rawBody)
      .digest('hex');
    
    if (expectedSignature !== callbackSignature) {
      console.error('❌ [Tripay Callback] Invalid signature:', {
        expected: expectedSignature,
        received: callbackSignature
      });
      return createErrorResponse('Invalid callback signature', 'INVALID_SIGNATURE', 401);
    }
    
    console.log('✅ [Tripay Callback] Signature validation passed');
    
    // 5. Validate required callback fields
    const requiredFields = ['reference', 'merchant_ref', 'status'];
    const missingFields = requiredFields.filter(field => !callbackData[field]);
    
    if (missingFields.length > 0) {
      return createErrorResponse(
        `Missing required fields: ${missingFields.join(', ')}`, 
        'MISSING_FIELDS'
      );
    }
    
    const { merchant_ref, status, reference, paid_at, amount_received, payment_method } = callbackData;
    
    console.log('🔍 [Tripay Callback] Processing validated callback:', {
      merchant_ref,
      status,
      reference,
      paid_at,
      amount_received,
      payment_method
    });
    
    // 6. Find order by merchant reference
    console.log('🔍 [Tripay Callback] Searching for order with merchant_ref:', merchant_ref);
    const ordersRef = db.collection('orders');
    const querySnapshot = await ordersRef.where('merchantRef', '==', merchant_ref).get();
    
    console.log('📊 [Tripay Callback] Query results:', {
      isEmpty: querySnapshot.empty,
      size: querySnapshot.size,
      merchant_ref: merchant_ref
    });
    
    let orderDoc, orderId, orderData;
    
    if (querySnapshot.empty) {
      console.warn(`⚠️ [Tripay Callback] Order not found for merchant_ref: ${merchant_ref}`);
      return createErrorResponse(
        `Order not found for merchant reference: ${merchant_ref}`, 
        'ORDER_NOT_FOUND', 
        404
      );
    }
    
    orderDoc = querySnapshot.docs[0];
    orderId = orderDoc.id;
    orderData = orderDoc.data();
    
    console.log('📋 [Tripay Callback] Found existing order:', {
      orderId,
      currentStatus: orderData.status,
      newStatus: status
    });
    
    // 7. Determine new order status based on Tripay status
    let newOrderStatus = orderData.status;
    let paymentStatus = 'pending';
    
    switch (status.toUpperCase()) {
      case 'PAID':
        newOrderStatus = 'pending'; // Move to pending for freelancer confirmation
        paymentStatus = 'paid';
        break;
      case 'EXPIRED':
        newOrderStatus = 'cancelled';
        paymentStatus = 'expired';
        break;
      case 'FAILED':
        newOrderStatus = 'cancelled';
        paymentStatus = 'failed';
        break;
      case 'REFUND':
        newOrderStatus = 'cancelled';
        paymentStatus = 'refunded';
        break;
      default:
        console.warn(`⚠️ [Tripay Callback] Unknown payment status: ${status}`);
        paymentStatus = 'pending';
        break;
    }
    
    // 8. Prepare update data
    const updateData = {
      paymentStatus,
      tripayStatus: status,
      tripayReference: reference,
      updatedAt: FieldValue.serverTimestamp()
    };
    
    // 9. Add payment completion data if paid
    if (status.toUpperCase() === 'PAID') {
      updateData.status = newOrderStatus;
      updateData.paidAt = paid_at ? new Date(paid_at * 1000) : FieldValue.serverTimestamp();
      
      // Set confirmation deadline (3 HOURS - PRODUCTION MODE)
      const confirmationDeadline = new Date();
      confirmationDeadline.setHours(confirmationDeadline.getHours() + 3); // 3 hours for production
      updateData.confirmationDeadline = confirmationDeadline;
      
      console.log('⏰ [Tripay Callback] Setting confirmation deadline:', {
        orderId,
        confirmationDeadline: confirmationDeadline.toISOString(),
        currentTime: new Date().toISOString(),
        hoursFromNow: 3
      });
      
      if (amount_received) {
        updateData.amountReceived = amount_received;
      }
      
      if (payment_method) {
        updateData.paymentMethod = payment_method;
      }
      
      updateData['timeline.confirmed'] = FieldValue.serverTimestamp();
      
      console.log('💰 [Tripay Callback] Payment confirmed - updating to pending status');
    } else if (['EXPIRED', 'FAILED', 'REFUND'].includes(status.toUpperCase())) {
      updateData.status = newOrderStatus;
      updateData.cancelledAt = FieldValue.serverTimestamp();
      updateData.cancellationReason = `Payment ${status.toLowerCase()}`;
      updateData['timeline.cancelled'] = FieldValue.serverTimestamp();
      
      console.log(`❌ [Tripay Callback] Payment ${status} - updating to cancelled status`);
    }
    
    // 10. Update order in Firebase with transaction safety
    const orderRef = db.collection('orders').doc(orderId);
    
    // Use transaction for data consistency
    await db.runTransaction(async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      
      if (!orderDoc.exists) {
        throw new Error('Order not found in transaction');
      }
      
      const currentOrderData = orderDoc.data();
      
      // Prevent duplicate callback processing
      if (currentOrderData.tripayReference === reference && 
          currentOrderData.tripayStatus === status) {
        console.log('⚠️ [Tripay Callback] Duplicate callback ignored:', {
          orderId,
          reference,
          status
        });
        return; // Skip update
      }
      
      transaction.update(orderRef, updateData);
    });
    
    // 11. Verify update
    const updatedDoc = await orderRef.get();
    const updatedData = updatedDoc.data();
    
    console.log('✅ [Tripay Callback] Order updated successfully:', {
      orderId,
      merchantRef: merchant_ref,
      oldStatus: orderData.status,
      newStatus: newOrderStatus,
      paymentStatus,
      verificationData: {
        actualStatus: updatedData.status,
        actualPaymentStatus: updatedData.paymentStatus,
        actualTripayStatus: updatedData.tripayStatus,
        updatedAt: updatedData.updatedAt?.toDate?.() || updatedData.updatedAt
      }
    });
    
    // 12. Send notification and create chat if payment is confirmed
    if (status.toUpperCase() === 'PAID') {
      console.log('📧 [Tripay Callback] Payment confirmed - creating chat and sending notifications');
      
      try {
        // Get fresh order data for chat creation
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
          const notificationContent = `🎉 Pesanan Baru Dibuat!\n\n📋 Layanan: ${orderData.title}\n📦 Paket: ${orderData.packageType || 'Dasar'}\n💰 Total: Rp ${(orderData.price || 0).toLocaleString('id-ID')}\n\n📝 Kebutuhan Client:\n"${orderData.requirements || 'Tidak ada kebutuhan khusus'}"\n\n⏰ Harap konfirmasi pesanan dalam 3 jam.`;
          
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
            message: `Pesanan baru "${orderData.title}" telah dibayar dan menunggu konfirmasi Anda dalam 3 jam.`,
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
    
    // 13. Return success response in Tripay expected format
    return NextResponse.json({
      success: true,
      message: 'Callback processed successfully',
      data: {
        orderId,
        merchantRef: merchant_ref,
        status: newOrderStatus,
        paymentStatus,
        processedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ [Tripay Callback] Critical error processing callback:', error);
    console.error('❌ [Tripay Callback] Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        success: false, 
        error: {
          message: 'Callback processing failed',
          code: 'CALLBACK_ERROR',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        },
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { 
      success: false,
      error: {
        message: 'Tripay callback endpoint - POST only',
        code: 'METHOD_NOT_ALLOWED'
      }
    },
    { status: 405 }
  );
} 