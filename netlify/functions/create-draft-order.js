exports.handler = async (event, context) => {
    // Add CORS headers for all responses
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
    try {
        console.log('📝 Received draft order request');
        
        const orderData = JSON.parse(event.body);
        
        // Your Shopify credentials from environment variables
        const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
        const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
        
        if (!SHOPIFY_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
            throw new Error('Shopify credentials not configured');
        }
        
        console.log('🔑 Using domain:', SHOPIFY_DOMAIN);
        
        // Create the draft order
        const draftOrder = await createShopifyDraftOrder(orderData, SHOPIFY_DOMAIN, SHOPIFY_ACCESS_TOKEN);
        
        console.log('✅ Draft order created:', draftOrder.name);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                draftOrder: draftOrder,
                message: 'Draft order created successfully'
            })
        };
        
    } catch (error) {
        console.error('❌ Draft order creation failed:', error.message);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

async function createShopifyDraftOrder(orderData, domain, accessToken) {
    console.log('🛒 Creating draft order for:', orderData.customer_name);
    
    const { diyCode, wxyzCode, product } = orderData;
    
    // Prepare line items for each size
    const lineItems = [];
    
    Object.entries(orderData.quantities).forEach(([size, quantity]) => {
        if (quantity > 0) {
            lineItems.push({
                product_id: product.id,
                quantity: parseInt(quantity),
                properties: [
                    { name: 'DIY Code', value: `${diyCode}-${wxyzCode}` },
                    { name: 'Size', value: size.toUpperCase() },
                    { name: 'Length', value: orderData.configuration.length },
                    { name: 'Sleeve', value: orderData.configuration.sleeve },
                    { name: 'Style', value: orderData.configuration.style },
                    { name: 'Collar', value: orderData.configuration.collar },
                    { name: 'Hem', value: orderData.configuration.hem },
                    { name: 'Cuff', value: orderData.configuration.cuff },
                    { name: 'Arms Slits', value: orderData.configuration.arms_slits },
                    { name: 'Color', value: orderData.configuration.color },
                    { name: 'Customer Email', value: orderData.customer_email || '' },
                    { name: 'Order Date', value: new Date().toLocaleDateString() }
                ]
            });
        }
    });
    
    // Create customer object
    const customerName = orderData.customer_name || 'Custom Order';
    const nameParts = customerName.split(' ');
    const firstName = nameParts[0] || customerName;
    const lastName = nameParts.slice(1).join(' ') || '';
    
    // Create draft order payload
    const draftOrderPayload = {
        draft_order: {
            customer: {
                first_name: firstName,
                last_name: lastName,
                email: orderData.customer_email || null
            },
            line_items: lineItems,
            use_customer_default_address: false,
            note: `Custom DIY Sweater Order - ${diyCode}-${wxyzCode}\n\nConfiguration:\n${JSON.stringify(orderData.configuration, null, 2)}\n\nCustomer Notes: ${orderData.notes || 'None'}`,
            tags: [
                `DIY-${diyCode}`, 
                `Config-${wxyzCode}`, 
                'Custom-Sweater', 
                'Microsite-Order',
                `Total-${orderData.total_pieces}-pieces`
            ],
            invoice_sent_at: null, // Don't auto-send invoice
            status: 'open'
        }
    };
    
    console.log('📤 Sending to Shopify API...');
    
    // Make API request to Shopify
    const response = await fetch(`https://${domain}/admin/api/2024-01/draft_orders.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
        },
        body: JSON.stringify(draftOrderPayload)
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
        console.error('🚨 Shopify API Error:', response.status, responseText);
        throw new Error(`Shopify API error: ${response.status} - ${responseText}`);
    }
    
    const result = JSON.parse(responseText);
    return result.draft_order;
}
