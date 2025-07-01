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
    
    const { diyCode, wxyzCode } = orderData;
    
    // Get unit price from your pricing logic
    const unitPrice = calculatePrice(orderData.configuration);
    
    // Prepare line items for each size with quantity > 0
    const lineItems = [];
    
    // Get the product info for this DIY code
    const productInfo = getProductInfo(diyCode);
    
    Object.entries(orderData.quantities).forEach(([size, quantity]) => {
        if (quantity > 0) {
            lineItems.push({
                title: `Custom DIY Sweater - Size ${size.toUpperCase()}`,
                price: unitPrice.toString(),
                quantity: parseInt(quantity),
                taxable: true,
                product_id: productInfo.id, // ← Reference your existing product
                properties: [
                    { name: 'DIY Code', value: `${diyCode}-${wxyzCode}` },
                    { name: 'Product ID', value: productInfo.id || 'Custom' },
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
    
    if (lineItems.length === 0) {
        throw new Error('No items with quantity > 0 found');
    }
    
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
            ].join(','),
            invoice_sent_at: null, // Don't auto-send invoice
            status: 'open',
            send_receipt: false, // Ensure no auto-receipt to customer
            send_fulfillment_receipt: false // Ensure no auto-fulfillment receipt
        }
    };
    
    console.log('📤 Sending to Shopify API...');
    console.log('Line items:', lineItems.length);
    
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

// Price calculation function - matches frontend with UPDATED PRICES
function calculatePrice(configuration) {
    const combinationKey = `${configuration.length.toLowerCase()}_${configuration.sleeve.toLowerCase()}_${configuration.style.toLowerCase()}_${configuration.collar.toLowerCase()}`;
    
    const priceMap = {
        'normal_long_sweater_crew': 130.00,   // DIY1111
        'normal_long_sweater_polo': 141.00,   // DIY1112  
        'normal_long_cardigan_crew': 148.00,  // DIY1121
        'normal_long_cardigan_polo': 156.00,  // DIY1122
        'normal_short_sweater_crew': 122.00,  // DIY1211
        'normal_short_sweater_polo': 133.00,  // DIY1212
        'normal_short_cardigan_crew': 141.00, // DIY1221
        'normal_short_cardigan_polo': 152.00, // DIY1222
        'cropped_long_sweater_crew': 119.00,  // DIY2111
        'cropped_long_sweater_polo': 130.00,  // DIY2112
        'cropped_long_cardigan_crew': 137.00, // DIY2121
        'cropped_long_cardigan_polo': 148.00, // DIY2122
        'cropped_short_sweater_crew': 111.00, // DIY2211
        'cropped_short_sweater_polo': 122.00, // DIY2212
        'cropped_short_cardigan_crew': 130.00, // DIY2221
        'cropped_short_cardigan_polo': 141.00  // DIY2222
    };
    
    return priceMap[combinationKey] || 111.00;
}

// Product mapping function - Complete list with UPDATED PRICES
function getProductInfo(diyCode) {
    const productMap = {
        'DIY1111': { id: '9552915333448', price: 130.00 }, // Normal, Long, Sweater, Crew
        'DIY1112': { id: '9552915398984', price: 141.00 }, // Normal, Long, Sweater, Polo
        'DIY1121': { id: '9552915464520', price: 148.00 }, // Normal, Long, Cardigan, Crew
        'DIY1122': { id: '9552915530056', price: 156.00 }, // Normal, Long, Cardigan, Polo
        'DIY1211': { id: '9552915628360', price: 122.00 }, // Normal, Short, Sweater, Crew
        'DIY1212': { id: '9552915726664', price: 133.00 }, // Normal, Short, Sweater, Polo
        'DIY1221': { id: '9552915792200', price: 141.00 }, // Normal, Short, Cardigan, Crew
        'DIY1222': { id: '9552915890504', price: 152.00 }, // Normal, Short, Cardigan, Polo
        'DIY2111': { id: '9552915956040', price: 119.00 }, // Cropped, Long, Sweater, Crew
        'DIY2112': { id: '9552916021576', price: 130.00 }, // Cropped, Long, Sweater, Polo
        'DIY2121': { id: '9552916087112', price: 137.00 }, // Cropped, Long, Cardigan, Crew
        'DIY2122': { id: '9552916119880', price: 148.00 }, // Cropped, Long, Cardigan, Polo
        'DIY2211': { id: '9552916218184', price: 111.00 }, // Cropped, Short, Sweater, Crew
        'DIY2212': { id: '9552916283720', price: 122.00 }, // Cropped, Short, Sweater, Polo
        'DIY2221': { id: '9552916316488', price: 130.00 }, // Cropped, Short, Cardigan, Crew
        'DIY2222': { id: '9552916414792', price: 141.00 }  // Cropped, Short, Cardigan, Polo
    };
    
    return productMap[diyCode] || { id: null, price: 111.00 };
}
