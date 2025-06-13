import { NextResponse } from 'next/server';
import { db } from '../../../../firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request) {
  try {
    console.log('🔔 [Tripay Callback] Received callback request');
    
    // Enhanced request logging
    const headers = Object.fromEntries(request.headers.entries());
    console.log('📋 [Tripay Callback] Headers:', headers);
    
    // Get callback data
    const callbackData = await request.json();
    console.log('📥 [Tripay Callback] Data:', callbackData);
    
    // Validate required fields
    const requiredFields = ['reference', 'merchant_ref', 'status'];
    for (const field of requiredFields) {
      if (!callbackData[field]) {
        console.error(`❌ [Tripay Callback] Missing field: ${field}`);
        return NextResponse.json(
          { success: false, message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }
    
    const { merchant_ref, status, reference, paid_at, amount_received, payment_method } = callbackData;
    
    console.log('🔍 [Tripay Callback] Processing:', {
      merchant_ref,
      status,
      reference,
      paid_at,
      amount_received,
      payment_method
    });
    
    // Find order by merchant reference using Firebase Admin SDK
    const ordersRef = db.collection('orders');
    const querySnapshot = await ordersRef.where('merchantRef', '==', merchant_ref).get();
    
    let orderDoc, orderId, orderData;
    
    if (querySnapshot.empty) {
      console.warn(`⚠️ [Tripay Callback] Order not found for merchant_ref: ${merchant_ref}, creating missing order`);
      
      // Auto-create missing order with minimal required data
      const newOrderData = {
        merchantRef: merchant_ref,
        tripayReference: reference,
        status: 'payment',
        paymentStatus: 'pending',
        totalAmount: callbackData.total_amount || 0,
        amountReceived: callbackData.amount_received || 0,
        paymentMethod: callbackData.payment_method || 'Unknown',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        autoCreated: true,
        note: 'Auto-created from callback due to missing order'
      };
      
      // Create the missing order
      const newOrderRef = await ordersRef.add(newOrderData);
      orderId = newOrderRef.id;
      orderData = newOrderData;
      
      console.log('✅ [Tripay Callback] Created missing order:', {
        orderId,
        merchantRef: merchant_ref,
        totalAmount: callbackData.total_amount
      });
    } else {
      orderDoc = querySnapshot.docs[0];
      orderId = orderDoc.id;
      orderData = orderDoc.data();
      
      console.log('📋 [Tripay Callback] Found existing order:', {
        orderId,
        currentStatus: orderData.status,
        newStatus: status
      });
    }
    
    // Determine new order status based on Tripay status
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
        paymentStatus = 'pending';
        break;
    }
    
    // Prepare update data using Firebase Admin SDK
    const updateData = {
      paymentStatus,
      tripayStatus: status,
      tripayReference: reference,
      updatedAt: FieldValue.serverTimestamp()
    };
    
    // Add payment completion data if paid
    if (status.toUpperCase() === 'PAID') {
      updateData.status = newOrderStatus;
      updateData.paidAt = paid_at ? new Date(paid_at * 1000) : FieldValue.serverTimestamp();
      
      // Set confirmation deadline (1 minute from payment - FOR TESTING)
      const confirmationDeadline = new Date();
      confirmationDeadline.setMinutes(confirmationDeadline.getMinutes() + 1);
      updateData.confirmationDeadline = confirmationDeadline;
      
      if (amount_received) {
        updateData.amountReceived = amount_received;
      }
      
      if (payment_method) {
        updateData.paymentMethod = payment_method;
      }
      
      // Update timeline using nested field update
      updateData['timeline.confirmed'] = FieldValue.serverTimestamp();
      
      console.log('💰 [Tripay Callback] Payment confirmed - updating to pending status');
    } else if (['EXPIRED', 'FAILED', 'REFUND'].includes(status.toUpperCase())) {
      updateData.status = newOrderStatus;
      updateData.cancelledAt = FieldValue.serverTimestamp();
      updateData.cancellationReason = `Payment ${status.toLowerCase()}`;
      
      // Update timeline using nested field update
      updateData['timeline.cancelled'] = FieldValue.serverTimestamp();
      
      console.log(`❌ [Tripay Callback] Payment ${status} - updating to cancelled status`);
    }
    
    // Update order in Firebase using Admin SDK
    console.log('🔄 [Tripay Callback] Updating order with data:', updateData);
    const orderRef = db.collection('orders').doc(orderId);
    await orderRef.update(updateData);
    
    console.log('✅ [Tripay Callback] Order updated successfully:', {
      orderId,
      merchantRef: merchant_ref,
      oldStatus: orderData.status,
      newStatus: newOrderStatus,
      paymentStatus
    });
    
    // Send notification and create chat if payment is confirmed
    if (status.toUpperCase() === 'PAID') {
      console.log('📧 [Tripay Callback] Payment confirmed - creating chat and sending notifications');
      
      try {
        // Import required services
        const { db: clientDb } = await import('../../../../firebase/config');
        const { collection, addDoc, serverTimestamp, doc, getDoc } = await import('firebase/firestore');
        
        // Get order details for chat creation
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
    
    return NextResponse.json({
      success: true,
      message: 'Callback processed successfully',
      orderId,
      merchantRef: merchant_ref,
      status: newOrderStatus,
      paymentStatus
    });
    
  } catch (error) {
    console.error('❌ [Tripay Callback] Error processing callback:', error);
    console.error('❌ [Tripay Callback] Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Callback processing failed',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { message: 'Tripay callback endpoint - POST only' },
    { status: 405 }
  );
} 