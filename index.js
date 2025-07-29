// index.js (Versão Definitiva - Copie e cole todo este conteúdo)

const wppconnect = require('@wppconnect-team/wppconnect');
const { db, dbRun, dbGet, dbAll } = require('./database.js');
const axios = require('axios');
const { initializeWebServer } = require('./server.js');
const initialMessages = require('./messages.js');

const NOME_DA_EMPRESA = "YUP";

let userState = {};
let carrinhos = {};
let botMessages = {};

// -----------------------------------------------------------------
// FUNÇÕES DE GERENCIAMENTO DE MENSAGENS
// -----------------------------------------------------------------
function loadBotMessages() {
    db.all("SELECT key, content FROM bot_messages", [], (err, rows) => {
        if (err) {
            console.error("❌ Erro fatal ao carregar mensagens do bot. Usando fallback.", err);
            botMessages = initialMessages;
            return;
        }
        botMessages = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.content }), {});
        console.log("✅ Mensagens do bot carregadas do banco de dados!");
    });
}

function populateInitialMessages() {
    const stmt = db.prepare("INSERT OR IGNORE INTO bot_messages (key, content) VALUES (?, ?)");
    for (const key in initialMessages) {
        stmt.run(key, initialMessages[key]);
    }
    stmt.finalize((err) => {
        if (err) {
            console.error("❌ Erro ao popular banco com mensagens iniciais:", err);
        } else {
            console.log("📖 Banco de dados de mensagens verificado e populado.");
            loadBotMessages();
        }
    });
}

// =================================================================
// INICIALIZAÇÃO DO BOT E SERVIDOR WEB
// =================================================================
wppconnect
    .create({
        session: 'bot-vendas',
        catchQR: (base64Qr, asciiQR) => { console.log(asciiQR); },
        statusFind: (statusSession, session) => { console.log('Status da Sessão:', statusSession); },
        headless: true,
    })
    .then((client) => {
        populateInitialMessages();
        const io = initializeWebServer(client, loadBotMessages, botMessages);
        
        io.on('connection', (socket) => {
            socket.on('paymentUpdate', (data) => {
                console.log(`[Socket.IO] Recebida atualização de pagamento para pedido ${data.orderId}: ${data.status}`);
            });
        });
        
        start(client, io);
    })
    .catch((error) => console.log(error));

// =================================================================
// FUNÇÃO PRINCIPAL E ROTEARORES DE LÓGICA
// =================================================================
async function start(client, io) {
    client.onMessage(async (message) => {
        if (!message.from || message.isStatus || message.isGroupMsg || message.fromMe) return;

        const senderId = message.from;

        const configRows = await dbAll(`SELECT key, value FROM config`);
        const settings = configRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
        
        const adminPhoneFull = settings.adminPhone + '@c.us';
        const isAdmin = senderId === adminPhoneFull;
        const registrationRequired = settings.registration_required === 'true';

        if (isAdmin) {
            await handleAdminLogic(client, message);
            return;
        }

        let customer = await dbGet(`SELECT * FROM customers WHERE phone = ?`, [senderId]);

        if (!customer) {
            if (registrationRequired) {
                const warningMsg = (botMessages.unregistered_user_warning || "Aviso: O número {senderId} tentou usar o bot, mas não está cadastrado.").replace('{senderId}', senderId.replace('@c.us', ''));
                await client.sendText(adminPhoneFull, warningMsg);
                return;
            } else {
                const customerName = message.sender.pushname || senderId.replace('@c.us', '');
                try {
                    await dbRun(`INSERT INTO customers (phone, name, isHumanMode) VALUES (?, ?, ?)`, [senderId, customerName, false]);
                    customer = await dbGet(`SELECT * FROM customers WHERE phone = ?`, [senderId]);
                    await client.sendText(adminPhoneFull, `✅ Novo cliente auto-cadastrado: *${customerName}* (${senderId.replace('@c.us', '')})`);
                } catch (error) {
                    console.error("Erro ao auto-cadastrar novo cliente:", error);
                    await client.sendText(senderId, botMessages.generic_error);
                    return;
                }
            }
        }
        await handleCustomerLogic(client, message, customer, io);
    });
}

async function handleAdminLogic(client, message) {
    const senderId = message.from;
    if (message.type === 'list_response' && message.listResponse) {
        const rowId = message.listResponse.singleSelectReply.selectedRowId;
        if (rowId) await handleAdminListResponse(client, senderId, rowId);
    } else if (userState[senderId] && userState[senderId].stage) {
        await handleAdminTextInput(client, senderId, message.body, client);
    } else {
        await showAdminMenu(client, senderId);
    }
}

