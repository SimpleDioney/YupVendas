// =================================================================
// BOT DE VENDAS INTERATIVO - VERSÃO FINAL CORRIGIDA
// =================================================================

const wppconnect = require('@wppconnect-team/wppconnect');
const { db, dbRun, dbGet, dbAll } = require('./database.js');
const axios = require('axios');

const { initializeWebServer } = require('./server.js');

const NOME_DA_EMPRESA = "YUP";

let userState = {};
let carrinhos = {};

// =================================================================
// INICIALIZAÇÃO CORRIGIDA E SIMPLIFICADA
// =================================================================
wppconnect
    .create({
        session: 'bot-vendas',
        catchQR: (base64Qr, asciiQR) => { console.log(asciiQR); },
        statusFind: (statusSession, session) => { console.log('Status da Sessão:', statusSession); },
        headless: true,
    })
    .then((client) => {
        // 1. Inicia o servidor web. Ele agora cuida de si mesmo e retorna a instância 'io'.
        const io = initializeWebServer(client);

        // 2. Inicia a lógica principal do bot, passando o client e o io.
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
        const configAdmin = await dbGet(`SELECT value FROM config WHERE key = 'adminPhone'`);
        const isAdmin = senderId.includes(configAdmin.value);

        if (isAdmin) {
            await handleAdminLogic(client, message);
            return;
        }

        const customer = await dbGet(`SELECT * FROM customers WHERE phone = ?`, [senderId]);
        if (!customer) {
            await client.sendText(configAdmin.value + '@c.us', `Aviso: O número ${senderId.replace('@c.us', '')} tentou usar o bot, mas não está cadastrado.`);
            return;
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
        const result = await dbRun(
            `INSERT INTO messages (customerPhone, messageBody, sender) VALUES (?, ?, 'customer')`,
            [senderId, message.body]
        );
        const savedMessage = await dbGet(`SELECT * FROM messages WHERE id = ?`, [result.lastID]);
        io.emit('newMessage', savedMessage);
        console.log(`Mensagem de ${senderId} salva e notificação emitida.`);
    } catch (e) { console.error("Erro ao salvar/emitir mensagem do cliente:", e); }

    if (customer.isHumanMode) {
        console.log(`Modo Humano ATIVO para ${senderId}. Bot não responderá.`);
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
                { rowId: 'cart_continue', title: 'Sim, continuar comprando' },
                { rowId: 'cart_clear_and_start_new', title: 'Não, esvaziar e começar de novo' }
            ];
            await client.sendListMessage(senderId, {
                buttonText: 'Escolha uma opção',
                title: `Olá de novo, ${customerName}!`,
                description: `Notei que você tem ${carrinhos[senderId].items.length} item(ns) no seu carrinho. Deseja continuar de onde parou?`,
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
        console.log(`Carrinho persistente de ${customerPhone} carregado para o cache.`);
    }
}

async function savePersistentCart(customerPhone) {
    await dbRun(`DELETE FROM persistent_carts WHERE customerPhone = ?`, [customerPhone]);
    const cart = carrinhos[customerPhone];
    if (cart && cart.items.length > 0) {
        for (const item of cart.items) {
            await dbRun(`INSERT INTO persistent_carts (customerPhone, productId, quantity) VALUES (?, ?, ?)`, [customerPhone, item.id, item.qtd]);
        }
        console.log(`Carrinho de ${customerPhone} salvo no banco de dados.`);
    }
}


// =================================================================
// MENUS PRINCIPAIS
// =================================================================
async function showAdminMenu(client, to) {
    userState[to] = {};
    const config = await dbGet(`SELECT value FROM config WHERE key = 'minOrderValue'`);
    const rows = [
        { rowId: 'admin_manage_products', title: '📦 Gerenciar Produtos', description: 'Cadastrar, editar, remover e alterar estoque' },
        { rowId: 'admin_manage_customers', title: '👥 Gerenciar Clientes', description: 'Adicionar ou remover clientes' },
        { rowId: 'admin_reports', title: '📊 Relatórios', description: 'Ver dados de vendas' },
        { rowId: 'admin_set_min_order', title: '💰 Configurar Pedido Mínimo', description: `Valor atual: R$${parseFloat(config.value).toFixed(2)}` }
    ];
    await client.sendListMessage(to, { buttonText: 'Ver Opções', title: 'Painel do Administrador', sections: [{ title: 'Gerenciamento', rows }] });
}

async function showCustomerMenu(client, to, customerName) {
    userState[to] = {};
    if (!carrinhos[to]) { carrinhos[to] = { items: [], total: 0 }; }
    const rows = [
        { rowId: 'customer_view_products', title: '🍎 Ver Produtos' },
        { rowId: 'customer_view_cart', title: '🛒 Ver Carrinho', description: `Itens: ${carrinhos[to]?.items.length || 0} | Total: R$${carrinhos[to]?.total.toFixed(2) || '0.00'}` },
        { rowId: 'customer_load_saved_order', title: '⭐ Carregar Pedido Padrão' },
        { rowId: 'customer_order_history', title: '📜 Histórico de Compras' }
    ];
    await client.sendListMessage(to, {
        buttonText: 'Ver Opções',
        title: `👋 Olá, ${customerName}! Bem-vindo(a) à ${NOME_DA_EMPRESA}!`,
        description: 'Selecione uma opção abaixo para começar suas compras.',
        sections: [{ title: 'Navegação', rows }]
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
            await client.sendText(senderId, `✅ Cliente *${state.apiData.razao_social}* cadastrado com sucesso!`);
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT') { await client.sendText(senderId, '⚠️ Este cliente já está cadastrado.'); }
            else { console.error(err); await client.sendText(senderId, 'Ocorreu um erro ao cadastrar.'); }
        }
        delete userState[senderId];
        await showAdminMenu(client, senderId);
        return;
    } else if (rowId === 'confirm_cnpj_no') {
        userState[senderId] = { ...state, stage: 'admin_add_customer_address' };
        await client.sendText(senderId, 'Ok, vamos para o cadastro manual.\n\nPor favor, digite o *endereço* completo (Rua, Número, Bairro):');
        return;
    }
    if (rowId === 'admin_manage_customers') {
        const rows = [{ rowId: 'customer_add', title: 'Adicionar Cliente' }, { rowId: 'customer_remove', title: 'Remover Cliente' }];
        await client.sendListMessage(senderId, { buttonText: 'Opções', title: 'Gerenciar Clentes', sections: [{ rows }] });
    } else if (rowId === 'customer_add') {
        userState[senderId] = { stage: 'admin_add_customer_phone' };
        await client.sendText(senderId, 'Digite o número do cliente (formato DDI+DDD+Numero, ex: 5543999998888)');
    } else if (rowId === 'customer_remove') {
        const customers = await dbAll(`SELECT phone FROM customers`);
        if (customers.length === 0) { await client.sendText(senderId, 'Não há clientes para remover.'); return; }
        const rows = customers.map(c => ({ rowId: `customer_remove_phone_${c.phone}`, title: c.phone.replace('@c.us', '') }));
        await client.sendListMessage(senderId, { buttonText: 'Clientes', title: 'Remover Cliente', sections: [{ title: 'Selecione um cliente para remover', rows }] });
    } else if (rowId.startsWith('customer_remove_phone_')) {
        const phoneToRemove = rowId.replace('customer_remove_phone_', '');
        await dbRun(`DELETE FROM customers WHERE phone = ?`, [phoneToRemove]);
        await client.sendText(senderId, `✅ Cliente ${phoneToRemove.replace('@c.us', '')} removido com sucesso!`);
    }
    else if (rowId === 'admin_manage_products') {
        const rows = [
            { rowId: 'admin_add_product', title: '➕ Cadastrar Novo Produto' },
            { rowId: 'admin_edit_product_menu', title: '✏️ Editar/Remover Produto Existente' }
        ];
        await client.sendListMessage(senderId, { buttonText: 'Ações', title: 'Gerenciar Produtos', sections: [{ rows }] });
    } else if (rowId === 'admin_add_product') {
        userState[senderId] = { stage: 'admin_add_product_name' };
        await client.sendText(senderId, 'Ok, digite o *nome* do novo produto:');
    } else if (rowId === 'admin_edit_product_menu') {
        const produtos = await dbAll(`SELECT id, name, stock FROM products`);
        if (produtos.length === 0) { await client.sendText(senderId, 'Não há produtos cadastrados.'); return; }
        const rows = produtos.map(p => ({ rowId: `product_manage_id_${p.id}`, title: p.name, description: `Estoque: ${p.stock} pacotes` }));
        await client.sendListMessage(senderId, { buttonText: 'Produtos', title: 'Selecione um Produto', sections: [{ rows }] });
    } else if (rowId.startsWith('product_manage_id_')) {
        const productId = parseInt(rowId.replace('product_manage_id_', ''));
        const product = await dbGet(`SELECT name FROM products WHERE id = ?`, [productId]);
        userState[senderId] = { productId };
        const rows = [
            { rowId: `edit_field_name`, title: '✏️ Alterar Nome' },
            { rowId: `edit_field_price`, title: '💰 Alterar Preço' },
            { rowId: `stock_add`, title: '➕ Adicionar ao Estoque' },
            { rowId: `stock_remove`, title: '➖ Remover do Estoque' },
            { rowId: `product_delete`, title: '🗑️ Apagar Produto' }
        ];
        await client.sendListMessage(senderId, { buttonText: 'Ações', title: `O que fazer com ${product.name}?`, sections: [{ rows }] });
    }
    else if (rowId.startsWith('edit_field_')) {
        const field = rowId.replace('edit_field_', '');
        userState[senderId].stage = `admin_edit_product_${field}`;
        await client.sendText(senderId, `Ok, digite o novo *${field.toUpperCase()}* do produto:`);
    }
    else if (rowId === 'stock_add') {
        userState[senderId].stage = 'admin_stock_add_qty';
        await client.sendText(senderId, `Ok. Quantos pacotes você quer *adicionar*?`);
    } else if (rowId === 'stock_remove') {
        userState[senderId].stage = 'admin_stock_remove_qty';
        await client.sendText(senderId, `Ok. Quantos pacotes você quer *remover*?`);
    } else if (rowId === 'product_delete') {
        userState[senderId].stage = 'admin_delete_product_confirm';
        await client.sendText(senderId, '⚠️ *ATENÇÃO!* Tem certeza que quer remover este produto? A ação não pode ser desfeita.\n\nDigite `SIM` para confirmar.');
    }
    else if (rowId === 'content_type_unidade' || rowId === 'content_type_peso') {
        const contentType = rowId.replace('content_type_', '');
        userState[senderId].contentType = contentType;
        userState[senderId].stage = 'admin_add_product_content_value';
        if (contentType === 'unidade') {
            await client.sendText(senderId, 'Entendido. Quantas *unidades* vêm neste pacote?');
        } else {
            await client.sendText(senderId, 'Entendido. Qual o *peso em kg* deste pacote? (ex: 1.2)');
        }
    }
    else if (rowId === 'admin_reports') {
        const rows = [
            { rowId: 'report_top_products', title: '🏆 Produtos Mais Vendidos' },
            { rowId: 'report_top_customers', title: '⭐ Clientes que Mais Compram' }
        ];
        await client.sendListMessage(senderId, { buttonText: 'Relatórios', title: 'Gerar Relatório', sections: [{ rows }] });
    } else if (rowId === 'report_top_products') {
        const topProducts = await dbAll(`SELECT productName, SUM(quantity) as total_sold FROM order_items GROUP BY productName ORDER BY total_sold DESC LIMIT 5`);
        let report = '🏆 *Top 5 Produtos Mais Vendidos*\n\n';
        if (topProducts.length === 0) { report += 'Nenhum pedido registrado ainda.'; }
        else { topProducts.forEach((p, i) => { report += `${i + 1}º - *${p.productName}*: ${p.total_sold} pacotes vendidos\n`; }); }
        await client.sendText(senderId, report);
    } else if (rowId === 'report_top_customers') {
        const topCustomers = await dbAll(`SELECT o.customerPhone, COUNT(o.id) as total_orders, SUM(o.totalValue) as total_spent FROM orders o GROUP BY o.customerPhone ORDER BY total_spent DESC LIMIT 5`);
        let report = '⭐ *Top 5 Clientes*\n\n';
        if (topCustomers.length === 0) { report += 'Nenhum pedido registrado ainda.'; }
        else { topCustomers.forEach((c, i) => { report += `${i + 1}º - *${c.customerPhone.replace('@c.us', '')}*\n  Pedidos: ${c.total_orders} | Total Gasto: R$${c.total_spent.toFixed(2)}\n`; }); }
        await client.sendText(senderId, report);
    }
    else if (rowId === 'admin_set_min_order') {
        userState[senderId] = { stage: 'admin_set_min_order_value' };
        await client.sendText(senderId, 'Digite o *novo valor* do pedido mínimo:');
    }
}

async function handleAdminTextInput(client, senderId, text, wppClient) {
    const state = userState[senderId];
    if (!state || !state.stage) return;

    switch (state.stage) {
        case 'admin_add_customer_phone':
            userState[senderId] = { stage: 'admin_add_customer_cnpj', phone: text.replace(/\D/g, '') + '@c.us' };
            await client.sendText(senderId, 'Telefone salvo. Agora digite o *CNPJ* do cliente (apenas números):');
            break;
        case 'admin_add_customer_cnpj':
            const cnpj = text.replace(/\D/g, '');
            userState[senderId].cnpj = cnpj;
            await client.sendText(senderId, `Consultando CNPJ: ${cnpj}... ⏳`);
            try {
                const response = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
                if (response.data) {
                    const data = response.data;
                    const fullAddress = `${data.descricao_tipo_de_logradouro || ''} ${data.logradouro || ''}, ${data.numero || ''} - ${data.bairro || ''} ${data.complemento || ''}`.trim();
                    userState[senderId].apiData = { razao_social: data.razao_social, address: fullAddress, city: data.municipio, state: data.uf };
                    let confirmationMessage = `*Dados Encontrados:*\n\n` + `*Razão Social:* ${data.razao_social}\n` + `*Endereço:* ${fullAddress}\n` + `*Município:* ${data.municipio} / ${data.uf}\n\n` + `Os dados estão corretos?`;
                    await client.sendText(senderId, confirmationMessage);
                    const rows = [{ rowId: 'confirm_cnpj_yes', title: 'Sim, cadastrar esta empresa' }, { rowId: 'confirm_cnpj_no', title: 'Não, digitar dados manualmente' }];
                    await client.sendListMessage(senderId, { buttonText: 'Confirmar', title: 'Confirmação de Dados', sections: [{ rows }] });
                    userState[senderId].stage = 'awaiting_cnpj_confirmation';
                }
            } catch (error) {
                console.error("Erro na API de CNPJ:", error.message);
                await client.sendText(senderId, `❌ Não foi possível consultar o CNPJ. Vamos seguir com o cadastro manual.\n\nPor favor, digite o *endereço* completo:`);
                userState[senderId].stage = 'admin_add_customer_address';
            }
            break;
        case 'admin_add_customer_address':
            userState[senderId].address = text;
            userState[senderId].stage = 'admin_add_customer_city';
            await client.sendText(senderId, 'Endereço salvo. Qual a *cidade*?');
            break;
        case 'admin_add_customer_city':
            userState[senderId].city = text;
            userState[senderId].stage = 'admin_add_customer_state_manual';
            await client.sendText(senderId, 'Cidade salva. Por último, o *Estado* (sigla, ex: PR):');
            break;
        case 'admin_add_customer_state_manual':
            userState[senderId].state = text;
            try {
                await dbRun(`INSERT INTO customers (phone, cnpj, address, city, state) VALUES (?, ?, ?, ?, ?)`,
                    [state.phone, state.cnpj, state.address, state.city, state.state]);
                await client.sendText(senderId, `✅ Cliente cadastrado com sucesso (manualmente)!`);
            } catch (err) {
                if (err.code === 'SQLITE_CONSTRAINT') { await client.sendText(senderId, '⚠️ Este cliente já está cadastrado.'); }
                else { console.error(err); await client.sendText(senderId, 'Ocorreu um erro ao cadastrar.'); }
            }
            delete userState[senderId];
            break;
        case 'admin_add_product_name':
            userState[senderId] = { stage: 'admin_add_product_price', name: text };
            await client.sendText(senderId, `Nome: *${text}*.\n\nAgora, digite o *preço do pacote*:`);
            break;
        case 'admin_add_product_price':
            userState[senderId].price = parseFloat(text.replace(',', '.'));
            userState[senderId].stage = 'admin_add_product_stock';
            await client.sendText(senderId, `Preço: *R$${text}*.\n\nQuantos *pacotes* você tem em estoque?`);
            break;
        case 'admin_add_product_stock':
            userState[senderId].stock = parseFloat(text.replace(',', '.'));
            const rows = [
                { rowId: 'content_type_unidade', title: 'Unidades', description: 'Ex: um pacote com 6 croissants' },
                { rowId: 'content_type_peso', title: 'Peso (kg)', description: 'Ex: um pacote de carne com 1.2 kg' }
            ];
            await client.sendListMessage(senderId, { buttonText: 'Tipo de Conteúdo', title: 'Como o conteúdo do pacote é medido?', sections: [{ rows }] });
            userState[senderId].stage = 'awaiting_content_type';
            break;
        case 'admin_add_product_content_value':
            userState[senderId].contentValue = parseFloat(text.replace(',', '.'));
            try {
                await dbRun(`INSERT INTO products (name, price, stock, contentType, contentValue) VALUES (?, ?, ?, ?, ?)`,
                    [state.name, state.price, state.stock, state.contentType, state.contentValue]);
                await client.sendText(senderId, `✅ Produto *${state.name}* cadastrado com sucesso!`);
            } catch (err) {
                console.error(err);
                await client.sendText(senderId, 'Ocorreu um erro ao cadastrar o produto.');
            }
            delete userState[senderId];
            await showAdminMenu(client, senderId);
            break;
        case 'admin_edit_product_name':
            await dbRun(`UPDATE products SET name = ? WHERE id = ?`, [text, state.productId]);
            await client.sendText(senderId, `✅ Nome do produto alterado para *${text}*`);
            delete userState[senderId];
            break;
        case 'admin_edit_product_price':
            const newPrice = parseFloat(text.replace(',', '.'));
            if (isNaN(newPrice) || newPrice < 0) { await client.sendText(senderId, "Preço inválido."); return; }
            await dbRun(`UPDATE products SET price = ? WHERE id = ?`, [newPrice, state.productId]);
            await client.sendText(senderId, `✅ Preço atualizado para R$${newPrice.toFixed(2)}.`);
            delete userState[senderId];
            break;

        case 'admin_stock_add_qty':
            const product_add = await dbGet(`SELECT name, stock FROM products WHERE id = ?`, [state.productId]);
            const qty_add = parseFloat(text.replace(',', '.'));
            if (isNaN(qty_add) || qty_add <= 0) { await client.sendText(senderId, "Quantidade inválida."); return; }

            const newStock_add = product_add.stock + qty_add;
            await dbRun(`UPDATE products SET stock = ? WHERE id = ?`, [newStock_add, state.productId]);
            await client.sendText(senderId, `✅ Estoque de *${product_add.name}* atualizado para *${newStock_add}*`);

            const notifications = await dbAll(`SELECT customerPhone FROM stock_notifications WHERE productId = ?`, [state.productId]);
            if (notifications.length > 0) {
                await client.sendText(senderId, `Enviando notificação de volta ao estoque para ${notifications.length} cliente(s)...`);
                for (const notif of notifications) {
                    await wppClient.sendText(notif.customerPhone, `🎉 Boas notícias! O produto *${product_add.name}* que você queria está de volta ao estoque!`);
                }
                await dbRun(`DELETE FROM stock_notifications WHERE productId = ?`, [state.productId]);
            }

            delete userState[senderId];
            await showAdminMenu(client, senderId);
            break;

        case 'admin_stock_remove_qty':
            const product_remove = await dbGet(`SELECT name, stock FROM products WHERE id = ?`, [state.productId]);
            const qty_remove = parseFloat(text.replace(',', '.'));
            if (isNaN(qty_remove) || qty_remove <= 0) { await client.sendText(senderId, "Quantidade inválida."); return; }

            if (product_remove.stock < qty_remove) { await client.sendText(senderId, `Não é possível remover *${qty_remove}*. Estoque atual: *${product_remove.stock}*.`); return; }
            const newStock_remove = product_remove.stock - qty_remove;
            await dbRun(`UPDATE products SET stock = ? WHERE id = ?`, [newStock_remove, state.productId]);
            await client.sendText(senderId, `✅ Estoque de *${product_remove.name}* atualizado para *${newStock_remove}*`);

            delete userState[senderId];
            await showAdminMenu(client, senderId);
            break;

        case 'admin_delete_product_confirm':
            if (text.toUpperCase() === 'SIM') {
                await dbRun(`DELETE FROM products WHERE id = ?`, [state.productId]);
                await client.sendText(senderId, `✅ Produto removido com sucesso.`);
            } else {
                await client.sendText(senderId, `Operação cancelada.`);
            }
            delete userState[senderId];
            break;
        case 'admin_set_min_order_value':
            const minOrder = parseFloat(text.replace(',', '.'));
            await dbRun(`UPDATE config SET value = ? WHERE key = 'minOrderValue'`, [minOrder]);
            delete userState[senderId];
            await client.sendText(senderId, `✅ Pedido mínimo alterado para *R$${minOrder.toFixed(2)}*!`);
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
        await client.sendText(senderId, "Ok, seu carrinho anterior foi esvaziado. Vamos começar um novo!");
        await showCustomerMenu(client, senderId, customerName);
        return;
    }
    if (rowId.startsWith('notify_stock_id_')) {
        const productId = parseInt(rowId.replace('notify_stock_id_', ''));
        try {
            await dbRun(`INSERT INTO stock_notifications (customerPhone, productId) VALUES (?, ?)`, [senderId, productId]);
            await client.sendText(senderId, `✅ Combinado, ${customerName}! Você será a primeira pessoa a saber quando este produto voltar ao estoque.`);
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                await client.sendText(senderId, `Você já está na lista de espera para este produto, ${customerName}. Avisaremos assim que chegar!`);
            }
        }
        return;
    }
    if (rowId === 'customer_order_history') {
        const orders = await dbAll(`SELECT id, totalValue, createdAt FROM orders WHERE customerPhone = ? ORDER BY createdAt DESC LIMIT 5`, [senderId]);
        if (orders.length === 0) {
            await client.sendText(senderId, `Você ainda não fez nenhum pedido conosco, ${customerName}.`);
            return;
        }
        let historyText = `📜 *Seus últimos 5 pedidos, ${customerName}:*\n\n`;
        for (const order of orders) {
            const date = new Date(order.createdAt).toLocaleDateString('pt-BR');
            historyText += `*Pedido #${order.id}* - ${date}\n`;
            historyText += `*Valor:* R$${order.totalValue.toFixed(2)}\n`;
            const items = await dbAll(`SELECT productName, quantity FROM order_items WHERE orderId = ?`, [order.id]);
            items.forEach(item => {
                historyText += `  - ${item.quantity}x ${item.productName}\n`;
            });
            historyText += `\n`;
        }
        await client.sendText(senderId, historyText);
        return;
    }
    if (rowId === 'customer_view_products') {
        const produtos = await dbAll(`SELECT * FROM products WHERE stock > 0`);
        if (produtos.length === 0) { await client.sendText(senderId, `🙁 Poxa, ${customerName}, parece que estamos sem produtos no estoque no momento.`); return; }
        const rows = produtos.map(p => {
            let description = `R$ ${p.price.toFixed(2)} por pacote`;
            if (p.contentType === 'unidade') {
                description += ` (contém ${p.contentValue} unidades)`;
            } else if (p.contentType === 'peso') {
                description += ` (aprox. ${p.contentValue} kg)`;
            }
            return { rowId: `product_id_${p.id}`, title: p.name, description: description };
        });
        await client.sendListMessage(senderId, { buttonText: 'Ver Produtos', title: 'Nossos Produtos', description: `Estes são os pacotes disponíveis hoje, ${customerName}.`, sections: [{ title: 'Disponíveis Hoje', rows }] });
    } else if (rowId.startsWith('product_id_')) {
        const productId = parseInt(rowId.replace('product_id_', ''));
        const product = await dbGet(`SELECT * FROM products WHERE id = ?`, [productId]);
        if (product) {
            userState[senderId] = { stage: 'customer_add_quantity', productId: product.id };
            let instructionText = `Ótima escolha, ${customerName}! Você selecionou *${product.name}*.\n\n`;
            instructionText += 'Agora, me diga a *quantidade de pacotes* que você deseja:';
            await client.sendText(senderId, instructionText);
        }
    } else if (rowId === 'customer_view_cart') {
        const carrinho = carrinhos[senderId];
        if (!carrinho || carrinho.items.length === 0) { await client.sendText(senderId, `${customerName}, seu carrinho ainda está vazio. Que tal escolher alguns produtos?`); return; }
        let cartText = `🛒 *Este é o seu carrinho, ${customerName}:*\n\n`;
        carrinho.items.forEach(item => { cartText += `• ${item.nome}: ${item.qtd} ${item.unidade} x R$${item.preco.toFixed(2)} = *R$${(item.qtd * item.preco).toFixed(2)}*\n`; });
        cartText += `\n*Total: R$${carrinho.total.toFixed(2)}*`;
        await client.sendText(senderId, cartText);
        const rows = [{ rowId: 'cart_finalize', title: '✅ Finalizar Pedido' }, { rowId: 'cart_add_more', title: '➕ Adicionar Mais Itens' }, { rowId: 'cart_clear', title: '❌ Esvaziar Carrinho' }];
        await client.sendListMessage(senderId, { buttonText: 'Opções', title: 'O que deseja fazer agora?', sections: [{ rows }] });
    } else if (rowId === 'cart_add_more') {
        await handleCustomerListResponse(client, senderId, 'customer_view_products', customerName, customer);
    } else if (rowId === 'cart_clear') {
        carrinhos[senderId] = { items: [], total: 0 };
        await savePersistentCart(senderId);
        await client.sendText(senderId, "Prontinho! Seu carrinho foi esvaziado.");
    } else if (rowId === 'cart_finalize') {
        const carrinho = carrinhos[senderId];
        if (!carrinho || carrinho.items.length === 0) { await client.sendText(senderId, `Ops, ${customerName}, seu carrinho está vazio. Adicione alguns itens antes de finalizar.`); return; }
        const minOrderConfig = await dbGet(`SELECT value FROM config WHERE key = 'minOrderValue'`);
        if (carrinho.total < parseFloat(minOrderConfig.value)) { await client.sendText(senderId, `Quase lá, ${customerName}! Seu pedido está em R$${carrinho.total.toFixed(2)} e nosso pedido mínimo é de R$${parseFloat(minOrderConfig.value).toFixed(2)}. Falta pouco!`); return; }
        for (const item of carrinho.items) {
            const productInDB = await dbGet(`SELECT stock, name FROM products WHERE id = ?`, [item.id]);
            if (productInDB.stock < item.qtd) {
                await client.sendText(senderId, `Ops, ${customerName}! Parece que nosso estoque de *${productInDB.name}* foi atualizado. Temos apenas ${productInDB.stock} em estoque agora. Por favor, remova o item do carrinho e adicione novamente com a quantidade correta.`);
                return;
            }
        }
        const adminPhone = (await dbGet(`SELECT value FROM config WHERE key = 'adminPhone'`)).value;
        const now = new Date().toISOString();
        const orderResult = await dbRun(`INSERT INTO orders (customerPhone, totalValue, createdAt) VALUES (?, ?, ?)`, [senderId, carrinho.total, now]);
        const newOrderId = orderResult.lastID;
        for (const item of carrinho.items) {
            await dbRun(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.qtd, item.id]);
            await dbRun(`INSERT INTO order_items (orderId, productId, productName, quantity, pricePerUnit) VALUES (?, ?, ?, ?, ?)`,
                [newOrderId, item.id, item.nome, item.qtd, item.preco]);
        }
        let pedidoParaAdmin = `🔔 *Novo Pedido #${newOrderId}* 🔔\n\n`;
        pedidoParaAdmin += `*Cliente:* ${customerName || 'Não identificado'} (${senderId.replace('@c.us', '')})\n`;
        pedidoParaAdmin += `*CNPJ:* ${customer.cnpj}\n`;
        pedidoParaAdmin += `*Endereço:* ${customer.address}, ${customer.city} - ${customer.state}\n\n`;
        pedidoParaAdmin += `*Itens do Pedido:*\n`;
        carrinho.items.forEach(item => { pedidoParaAdmin += `• ${item.qtd} ${item.unidade || ''} de ${item.nome}\n`; });
        pedidoParaAdmin += `\n*TOTAL DO PEDIDO: R$${carrinho.total.toFixed(2)}*`;
        await client.sendText(`${adminPhone}@c.us`, pedidoParaAdmin);
        await client.sendText(senderId, `Perfeito, ${customerName}! Seu pedido *#${newOrderId}* no valor de *R$${carrinho.total.toFixed(2)}* foi confirmado! ✅\n\nJá estamos separando seus produtos. A ${NOME_DA_EMPRESA} agradece a sua preferência!`);
        carrinhos[senderId] = { items: [], total: 0 };
        await savePersistentCart(senderId);
        const rows = [{ rowId: 'save_order_yes', title: 'Sim, salvar como pedido padrão' }, { rowId: 'save_order_no', title: 'Não, obrigado(a)' }];
        await client.sendListMessage(senderId, { buttonText: 'Salvar?', title: 'Deseja salvar este pedido para facilitar suas próximas compras?', sections: [{ rows }] });
    } else if (rowId === 'save_order_yes') {
        const lastOrder = await dbGet(`SELECT id FROM orders WHERE customerPhone = ? ORDER BY createdAt DESC LIMIT 1`, [senderId]);
        const lastOrderItems = await dbAll(`SELECT productId, quantity FROM order_items WHERE orderId = ?`, [lastOrder.id]);
        await dbRun(`DELETE FROM saved_orders WHERE customerPhone = ?`, [senderId]);
        for (const item of lastOrderItems) {
            if (item.productId) {
                await dbRun(`INSERT INTO saved_orders (customerPhone, productId, quantity) VALUES (?, ?, ?)`, [senderId, item.productId, item.quantity]);
            }
        }
        await client.sendText(senderId, '⭐ Ótimo! Seu pedido foi salvo como padrão. Até a próxima!');
    } else if (rowId === 'save_order_no') {
        await client.sendText(senderId, 'Sem problemas! Agradecemos novamente e até a próxima!');
    } else if (rowId === 'customer_load_saved_order') {
        const savedItems = await dbAll(`SELECT p.id, p.name, p.price, s.quantity as qtd FROM saved_orders s JOIN products p ON s.productId = p.id WHERE s.customerPhone = ?`, [senderId]);
        if (savedItems.length === 0) { await client.sendText(senderId, `${customerName}, você ainda não tem um pedido padrão salvo.`); return; }
        carrinhos[senderId] = { items: [], total: 0 };
        for (const item of savedItems) {
            const product = await dbGet(`SELECT stock FROM products WHERE id = ?`, [item.id]);
            if (product && product.stock >= item.qtd) {
                carrinhos[senderId].items.push({ id: item.id, nome: item.name, qtd: item.qtd, preco: item.price, unidade: 'pacote' });
                carrinhos[senderId].total += item.qtd * item.price;
            }
        }
        await savePersistentCart(senderId);
        await client.sendText(senderId, `Pronto, ${customerName}! Seu pedido padrão foi carregado no carrinho. Clique em 'Ver Carrinho' para conferir e finalizar a compra.`);
    }
}