async function handleCustomerLogic(client, message, originalCustomerObject, io) {
    const senderId = message.from;
    const customerName = message.sender.pushname || originalCustomerObject.name || 'Cliente';

    const customer = await dbGet(`SELECT * FROM customers WHERE phone = ?`, [senderId]);
    if (!customer) return;

    try {
        const result = await dbRun(`INSERT INTO messages (customerPhone, messageBody, sender) VALUES (?, ?, 'customer')`,[senderId, message.body]);
        const savedMessage = await dbGet(`SELECT * FROM messages WHERE id = ?`, [result.lastID]);
        io.emit('newMessage', savedMessage);
    } catch (e) { console.error("Erro ao salvar/emitir mensagem do cliente:", e); }

    if (customer.isHumanMode) {
        console.log((botMessages.human_mode_active || "Modo Humano ATIVO para {senderId}.").replace('{senderId}', senderId));
        return;
    }

    if (!carrinhos[senderId]) {
        await loadPersistentCart(senderId);
    }

    if (message.type === 'list_response' && message.listResponse) {
        const rowId = message.listResponse.singleSelectReply.selectedRowId;
        if (rowId) await handleCustomerListResponse(client, senderId, rowId, customerName, customer);
    } else if (userState[senderId] && userState[senderId].stage) {
        await handleCustomerTextInput(client, senderId, message.body, customerName);
    } else {
        if (carrinhos[senderId] && carrinhos[senderId].items.length > 0) {
            const rows = [
                { rowId: 'cart_continue', title: botMessages.list_option_cart_continue },
                { rowId: 'cart_clear_and_start_new', title: botMessages.list_option_cart_clear_and_restart }
            ];
            await client.sendListMessage(senderId, {
                buttonText: botMessages.button_options,
                title: `Olá de novo, ${customerName}!`,
                description: botMessages.cart_resume_prompt.replace('{itemCount}', carrinhos[senderId].items.length),
                sections: [{ rows }]
            });
        } else {
            await showCustomerMenu(client, senderId, customerName);
        }
    }
}

// =================================================================
// FUNÇÕES DE CARRINHO PERSISTENTE
// =================================================================
async function loadPersistentCart(customerPhone) {
    const cartItems = await dbAll(`SELECT p.id, p.name, p.price, pc.quantity as qtd FROM persistent_carts pc JOIN products p ON pc.productId = p.id WHERE pc.customerPhone = ?`, [customerPhone]);
    carrinhos[customerPhone] = { items: [], total: 0 };
    if (cartItems.length > 0) {
        for (const item of cartItems) {
            carrinhos[customerPhone].items.push({ id: item.id, nome: item.name, qtd: item.qtd, preco: item.price, unidade: 'pacote' });
            carrinhos[customerPhone].total += item.qtd * item.price;
        }
    }
}

async function savePersistentCart(customerPhone) {
    await dbRun(`DELETE FROM persistent_carts WHERE customerPhone = ?`, [customerPhone]);
    const cart = carrinhos[customerPhone];
    if (cart && cart.items.length > 0) {
        for (const item of cart.items) {
            await dbRun(`INSERT INTO persistent_carts (customerPhone, productId, quantity) VALUES (?, ?, ?)`, [customerPhone, item.id, item.qtd]);
        }
    }
}


// =================================================================
// MENUS PRINCIPAIS
// =================================================================
async function showAdminMenu(client, to) {
    userState[to] = {};
    const config = await dbGet(`SELECT value FROM config WHERE key = 'minOrderValue'`);
    const rows = [
        { rowId: 'admin_manage_products', title: botMessages.list_option_admin_manage_products, description: 'Cadastrar, editar, remover e alterar estoque' },
        { rowId: 'admin_manage_customers', title: botMessages.list_option_admin_manage_customers, description: 'Adicionar ou remover clientes' },
        { rowId: 'admin_reports', title: botMessages.list_option_admin_reports, description: 'Ver dados de vendas' },
        { rowId: 'admin_set_min_order', title: botMessages.list_option_admin_config_min_order, description: `Valor atual: R$${parseFloat(config.value).toFixed(2)}` }
    ];
    await client.sendListMessage(to, { buttonText: botMessages.button_options, title: botMessages.admin_menu_title, sections: [{ title: botMessages.admin_menu_section_title, rows }] });
}

async function showCustomerMenu(client, to, customerName) {
    userState[to] = {};
    if (!carrinhos[to]) { carrinhos[to] = { items: [], total: 0 }; }
    const rows = [
        { rowId: 'customer_view_products', title: botMessages.list_option_view_products },
        { rowId: 'customer_view_cart', title: botMessages.list_option_view_cart, description: `Itens: ${carrinhos[to]?.items.length || 0} | Total: R$${carrinhos[to]?.total.toFixed(2) || '0.00'}` },
        { rowId: 'customer_load_saved_order', title: botMessages.list_option_load_saved_order },
        { rowId: 'customer_order_history', title: botMessages.list_option_order_history }
    ];
    await client.sendListMessage(to, {
        buttonText: botMessages.button_options,
        title: botMessages.customer_menu_welcome.replace('{customerName}', customerName).replace('{companyName}', NOME_DA_EMPRESA),
        description: botMessages.customer_menu_description,
        sections: [{ title: botMessages.customer_menu_section_title, rows }]
    });
}

// =================================================================
// LÓGICA DO ADMIN
// =================================================================
async function handleAdminListResponse(client, senderId, rowId) {
    const state = userState[senderId] || {};
    if (rowId === 'confirm_cnpj_yes') {
        try {
            await dbRun(`INSERT INTO customers (phone, cnpj, address, city, state) VALUES (?, ?, ?, ?, ?)`,
                [state.phone, state.cnpj, state.apiData.address, state.apiData.city, state.apiData.state]);
            await client.sendText(senderId, botMessages.customer_add_success.replace('{razao_social}', state.apiData.razao_social));
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT') { await client.sendText(senderId, botMessages.customer_already_exists); }
            else { console.error(err); await client.sendText(senderId, botMessages.generic_error); }
        }
        delete userState[senderId];
        await showAdminMenu(client, senderId);
        return;
    } else if (rowId === 'confirm_cnpj_no') {
        userState[senderId] = { ...state, stage: 'admin_add_customer_address' };
        await client.sendText(senderId, botMessages.customer_add_manual_prompt);
        return;
    }
    if (rowId === 'admin_manage_customers') {
        const rows = [
            { rowId: 'customer_add', title: botMessages.list_option_customer_add },
            { rowId: 'customer_remove', title: botMessages.list_option_customer_remove }
        ];
        await client.sendListMessage(senderId, { buttonText: botMessages.button_options, title: botMessages.customer_management_title, sections: [{ rows }] });
    } else if (rowId === 'customer_add') {
        userState[senderId] = { stage: 'admin_add_customer_phone' };
        await client.sendText(senderId, botMessages.customer_add_phone_prompt);
    } else if (rowId === 'customer_remove') {
        const customers = await dbAll(`SELECT phone FROM customers`);
        if (customers.length === 0) { await client.sendText(senderId, botMessages.no_customers_to_remove); return; }
        const rows = customers.map(c => ({ rowId: `customer_remove_phone_${c.phone}`, title: c.phone.replace('@c.us', '') }));
        await client.sendListMessage(senderId, { buttonText: 'Clientes', title: botMessages.customer_management_title, sections: [{ title: botMessages.customer_remove_prompt, rows }] });
    } else if (rowId.startsWith('customer_remove_phone_')) {
        const phoneToRemove = rowId.replace('customer_remove_phone_', '');
        await dbRun(`DELETE FROM customers WHERE phone = ?`, [phoneToRemove]);
        await client.sendText(senderId, botMessages.customer_removed_success.replace('{phone}', phoneToRemove.replace('@c.us', '')));
    }
    else if (rowId === 'admin_manage_products') {
        const rows = [
            { rowId: 'admin_add_product', title: botMessages.list_option_product_add },
            { rowId: 'admin_edit_product_menu', title: botMessages.list_option_product_edit_remove }
        ];
        await client.sendListMessage(senderId, { buttonText: botMessages.button_actions, title: botMessages.product_management_title, sections: [{ rows }] });
    } else if (rowId === 'admin_add_product') {
        userState[senderId] = { stage: 'admin_add_product_name' };
        await client.sendText(senderId, botMessages.product_add_name_prompt);
    } else if (rowId === 'admin_edit_product_menu') {
        const produtos = await dbAll(`SELECT id, name, stock FROM products`);
        if (produtos.length === 0) { await client.sendText(senderId, botMessages.no_products_registered); return; }
        const rows = produtos.map(p => ({ rowId: `product_manage_id_${p.id}`, title: p.name, description: `Estoque: ${p.stock} pacotes` }));
        await client.sendListMessage(senderId, { buttonText: 'Produtos', title: botMessages.product_select_prompt, sections: [{ rows }] });
    } else if (rowId.startsWith('product_manage_id_')) {
        const productId = parseInt(rowId.replace('product_manage_id_', ''));
        const product = await dbGet(`SELECT name FROM products WHERE id = ?`, [productId]);
        userState[senderId] = { productId };
        const rows = [
            { rowId: `edit_field_name`, title: botMessages.list_option_edit_field_name },
            { rowId: `edit_field_price`, title: botMessages.list_option_edit_field_price },
            { rowId: `stock_add`, title: botMessages.list_option_stock_add },
            { rowId: `stock_remove`, title: botMessages.list_option_stock_remove },
            { rowId: `product_delete`, title: botMessages.list_option_product_delete }
        ];
        await client.sendListMessage(senderId, { buttonText: botMessages.button_actions, title: botMessages.product_action_prompt.replace('{productName}', product.name), sections: [{ rows }] });
    }
    else if (rowId.startsWith('edit_field_')) {
        const field = rowId.replace('edit_field_', '');
        userState[senderId].stage = `admin_edit_product_${field}`;
        await client.sendText(senderId, botMessages.product_edit_field_prompt.replace('{field}', field.toUpperCase()));
    }
    else if (rowId === 'stock_add') {
        userState[senderId].stage = 'admin_stock_add_qty';
        await client.sendText(senderId, botMessages.product_stock_add_prompt);
    } else if (rowId === 'stock_remove') {
        userState[senderId].stage = 'admin_stock_remove_qty';
        await client.sendText(senderId, botMessages.product_stock_remove_prompt);
    } else if (rowId === 'product_delete') {
        userState[senderId].stage = 'admin_delete_product_confirm';
        await client.sendText(senderId, botMessages.confirm_delete_product);
    }
    else if (rowId === 'content_type_unidade' || rowId === 'content_type_peso') {
        const contentType = rowId.replace('content_type_', '');
        userState[senderId].contentType = contentType;
        userState[senderId].stage = 'admin_add_product_content_value';
        if (contentType === 'unidade') {
            await client.sendText(senderId, botMessages.product_content_unit_prompt);
        } else {
            await client.sendText(senderId, botMessages.product_content_weight_prompt);
        }
    }
    else if (rowId === 'admin_reports') {
        const rows = [
            { rowId: 'report_top_products', title: botMessages.list_option_report_top_products },
            { rowId: 'report_top_customers', title: botMessages.list_option_report_top_customers }
        ];
        await client.sendListMessage(senderId, { buttonText: 'Relatórios', title: botMessages.reports_title, sections: [{ rows }] });
    } else if (rowId === 'report_top_products') {
        const topProducts = await dbAll(`SELECT productName, SUM(quantity) as total_sold FROM order_items GROUP BY productName ORDER BY total_sold DESC LIMIT 5`);
        let report = botMessages.report_top_products_header;
        if (topProducts.length === 0) { report += botMessages.report_no_data; }
        else { topProducts.forEach((p, i) => { report += `${i + 1}º - *${p.productName}*: ${p.total_sold} pacotes vendidos\n`; }); }
        await client.sendText(senderId, report);
    } else if (rowId === 'report_top_customers') {
        const topCustomers = await dbAll(`SELECT o.customerPhone, COUNT(o.id) as total_orders, SUM(o.totalValue) as total_spent FROM orders o GROUP BY o.customerPhone ORDER BY total_spent DESC LIMIT 5`);
        let report = botMessages.report_top_customers_header;
        if (topCustomers.length === 0) { report += botMessages.report_no_data; }
        else { topCustomers.forEach((c, i) => { report += `${i + 1}º - *${c.customerPhone.replace('@c.us', '')}*\n Pedidos: ${c.total_orders} | Total Gasto: R$${c.total_spent.toFixed(2)}\n`; }); }
        await client.sendText(senderId, report);
    }
    else if (rowId === 'admin_set_min_order') {
        userState[senderId] = { stage: 'admin_set_min_order_value' };
        await client.sendText(senderId, botMessages.min_order_set_prompt);
    }
}