async function handleCustomerTextInput(client, senderId, text, customerName) {
    const state = userState[senderId];
    if (!state || state.stage !== 'customer_add_quantity') return;
    const quantidade = parseInt(text.replace(/\D/g, ''));
    if (isNaN(quantidade) || quantidade <= 0 || !Number.isInteger(quantidade)) {
        await client.sendText(senderId, `Por favor, ${customerName}, digite um número inteiro válido de pacotes.`);
        return;
    }
    const product = await dbGet(`SELECT * FROM products WHERE id = ?`, [state.productId]);
    if (product.stock < quantidade) {
        await client.sendText(senderId, `Ah, que pena, ${customerName}. No momento, temos apenas ${product.stock} pacotes de *${product.name}* em estoque.`);
        const rows = [{ rowId: `notify_stock_id_${product.id}`, title: 'Sim, por favor me avise!' }, { rowId: 'no_thanks', title: 'Não, obrigado.' }];
        await client.sendListMessage(senderId, { buttonText: 'Opções', title: 'Gostaria de ser avisado(a) quando este produto voltar ao estoque?', sections: [{ rows }] });
        delete userState[senderId];
        return;
    }
    if (!carrinhos[senderId]) { carrinhos[senderId] = { items: [], total: 0 }; }
    carrinhos[senderId].items.push({ id: product.id, nome: product.name, qtd: quantidade, preco: product.price, unidade: 'pacote' });
    carrinhos[senderId].total += quantidade * product.price;
    await savePersistentCart(senderId);
    delete userState[senderId];
    const totalItens = carrinhos[senderId].items.length;
    await client.sendText(senderId, `Prontinho, ${customerName}! Adicionei *${quantidade} pacote(s) de ${product.name}*. ✅\n\nSeu carrinho agora tem ${totalItens} item(ns), totalizando *R$${carrinhos[senderId].total.toFixed(2)}*`);
    await showCustomerMenu(client, senderId, customerName);
}