async function handleAdminTextInput(client, senderId, text, wppClient) {
    const state = userState[senderId];
    if (!state || !state.stage) return;

    switch (state.stage) {
        case 'admin_add_customer_phone':
            userState[senderId] = { stage: 'admin_add_customer_cnpj', phone: text.replace(/\D/g, '') + '@c.us' };
            await client.sendText(senderId, botMessages.customer_add_cnpj_prompt);
            break;
        case 'admin_add_customer_cnpj':
            const cnpj = text.replace(/\D/g, '');
            userState[senderId].cnpj = cnpj;
            await client.sendText(senderId, botMessages.cnpj_consulting.replace('{cnpj}', cnpj));
            try {
                const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
                if (response.data) {
                    const data = response.data;
                    const fullAddress = `${data.descricao_tipo_de_logradouro || ''} ${data.logradouro || ''}, ${data.numero || ''} - ${data.bairro || ''} ${data.complemento || ''}`.trim();
                    userState[senderId].apiData = { razao_social: data.razao_social, address: fullAddress, city: data.municipio, state: data.uf };
                    
                    const confirmationMessage = botMessages.cnpj_data_found
                        .replace('{razao_social}', data.razao_social)
                        .replace('{address}', fullAddress)
                        .replace('{city}', data.municipio)
                        .replace('{state}', data.uf);
                        
                    await client.sendText(senderId, confirmationMessage);
                    const rows = [
                        { rowId: 'confirm_cnpj_yes', title: botMessages.list_option_confirm_cnpj_yes },
                        { rowId: 'confirm_cnpj_no', title: botMessages.list_option_confirm_cnpj_no }
                    ];
                    await client.sendListMessage(senderId, { buttonText: botMessages.button_confirm, title: botMessages.cnpj_data_confirmation_title, sections: [{ rows }] });
                    userState[senderId].stage = 'awaiting_cnpj_confirmation';
                }
            } catch (error) {
                console.error("Erro na API de CNPJ:", error.message);
                await client.sendText(senderId, botMessages.cnpj_api_error);
                userState[senderId].stage = 'admin_add_customer_address';
            }
            break;
        case 'admin_add_customer_address':
            userState[senderId].address = text;
            userState[senderId].stage = 'admin_add_customer_city';
            await client.sendText(senderId, botMessages.customer_add_address_prompt);
            break;
        case 'admin_add_customer_city':
            userState[senderId].city = text;
            userState[senderId].stage = 'admin_add_customer_state_manual';
            await client.sendText(senderId, botMessages.customer_add_city_prompt);
            break;
        case 'admin_add_customer_state_manual':
            userState[senderId].state = text;
            try {
                await dbRun(`INSERT INTO customers (phone, cnpj, address, city, state) VALUES (?, ?, ?, ?, ?)`,
                    [state.phone, state.cnpj, state.address, state.city, text]);
                await client.sendText(senderId, botMessages.customer_add_manual_success);
            } catch (err) {
                if (err.code === 'SQLITE_CONSTRAINT') { await client.sendText(senderId, botMessages.customer_already_exists); }
                else { console.error(err); await client.sendText(senderId, botMessages.generic_error); }
            }
            delete userState[senderId];
            break;
        case 'admin_add_product_name':
            userState[senderId] = { stage: 'admin_add_product_price', name: text };
            await client.sendText(senderId, botMessages.product_add_price_prompt.replace('{name}', text));
            break;
        case 'admin_add_product_price':
            const price = parseFloat(text.replace(',', '.'));
            userState[senderId].price = price;
            userState[senderId].stage = 'admin_add_product_stock';
            await client.sendText(senderId, botMessages.product_add_stock_prompt.replace('{price}', price.toFixed(2)));
            break;
        case 'admin_add_product_stock':
            userState[senderId].stock = parseFloat(text.replace(',', '.'));
            const rows = [
                { rowId: 'content_type_unidade', title: botMessages.list_option_content_type_unit, description: 'Ex: um pacote com 6 croissants' },
                { rowId: 'content_type_peso', title: botMessages.list_option_content_type_weight, description: 'Ex: um pacote de carne com 1.2 kg' }
            ];
            await client.sendListMessage(senderId, { buttonText: 'Tipo de Conteúdo', title: botMessages.product_content_type_prompt, sections: [{ rows }] });
            userState[senderId].stage = 'awaiting_content_type';
            break;
        case 'admin_add_product_content_value':
            userState[senderId].contentValue = parseFloat(text.replace(',', '.'));
            try {
                await dbRun(`INSERT INTO products (name, price, stock, contentType, contentValue) VALUES (?, ?, ?, ?, ?)`,
                    [state.name, state.price, state.stock, state.contentType, state.contentValue]);
                await client.sendText(senderId, botMessages.product_add_success.replace('{productName}', state.name));
            } catch (err) {
                console.error(err);
                await client.sendText(senderId, botMessages.generic_error);
            }
            delete userState[senderId];
            await showAdminMenu(client, senderId);
            break;
        case 'admin_edit_product_name':
            await dbRun(`UPDATE products SET name = ? WHERE id = ?`, [text, state.productId]);
            await client.sendText(senderId, botMessages.product_update_success.replace('{productName}', text));
            delete userState[senderId];
            break;
        case 'admin_edit_product_price':
            const newPrice = parseFloat(text.replace(',', '.'));
            if (isNaN(newPrice) || newPrice < 0) { await client.sendText(senderId, botMessages.invalid_value); return; }
            await dbRun(`UPDATE products SET price = ? WHERE id = ?`, [newPrice, state.productId]);
            await client.sendText(senderId, botMessages.price_update_success.replace('{newPrice}', newPrice.toFixed(2)));
            delete userState[senderId];
            break;
        case 'admin_stock_add_qty':
            const product_add = await dbGet(`SELECT name, stock FROM products WHERE id = ?`, [state.productId]);
            const qty_add = parseFloat(text.replace(',', '.'));
            if (isNaN(qty_add) || qty_add <= 0) { await client.sendText(senderId, botMessages.invalid_value); return; }

            const newStock_add = product_add.stock + qty_add;
            await dbRun(`UPDATE products SET stock = ? WHERE id = ?`, [newStock_add, state.productId]);
            await client.sendText(senderId, botMessages.stock_update_success.replace('{productName}', product_add.name).replace('{newStock}', newStock_add));

            const notifications = await dbAll(`SELECT customerPhone FROM stock_notifications WHERE productId = ?`, [state.productId]);
            if (notifications.length > 0) {
                await client.sendText(senderId, botMessages.stock_notification_sent.replace('{count}', notifications.length));
                for (const notif of notifications) {
                    await wppClient.sendText(notif.customerPhone, botMessages.stock_notification_callback.replace('{productName}', product_add.name));
                }
                await dbRun(`DELETE FROM stock_notifications WHERE productId = ?`, [state.productId]);
            }
            delete userState[senderId];
            await showAdminMenu(client, senderId);
            break;
        case 'admin_stock_remove_qty':
            const product_remove = await dbGet(`SELECT name, stock FROM products WHERE id = ?`, [state.productId]);
            const qty_remove = parseFloat(text.replace(',', '.'));
            if (isNaN(qty_remove) || qty_remove <= 0) { await client.sendText(senderId, botMessages.invalid_value); return; }
            if (product_remove.stock < qty_remove) { await client.sendText(senderId, botMessages.stock_insufficient_to_remove.replace('{quantity}', qty_remove).replace('{stock}', product_remove.stock)); return; }
            
            const newStock_remove = product_remove.stock - qty_remove;
            await dbRun(`UPDATE products SET stock = ? WHERE id = ?`, [newStock_remove, state.productId]);
            await client.sendText(senderId, botMessages.stock_update_success.replace('{productName}', product_remove.name).replace('{newStock}', newStock_remove));
            delete userState[senderId];
            await showAdminMenu(client, senderId);
            break;
        case 'admin_delete_product_confirm':
            if (text.toUpperCase() === 'SIM') {
                await dbRun(`DELETE FROM products WHERE id = ?`, [state.productId]);
                await client.sendText(senderId, botMessages.product_removed_success);
            } else {
                await client.sendText(senderId, botMessages.operation_cancelled);
            }
            delete userState[senderId];
            break;
        case 'admin_set_min_order_value':
            const minOrder = parseFloat(text.replace(',', '.'));
            if (isNaN(minOrder) || minOrder < 0) { await client.sendText(senderId, botMessages.invalid_value); return; }
            await dbRun(`UPDATE config SET value = ? WHERE key = 'minOrderValue'`, [minOrder]);
            delete userState[senderId];
            await client.sendText(senderId, botMessages.min_order_update_success.replace('{minOrder}', minOrder.toFixed(2)));
            await showAdminMenu(client, senderId);
            break;
    }
}

// =================================================================
// LÓGICA DO CLIENTE
// =================================================================
async function handleCustomerListResponse(client, senderId, rowId, customerName, customer) {
    if (rowId === 'cart_continue') {
        await showCustomerMenu(client, senderId, customerName);
        return;
    } else if (rowId === 'cart_clear_and_start_new') {
        carrinhos[senderId] = { items: [], total: 0 };
        await savePersistentCart(senderId);
        await client.sendText(senderId, botMessages.cart_cleared);
        await showCustomerMenu(client, senderId, customerName);
        return;
    }
    if (rowId.startsWith('notify_stock_id_')) {
        const productId = parseInt(rowId.replace('notify_stock_id_', ''));
        try {
            await dbRun(`INSERT INTO stock_notifications (customerPhone, productId) VALUES (?, ?)`, [senderId, productId]);
            await client.sendText(senderId, botMessages.out_of_stock_notification_set.replace('{customerName}', customerName));
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                await client.sendText(senderId, botMessages.already_in_waitlist.replace('{customerName}', customerName));
            }
        }
        return;
    }
    if (rowId === 'customer_order_history') {
        const orders = await dbAll(`SELECT id, totalValue, createdAt FROM orders WHERE customerPhone = ? ORDER BY createdAt DESC LIMIT 5`, [senderId]);
        if (orders.length === 0) {
            await client.sendText(senderId, botMessages.order_history_empty.replace('{customerName}', customerName));
            return;
        }
        let historyText = botMessages.order_history_header.replace('{customerName}', customerName);
        for (const order of orders) {
            const date = new Date(order.createdAt).toLocaleDateString('pt-BR');
            historyText += botMessages.order_history_item_header.replace('{id}', order.id).replace('{date}', date).replace('{value}', order.totalValue.toFixed(2));
            const items = await dbAll(`SELECT productName, quantity FROM order_items WHERE orderId = ?`, [order.id]);
            items.forEach(item => {
                historyText += botMessages.order_history_item_line.replace('{quantity}', item.quantity).replace('{name}', item.productName);
            });
            historyText += `\n`;
        }
        await client.sendText(senderId, historyText);
        return;
    }
    if (rowId === 'customer_view_products') {
        const produtos = await dbAll(`SELECT * FROM products WHERE stock > 0`);
        if (produtos.length === 0) { await client.sendText(senderId, botMessages.products_unavailable.replace('{customerName}', customerName)); return; }
        const rows = produtos.map(p => {
            let description = `R$ ${p.price.toFixed(2)} por pacote`;
            if (p.contentType === 'unidade') { description += ` (contém ${p.contentValue} unidades)`; }
            else if (p.contentType === 'peso') { description += ` (aprox. ${p.contentValue} kg)`; }
            return { rowId: `product_id_${p.id}`, title: p.name, description: description };
        });
        await client.sendListMessage(senderId, { buttonText: botMessages.button_see_products, title: 'Nossos Produtos', description: botMessages.products_list_header.replace('{customerName}', customerName), sections: [{ title: botMessages.products_list_section_title, rows }] });
    } else if (rowId.startsWith('product_id_')) {
        const productId = parseInt(rowId.replace('product_id_', ''));
        const product = await dbGet(`SELECT * FROM products WHERE id = ?`, [productId]);
        if (product) {
            userState[senderId] = { stage: 'customer_add_quantity', productId: product.id };
            const instructionText = botMessages.product_selection_prompt.replace('{customerName}', customerName).replace('{productName}', product.name);
            await client.sendText(senderId, instructionText);
        }
    } else if (rowId === 'customer_view_cart') {
        const carrinho = carrinhos[senderId];
        if (!carrinho || carrinho.items.length === 0) { await client.sendText(senderId, botMessages.cart_empty.replace('{customerName}', customerName)); return; }
        let cartText = botMessages.cart_view_header.replace('{customerName}', customerName);
        carrinho.items.forEach(item => {
            cartText += botMessages.cart_view_line_item
                .replace('{name}', item.nome).replace('{quantity}', item.qtd).replace('{unit}', item.unidade)
                .replace('{price}', item.preco.toFixed(2)).replace('{subtotal}', (item.qtd * item.preco).toFixed(2));
        });
        cartText += botMessages.cart_view_total.replace('{total}', carrinho.total.toFixed(2));
        await client.sendText(senderId, cartText);
        const rows = [
            { rowId: 'cart_finalize', title: botMessages.list_option_finalize_order },
            { rowId: 'cart_add_more', title: botMessages.list_option_add_more_items },
            { rowId: 'cart_clear', title: botMessages.list_option_clear_cart }
        ];
        await client.sendListMessage(senderId, { buttonText: botMessages.button_options, title: botMessages.cart_options_title, sections: [{ rows }] });
    } else if (rowId === 'cart_add_more') {
        await handleCustomerListResponse(client, senderId, 'customer_view_products', customerName, customer);
    } else if (rowId === 'cart_clear') {
        carrinhos[senderId] = { items: [], total: 0 };
        await savePersistentCart(senderId);
        await client.sendText(senderId, botMessages.cart_cleared_confirmation);
    } else if (rowId === 'cart_finalize') {
        await finalizeOrder(client, senderId, customerName, customer);
        return;
    } else if (rowId === 'save_order_yes') {
        const lastOrder = await dbGet(`SELECT id FROM orders WHERE customerPhone = ? ORDER BY createdAt DESC LIMIT 1`, [senderId]);
        const lastOrderItems = await dbAll(`SELECT productId, quantity FROM order_items WHERE orderId = ?`, [lastOrder.id]);
        await dbRun(`DELETE FROM saved_orders WHERE customerPhone = ?`, [senderId]);
        for (const item of lastOrderItems) {
            if (item.productId) {
                await dbRun(`INSERT INTO saved_orders (customerPhone, productId, quantity) VALUES (?, ?, ?)`, [senderId, item.productId, item.quantity]);
            }
        }
        await client.sendText(senderId, botMessages.order_saved_confirmation);
    } else if (rowId === 'save_order_no') {
        await client.sendText(senderId, botMessages.order_not_saved_confirmation);
    } else if (rowId === 'customer_load_saved_order') {
        const savedItems = await dbAll(`SELECT p.id, p.name, p.price, s.quantity as qtd FROM saved_orders s JOIN products p ON s.productId = p.id WHERE s.customerPhone = ?`, [senderId]);
        if (savedItems.length === 0) { await client.sendText(senderId, botMessages.no_saved_order.replace('{customerName}', customerName)); return; }
        carrinhos[senderId] = { items: [], total: 0 };
        for (const item of savedItems) {
            const product = await dbGet(`SELECT stock FROM products WHERE id = ?`, [item.id]);
            if (product && product.stock >= item.qtd) {
                carrinhos[senderId].items.push({ id: item.id, nome: item.name, qtd: item.qtd, preco: item.price, unidade: 'pacote' });
                carrinhos[senderId].total += item.qtd * item.price;
            }
        }
        await savePersistentCart(senderId);
        await client.sendText(senderId, botMessages.saved_order_loaded.replace('{customerName}', customerName));
    }
}

async function handleCustomerTextInput(client, senderId, text, customerName) {
    const state = userState[senderId];
    if (!state || state.stage !== 'customer_add_quantity') return;
    const quantidade = parseInt(text.replace(/\D/g, ''));
    if (isNaN(quantidade) || quantidade <= 0 || !Number.isInteger(quantidade)) {
        await client.sendText(senderId, (botMessages.invalid_value || "Valor inválido.").replace('{customerName}', customerName));
        return;
    }
    const product = await dbGet(`SELECT * FROM products WHERE id = ?`, [state.productId]);
    if (product.stock < quantidade) {
        await client.sendText(senderId, botMessages.stock_updated_warning.replace('{customerName}', customerName).replace('{productName}', product.name).replace('{stock}', product.stock));
        const rows = [
            { rowId: `notify_stock_id_${product.id}`, title: botMessages.list_option_notify_me },
            { rowId: 'no_thanks', title: botMessages.list_option_no_thanks }
        ];
        await client.sendListMessage(senderId, { buttonText: botMessages.button_options, title: botMessages.out_of_stock_prompt, sections: [{ rows }] });
        delete userState[senderId];
        return;
    }
    if (!carrinhos[senderId]) { carrinhos[senderId] = { items: [], total: 0 }; }
    carrinhos[senderId].items.push({ id: product.id, nome: product.name, qtd: quantidade, preco: product.price, unidade: 'pacote' });
    carrinhos[senderId].total += quantidade * product.price;
    await savePersistentCart(senderId);
    delete userState[senderId];
    const totalItens = carrinhos[senderId].items.length;
    
    const addedToCartMsg = botMessages.item_added_to_cart
        .replace('{customerName}', customerName).replace('{quantity}', quantidade)
        .replace('{productName}', product.name).replace('{itemCount}', totalItens)
        .replace('{total}', carrinhos[senderId].total.toFixed(2));
        
    await client.sendText(senderId, addedToCartMsg);
    await showCustomerMenu(client, senderId, customerName);
}

async function finalizeOrder(client, senderId, customerName, customer) {
    const carrinho = carrinhos[senderId];
    if (!carrinho || carrinho.items.length === 0) {
        await client.sendText(senderId, botMessages.cart_empty.replace('{customerName}', customerName));
        return;
    }

    const minOrderConfig = await dbGet(`SELECT value FROM config WHERE key = 'minOrderValue'`);
    if (carrinho.total < parseFloat(minOrderConfig.value)) {
        await client.sendText(senderId, botMessages.order_below_minimum.replace('{customerName}', customerName).replace('{cartTotal}', carrinho.total.toFixed(2)).replace('{minOrderValue}', parseFloat(minOrderConfig.value).toFixed(2)));
        return;
    }

    for (const item of carrinho.items) {
        const productInDB = await dbGet(`SELECT stock, name FROM products WHERE id = ?`, [item.id]);
        if (productInDB.stock < item.qtd) {
            await client.sendText(senderId, botMessages.stock_updated_warning.replace('{customerName}', customerName).replace('{productName}', productInDB.name).replace('{stock}', productInDB.stock));
            return;
        }
    }

    const now = new Date().toISOString();
    const orderResult = await dbRun(`INSERT INTO orders (customerPhone, totalValue, createdAt) VALUES (?, ?, ?)`, [senderId, carrinho.total, now]);
    const newOrderId = orderResult.lastID;

    for (const item of carrinho.items) {
        await dbRun(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.qtd, item.id]);
        await dbRun(`INSERT INTO order_items (orderId, productId, productName, quantity, pricePerUnit) VALUES (?, ?, ?, ?, ?)`, [newOrderId, item.id, item.nome, item.qtd, item.preco]);
    }
    
    const paymentConfig = await dbGet("SELECT value FROM config WHERE key = 'payment_mercado_pago_enabled'");
    const isPaymentEnabled = paymentConfig.value === 'true';

    if (isPaymentEnabled) {
        try {
            const response = await axios.post(`http://localhost:3000/api/create-payment`, {
                orderId: newOrderId,
                totalValue: carrinho.total,
                customerName: customerName,
                customerPhone: senderId
            });

            const { qrCode, qrCodeCopy } = response.data;
            
            await client.sendText(senderId, botMessages.payment_pix_instructions);
            await client.sendImageFromBase64(senderId, `data:image/png;base64,${qrCode}`, 'qrcode.png');
            await client.sendText(senderId, `${botMessages.payment_pix_code_title}\n\`\`\`${qrCodeCopy}\`\`\``);

        } catch (error) {
            console.error("Erro ao chamar API de criação de pagamento:", error.response?.data || error.message);
            await client.sendText(senderId, "Desculpe, tivemos um problema ao gerar sua cobrança Pix. Por favor, tente novamente mais tarde.");
            for (const item of carrinho.items) {
                await dbRun(`UPDATE products SET stock = stock + ? WHERE id = ?`, [item.qtd, item.id]);
            }
            return;
        }

    } else {
        const adminPhone = (await dbGet(`SELECT value FROM config WHERE key = 'adminPhone'`)).value;
        let itemsText = "";
        carrinho.items.forEach(item => {
            itemsText += botMessages.admin_notification_new_order_item.replace('{quantity}', item.qtd).replace('{unit}', item.unidade || '').replace('{name}', item.nome);
        });
        const pedidoParaAdmin = botMessages.admin_notification_new_order
            .replace('{orderId}', newOrderId).replace('{customerName}', customerName || 'Não identificado')
            .replace('{phone}', senderId.replace('@c.us', '')).replace('{cnpj}', customer.cnpj)
            .replace('{address}', customer.address).replace('{city}', customer.city).replace('{state}', customer.state)
            .replace('{items}', itemsText).replace('{total}', carrinho.total.toFixed(2));
        
        await client.sendText(`${adminPhone}@c.us`, pedidoParaAdmin);

        const confirmationMsg = botMessages.order_confirmation
            .replace('{customerName}', customerName).replace('{orderId}', newOrderId)
            .replace('{total}', carrinho.total.toFixed(2)).replace('{companyName}', NOME_DA_EMPRESA);
        await client.sendText(senderId, confirmationMsg);
    }
    
    carrinhos[senderId] = { items: [], total: 0 };
    await savePersistentCart(senderId);
    
    if (!isPaymentEnabled) {
        const rows = [
            { rowId: 'save_order_yes', title: botMessages.list_option_save_order_yes },
            { rowId: 'save_order_no', title: botMessages.list_option_save_order_no }
        ];
        await client.sendListMessage(senderId, { buttonText: botMessages.button_save, title: botMessages.save_order_prompt, sections: [{ rows }] });
    }
}